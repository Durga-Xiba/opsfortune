/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GameConfig, GameState, TimerStatus } from './types/game';
import {
  getInitialConfig,
  getInitialState,
  saveConfig,
  saveState,
  createFreshState,
  TOTAL_QUESTIONS,
} from './utils/gameState';
import {
  subscribeToGameState,
  subscribeToGameConfig,
  subscribeToConnectionHealth,
  saveGameStateToFirebase,
  saveGameConfigToFirebase,
  fetchInitialGameStateFromFirebase,
  fetchInitialGameConfigFromFirebase,
} from './utils/firebaseSync';
import { soundEngine } from './utils/audio';
import { DEFAULT_QUESTIONS } from './data/defaultQuestions';
import { HostControl } from './components/HostControl';
import { ProjectorView } from './components/ProjectorView';
import { AdminEditor } from './components/AdminEditor';
import { FirebaseSyncStatus } from './components/FirebaseSyncStatus';
import { Monitor, Sliders, PlayCircle } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<GameConfig>(getInitialConfig);
  const [state, setState] = useState<GameState>(getInitialState);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);

  // Active role/view persistence (preserves Projector View on Android APK reboot)
  const [activeTab, setActiveTab] = useState<'host' | 'projector' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        if (view === 'projector') return 'projector';
        if (view === 'host') return 'host';
        const saved = localStorage.getItem('ops_fortune_active_role');
        if (saved === 'projector' || saved === 'host' || saved === 'admin') {
          return saved;
        }
      } catch {
        // safe
      }
    }
    return 'host';
  });

  const handleSelectTab = useCallback((tab: 'host' | 'projector' | 'admin') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ops_fortune_active_role', tab);
      } catch {
        // safe
      }
    }
  }, []);

  const [popupBlockedNotice, setPopupBlockedNotice] = useState<boolean>(false);

  // Reference to external projector window and mount DOM node for desktop browser multi-window
  const projectorWindowRef = useRef<Window | null>(null);
  const [projectorMountNode, setProjectorMountNode] = useState<HTMLElement | null>(null);

  // Keep ref to latest state and config for event handlers and intervals
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  const configRef = useRef<GameConfig>(config);
  configRef.current = config;

  // Sound deduplication set keyed by `${questionIndex}_${checkpoint}` to prevent any duplicate audio
  const playedSoundsRef = useRef<Set<string>>(new Set());

  // Sync in-memory deduplication set with existing buzzerHistory (e.g. after refresh/crash recovery)
  useEffect(() => {
    if (Array.isArray(state.buzzerHistory)) {
      const qIdx = state.currentQuestionIndex;
      state.buzzerHistory.forEach((cp) => {
        playedSoundsRef.current.add(`${qIdx}_${cp}`);
      });
    }
  }, [state.currentQuestionIndex, state.buzzerHistory]);

  // Authoritative Host state commit: writes to local storage AND pushes to Firebase Realtime Database
  const commitHostState = useCallback((nextState: GameState) => {
    setState(nextState);
    stateRef.current = nextState;
    saveState(nextState);
    saveGameStateToFirebase(nextState).catch((err) => {
      console.warn('Firebase state write fallback to local:', err);
    });
  }, []);

  // Firebase Realtime Subscriptions (Cross-APK synchronization)
  useEffect(() => {
    let unsubState: (() => void) | null = null;
    let unsubConfig: (() => void) | null = null;
    let unsubHealth: (() => void) | null = null;

    // 1. Connection health monitoring
    unsubHealth = subscribeToConnectionHealth((connected) => {
      setIsFirebaseConnected(connected);
    });

    // 2. Fetch initial state & config on startup / crash recovery
    const initBootstrap = async () => {
      try {
        const remoteState = await fetchInitialGameStateFromFirebase();
        if (remoteState) {
          setState(remoteState);
          stateRef.current = remoteState;
          saveState(remoteState);
        } else if (activeTab === 'host') {
          // If no remote state exists in Firebase yet, Host seeds the initial state
          saveGameStateToFirebase(stateRef.current).catch(() => {});
        }

        const remoteConfig = await fetchInitialGameConfigFromFirebase();
        if (remoteConfig) {
          setConfig(remoteConfig);
          configRef.current = remoteConfig;
          saveConfig(remoteConfig);
        } else if (activeTab === 'host') {
          saveGameConfigToFirebase(configRef.current).catch(() => {});
        }
      } catch (e) {
        console.warn('Bootstrap fetch error, using local state:', e);
      }
    };

    initBootstrap();

    // 3. Realtime listener for game state from Firebase
    unsubState = subscribeToGameState((incomingState) => {
      setState((prev) => {
        // Trigger wrong guess audio if an incoming update recorded a new wrong guess
        if (
          incomingState.lastWrongGuessTimestamp &&
          incomingState.lastWrongGuessTimestamp !== prev.lastWrongGuessTimestamp
        ) {
          soundEngine.playWrongGuessSound();
        }
        return incomingState;
      });
      stateRef.current = incomingState;
      saveState(incomingState);
    });

    // 4. Realtime listener for game config from Firebase
    unsubConfig = subscribeToGameConfig((incomingConfig) => {
      setConfig(incomingConfig);
      configRef.current = incomingConfig;
      saveConfig(incomingConfig);
    });

    return () => {
      if (unsubState) unsubState();
      if (unsubConfig) unsubConfig();
      if (unsubHealth) unsubHealth();
    };
  }, [activeTab]);

  // High-frequency Authoritative Timer Tick
  // Both Host and Projector calculate remaining time from the same timerEndTime
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.timerStatus !== 'RUNNING' || !currentState.timerEndTime) {
        return;
      }

      const now = Date.now();
      const rawRemaining = Math.max(0, Math.ceil((currentState.timerEndTime - now) / 1000));
      const qIdx = currentState.currentQuestionIndex;

      // EXACT CHECKPOINTS: 01:50, 01:40, 01:30, 01:20, 01:10, 01:00
      // STRICTLY NO BUZZER AT 00:50, 00:40, 00:30, 00:20 or 00:10
      const intermediateCheckpoints = [110, 100, 90, 80, 70, 60];
      const newBuzzerHistory = [...currentState.buzzerHistory];

      for (const cp of intermediateCheckpoints) {
        const soundKey = `${qIdx}_${cp}`;
        if (rawRemaining <= cp && !newBuzzerHistory.includes(cp)) {
          newBuzzerHistory.push(cp);
          if (!playedSoundsRef.current.has(soundKey)) {
            playedSoundsRef.current.add(soundKey);
            if (cp === 60) {
              // 7. 01:00 Checkpoint: LONG + MAX VOLUME BUZZER (Participant answer time is OVER)
              soundEngine.play0100TimeUpBuzzer();
            } else {
              // 2-6. 01:50, 01:40, 01:30, 01:20, 01:10 Checkpoints: Medium + HIGH-VOLUME BUZZER
              soundEngine.playMediumBuzzer();
            }
          }
        }
      }

      // 8. 00:00 Checkpoint: LONG + MAX VOLUME FINAL BUZZER (Round completely over)
      if (rawRemaining <= 0) {
        const soundKey0 = `${qIdx}_0`;
        if (!newBuzzerHistory.includes(0)) {
          newBuzzerHistory.push(0);
          if (!playedSoundsRef.current.has(soundKey0)) {
            playedSoundsRef.current.add(soundKey0);
            soundEngine.playFinalBuzzer();
          }
        }

        const timeUpState: GameState = {
          ...currentState,
          timerRemaining: 0,
          timerStatus: 'TIME_UP',
          timerEndTime: null,
          buzzerHistory: newBuzzerHistory,
          lastUpdated: Date.now(),
        };

        setState(timeUpState);
        stateRef.current = timeUpState;
        saveState(timeUpState);

        // Host writes TIME_UP authoritatively to Firebase
        if (activeTab === 'host') {
          saveGameStateToFirebase(timeUpState).catch(() => {});
        }
        return;
      }

      // Smooth local UI countdown without spamming Firebase on every second
      if (
        rawRemaining !== currentState.timerRemaining ||
        newBuzzerHistory.length !== currentState.buzzerHistory.length
      ) {
        const nextState: GameState = {
          ...currentState,
          timerRemaining: rawRemaining,
          buzzerHistory: newBuzzerHistory,
        };
        setState(nextState);
        stateRef.current = nextState;
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Host Action Handlers
  const handleStartTimer = () => {
    soundEngine.unlock();
    const currentState = stateRef.current;
    if (currentState.timerStatus === 'RUNNING' || currentState.timerRemaining <= 0) {
      return;
    }

    const duration = currentState.timerRemaining;
    const nextEndTime = Date.now() + duration * 1000;
    const newBuzzerHistory = [...currentState.buzzerHistory];
    const qIdx = currentState.currentQuestionIndex;

    // 1. 02:00 Checkpoint: LONG + MAX VOLUME BUZZER immediately when Host presses START
    const startKey = `${qIdx}_120`;
    if (duration >= 119 && !newBuzzerHistory.includes(120) && !playedSoundsRef.current.has(startKey)) {
      playedSoundsRef.current.add(startKey);
      newBuzzerHistory.push(120);
      soundEngine.play0200StartBuzzer();
    }

    const nextState: GameState = {
      ...currentState,
      timerStatus: 'RUNNING',
      timerEndTime: nextEndTime,
      buzzerHistory: newBuzzerHistory,
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handlePauseTimer = () => {
    const currentState = stateRef.current;
    if (currentState.timerStatus !== 'RUNNING') return;

    let currentRemaining = currentState.timerRemaining;
    if (currentState.timerEndTime) {
      currentRemaining = Math.max(0, Math.ceil((currentState.timerEndTime - Date.now()) / 1000));
    }

    const nextState: GameState = {
      ...currentState,
      timerStatus: 'PAUSED',
      timerRemaining: currentRemaining,
      timerPausedAtRemaining: currentRemaining,
      timerEndTime: null,
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleResetTimer = () => {
    const currentState = stateRef.current;
    // Clear sound deduplication for current question so it can replay when started again
    for (const cp of [120, 110, 100, 90, 80, 70, 60, 0]) {
      playedSoundsRef.current.delete(`${currentState.currentQuestionIndex}_${cp}`);
    }

    const nextState: GameState = {
      ...currentState,
      timerStatus: 'IDLE',
      timerRemaining: 120,
      timerPausedAtRemaining: 120,
      timerEndTime: null,
      buzzerHistory: [],
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleChangeQuestion = (newIndex: number) => {
    if (newIndex < 0 || newIndex > TOTAL_QUESTIONS - 1) return;
    const currentState = stateRef.current;

    // Reset sound deduplication for target question
    for (const cp of [120, 110, 100, 90, 80, 70, 60, 0]) {
      playedSoundsRef.current.delete(`${newIndex}_${cp}`);
    }

    // Moving question: Reset gameplay scoring for new question, Stop timer, reset to 02:00, clear buzzer history, do not auto-start
    const nextState: GameState = {
      ...currentState,
      currentQuestionIndex: newIndex,
      revealedMap: {
        ...currentState.revealedMap,
        [newIndex]: Array(10).fill(false),
      },
      wrongGuessesMap: {
        ...currentState.wrongGuessesMap,
        [newIndex]: 0,
      },
      lastWrongGuessTimestamp: undefined,
      timerStatus: 'IDLE',
      timerRemaining: 120,
      timerPausedAtRemaining: 120,
      timerEndTime: null,
      buzzerHistory: [],
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleWrongGuess = () => {
    soundEngine.unlock();
    soundEngine.playWrongGuessSound();

    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;
    const currentWrong = currentState.wrongGuessesMap?.[qIdx] || 0;
    const newWrong = currentWrong + 1;

    const nextState: GameState = {
      ...currentState,
      wrongGuessesMap: {
        ...currentState.wrongGuessesMap,
        [qIdx]: newWrong,
      },
      lastWrongGuessTimestamp: Date.now(),
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleUndoWrongGuess = () => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;
    const currentWrong = currentState.wrongGuessesMap?.[qIdx] || 0;
    if (currentWrong <= 0) return;

    const nextState: GameState = {
      ...currentState,
      wrongGuessesMap: {
        ...currentState.wrongGuessesMap,
        [qIdx]: currentWrong - 1,
      },
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleRevealAnswer = (answerIndex: number) => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;
    const currentRevealed = currentState.revealedMap[qIdx] || Array(10).fill(false);

    if (currentRevealed[answerIndex]) return;

    soundEngine.unlock();
    soundEngine.playRevealChime();

    const newRevealed = [...currentRevealed];
    newRevealed[answerIndex] = true;

    const nextState: GameState = {
      ...currentState,
      revealedMap: {
        ...currentState.revealedMap,
        [qIdx]: newRevealed,
      },
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleRevealAll = () => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;

    soundEngine.unlock();
    soundEngine.playRevealChime();

    const nextState: GameState = {
      ...currentState,
      revealedMap: {
        ...currentState.revealedMap,
        [qIdx]: Array(10).fill(true),
      },
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleHideAll = () => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;

    const nextState: GameState = {
      ...currentState,
      revealedMap: {
        ...currentState.revealedMap,
        [qIdx]: Array(10).fill(false),
      },
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleResetQuestion = () => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;

    // Reset sound deduplication for this question
    for (const cp of [120, 110, 100, 90, 80, 70, 60, 0]) {
      playedSoundsRef.current.delete(`${qIdx}_${cp}`);
    }

    const nextState: GameState = {
      ...currentState,
      revealedMap: {
        ...currentState.revealedMap,
        [qIdx]: Array(10).fill(false),
      },
      wrongGuessesMap: {
        ...currentState.wrongGuessesMap,
        [qIdx]: 0,
      },
      lastWrongGuessTimestamp: undefined,
      timerStatus: 'IDLE',
      timerRemaining: 120,
      timerPausedAtRemaining: 120,
      timerEndTime: null,
      buzzerHistory: [],
      lastUpdated: Date.now(),
    };

    commitHostState(nextState);
  };

  const handleResetGameplay = () => {
    playedSoundsRef.current.clear();
    const fresh = createFreshState();
    commitHostState(fresh);
  };

  const handleSaveConfig = (newConfig: GameConfig) => {
    setConfig(newConfig);
    configRef.current = newConfig;
    saveConfig(newConfig);
    saveGameConfigToFirebase(newConfig).catch((err) => {
      console.warn('Firebase config write error:', err);
    });
    handleSelectTab('host');
  };

  const handleResetContentToDefaults = () => {
    const defaultCfg: GameConfig = {
      gameName: 'OPS FORTUNE',
      subtitle: 'Connect. Decode. Score.',
      defaultTimerSeconds: 120,
      questions: DEFAULT_QUESTIONS,
    };
    setConfig(defaultCfg);
    configRef.current = defaultCfg;
    saveConfig(defaultCfg);
    saveGameConfigToFirebase(defaultCfg).catch(() => {});

    const fresh = createFreshState();
    commitHostState(fresh);
  };

  // Helper to safely bootstrap DOM inside a same-origin blank window (Desktop multi-window)
  const initProjectorWindowDOM = useCallback((win: Window): HTMLElement | null => {
    try {
      win.document.title = `${configRef.current.gameName || 'OPS FORTUNE'} · Projector Display`;
      win.document.body.className =
        'bg-[#061229] text-white antialiased min-h-screen select-none m-0 p-0 overflow-hidden';
      win.document.body.innerHTML = '<div id="projector-mount"></div>';

      const headNodes = document.querySelectorAll(
        'link[rel="stylesheet"], link[rel="preconnect"], style'
      );
      headNodes.forEach((node) => {
        try {
          win.document.head.appendChild(node.cloneNode(true));
        } catch {
          // safe
        }
      });

      return win.document.getElementById('projector-mount');
    } catch (e) {
      console.warn('Failed to bootstrap projector window DOM', e);
      return null;
    }
  }, []);

  const handleOpenProjectorWindow = useCallback(() => {
    try {
      if (projectorWindowRef.current && !projectorWindowRef.current.closed) {
        projectorWindowRef.current.focus();
        setPopupBlockedNotice(false);
        return;
      }

      const win = window.open(
        '',
        'OpsFortuneProjectorWindow',
        'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
      );

      if (!win || win.closed || typeof win.closed === 'undefined') {
        setPopupBlockedNotice(true);
        return;
      }

      setPopupBlockedNotice(false);
      projectorWindowRef.current = win;

      const mount = initProjectorWindowDOM(win);
      if (mount) {
        setProjectorMountNode(mount);
      }

      const handleClose = () => {
        setProjectorMountNode(null);
        projectorWindowRef.current = null;
      };

      win.addEventListener('beforeunload', handleClose);
      win.addEventListener('unload', handleClose);

      win.focus();
    } catch (err) {
      console.warn('Failed to open projector window', err);
      setPopupBlockedNotice(true);
    }
  }, [initProjectorWindowDOM]);

  // Watchdog for Desktop browser popups
  useEffect(() => {
    const watchdog = setInterval(() => {
      const win = projectorWindowRef.current;
      if (!win) return;

      if (win.closed) {
        setProjectorMountNode(null);
        projectorWindowRef.current = null;
        return;
      }

      try {
        const mount = win.document.getElementById('projector-mount');
        if (!mount) {
          const newMount = initProjectorWindowDOM(win);
          if (newMount) {
            setProjectorMountNode(newMount);
          }
        }
      } catch {
        setProjectorMountNode(null);
        projectorWindowRef.current = null;
      }
    }, 250);

    return () => clearInterval(watchdog);
  }, [initProjectorWindowDOM]);

  // Dedicated Projector View route (e.g. for Median APK on Projector or LED Screen)
  const isDedicatedProjector =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'projector';

  if (isDedicatedProjector) {
    return (
      <ProjectorView
        config={config}
        state={state}
        isFirebaseConnected={isFirebaseConnected}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1E293B] flex flex-col justify-between">
      {/* Top Application Navigation Switcher */}
      <nav className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-slate-900 tracking-tight text-sm md:text-base">
            {config.gameName || 'OPS FORTUNE'}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {config.subtitle || 'Connect. Decode. Score.'}
          </span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => handleSelectTab('host')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'host'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Host Control
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('projector')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'projector'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Projector View
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('admin')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Edit Questions
            </button>
          </div>

          {/* Firebase Connection Status & Settings */}
          <FirebaseSyncStatus isConnected={isFirebaseConnected} />
        </div>
      </nav>

      {/* Primary View Router */}
      <main className="flex-1">
        {activeTab === 'host' && (
          <HostControl
            config={config}
            state={state}
            onRevealAnswer={handleRevealAnswer}
            onRevealAll={handleRevealAll}
            onHideAll={handleHideAll}
            onResetQuestion={handleResetQuestion}
            onWrongGuess={handleWrongGuess}
            onUndoWrongGuess={handleUndoWrongGuess}
            onStartTimer={handleStartTimer}
            onPauseTimer={handlePauseTimer}
            onResetTimer={handleResetTimer}
            onChangeQuestion={handleChangeQuestion}
            onOpenEdit={() => handleSelectTab('admin')}
            onResetGameplay={handleResetGameplay}
            onOpenProjectorWindow={handleOpenProjectorWindow}
            popupBlockedNotice={popupBlockedNotice}
            isFirebaseConnected={isFirebaseConnected}
          />
        )}

        {activeTab === 'projector' && (
          <div className="relative">
            <ProjectorView
              config={config}
              state={state}
              onBackToHost={() => handleSelectTab('host')}
              isFirebaseConnected={isFirebaseConnected}
            />
          </div>
        )}

        {activeTab === 'admin' && (
          <AdminEditor
            initialConfig={config}
            onSave={handleSaveConfig}
            onCancel={() => handleSelectTab('host')}
            onResetToDefaults={handleResetContentToDefaults}
          />
        )}
      </main>

      {/* React Portal to separate Projector Window (when open on Desktop) */}
      {projectorMountNode &&
        createPortal(
          <ProjectorView
            config={config}
            state={state}
            isFirebaseConnected={isFirebaseConnected}
          />,
          projectorMountNode
        )}
    </div>
  );
}
