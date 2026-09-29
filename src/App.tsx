/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GameConfig, GameState, SyncMessage, TimerStatus } from './types/game';
import {
  getInitialConfig,
  getInitialState,
  saveConfig,
  saveState,
  createFreshState,
  ChannelSync,
} from './utils/gameState';
import { soundEngine } from './utils/audio';
import { DEFAULT_QUESTIONS } from './data/defaultQuestions';
import { HostControl } from './components/HostControl';
import { ProjectorView } from './components/ProjectorView';
import { AdminEditor } from './components/AdminEditor';
import { Monitor, Sliders, PlayCircle } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<GameConfig>(getInitialConfig);
  const [state, setState] = useState<GameState>(getInitialState);

  // In-app tab navigation: 'host' | 'projector' | 'admin'
  const [activeTab, setActiveTab] = useState<'host' | 'projector' | 'admin'>('host');

  const [popupBlockedNotice, setPopupBlockedNotice] = useState<boolean>(false);

  // Reference to external projector window and mount DOM node for React Portal
  const projectorWindowRef = useRef<Window | null>(null);
  const [projectorMountNode, setProjectorMountNode] = useState<HTMLElement | null>(null);

  // Keep ref to latest state and config for event handlers and intervals
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  const configRef = useRef<GameConfig>(config);
  configRef.current = config;

  const channelRef = useRef<ChannelSync | null>(null);

  // Broadcast state helper
  const broadcastCurrent = useCallback((updatedState: GameState, updatedConfig?: GameConfig) => {
    saveState(updatedState);
    if (updatedConfig) {
      saveConfig(updatedConfig);
    }
    if (channelRef.current) {
      channelRef.current.broadcast({
        type: 'SYNC_STATE',
        state: updatedState,
        config: updatedConfig || configRef.current,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Initialize BroadcastChannel sync
  useEffect(() => {
    const handleSyncMessage = (msg: SyncMessage) => {
      if (msg.type === 'SYNC_STATE') {
        if (msg.config) {
          setConfig(msg.config);
          configRef.current = msg.config;
        }
        if (msg.state) {
          setState(msg.state);
          stateRef.current = msg.state;
        }
      } else if (msg.type === 'REQUEST_STATE') {
        // Reply with current state
        if (channelRef.current) {
          channelRef.current.broadcast({
            type: 'SYNC_STATE',
            state: stateRef.current,
            config: configRef.current,
            timestamp: Date.now(),
          });
        }
      }
    };

    const sync = new ChannelSync(handleSyncMessage);
    channelRef.current = sync;

    // Send initial request in case another tab (host) has state
    sync.broadcast({
      type: 'REQUEST_STATE',
      timestamp: Date.now(),
    });

    return () => {
      sync.destroy();
    };
  }, []);

  // High-frequency Authoritative Timer Tick
  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.timerStatus !== 'RUNNING' || !currentState.timerEndTime) {
        return;
      }

      const now = Date.now();
      const rawRemaining = Math.max(0, Math.ceil((currentState.timerEndTime - now) / 1000));

      let newStatus: TimerStatus = currentState.timerStatus;
      let newEndTime: number | null = currentState.timerEndTime;
      const newBuzzerHistory = [...currentState.buzzerHistory];

      // Check 10-second checkpoints: [110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10]
      const checkpoints = [110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
      for (const cp of checkpoints) {
        if (rawRemaining <= cp && !newBuzzerHistory.includes(cp)) {
          newBuzzerHistory.push(cp);
          soundEngine.play10SecBeep();
        }
      }

      // Check 00:00 Final Buzzer
      if (rawRemaining <= 0) {
        newStatus = 'TIME_UP';
        newEndTime = null;
        if (!newBuzzerHistory.includes(0)) {
          newBuzzerHistory.push(0);
          soundEngine.playFinalBuzzer();
        }
      }

      if (
        rawRemaining !== currentState.timerRemaining ||
        newStatus !== currentState.timerStatus ||
        newBuzzerHistory.length !== currentState.buzzerHistory.length
      ) {
        const nextState: GameState = {
          ...currentState,
          timerRemaining: rawRemaining,
          timerStatus: newStatus,
          timerEndTime: newEndTime,
          buzzerHistory: newBuzzerHistory,
          lastUpdated: Date.now(),
        };

        setState(nextState);
        broadcastCurrent(nextState);
      }
    }, 150);

    return () => clearInterval(interval);
  }, [broadcastCurrent]);

  // Host Actions
  const handleStartTimer = () => {
    soundEngine.unlock();
    const currentState = stateRef.current;
    // Guard: Do not duplicate if already running or if time is up without reset
    if (currentState.timerStatus === 'RUNNING' || currentState.timerRemaining <= 0) {
      return;
    }

    const duration = currentState.timerRemaining;
    const nextEndTime = Date.now() + duration * 1000;

    const nextState: GameState = {
      ...currentState,
      timerStatus: 'RUNNING',
      timerEndTime: nextEndTime,
      lastUpdated: Date.now(),
    };

    setState(nextState);
    broadcastCurrent(nextState);
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

    setState(nextState);
    broadcastCurrent(nextState);
  };

  const handleResetTimer = () => {
    const currentState = stateRef.current;
    const nextState: GameState = {
      ...currentState,
      timerStatus: 'IDLE',
      timerRemaining: 120,
      timerPausedAtRemaining: 120,
      timerEndTime: null,
      buzzerHistory: [],
      lastUpdated: Date.now(),
    };

    setState(nextState);
    broadcastCurrent(nextState);
  };

  const handleChangeQuestion = (newIndex: number) => {
    if (newIndex < 0 || newIndex > 29) return;
    const currentState = stateRef.current;

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

    setState(nextState);
    broadcastCurrent(nextState);
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

    setState(nextState);
    broadcastCurrent(nextState);
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

    setState(nextState);
    broadcastCurrent(nextState);
  };

  const handleRevealAnswer = (answerIndex: number) => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;
    const currentRevealed = currentState.revealedMap[qIdx] || Array(10).fill(false);

    // Prevent duplicate accidental click
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

    setState(nextState);
    broadcastCurrent(nextState);
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

    setState(nextState);
    broadcastCurrent(nextState);
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

    setState(nextState);
    broadcastCurrent(nextState);
  };

  const handleResetQuestion = () => {
    const currentState = stateRef.current;
    const qIdx = currentState.currentQuestionIndex;

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

    setState(nextState);
    broadcastCurrent(nextState);
  };

  const handleResetGameplay = () => {
    const fresh = createFreshState();
    setState(fresh);
    broadcastCurrent(fresh);
  };

  const handleSaveConfig = (newConfig: GameConfig) => {
    setConfig(newConfig);
    configRef.current = newConfig;
    saveConfig(newConfig);

    if (channelRef.current) {
      channelRef.current.broadcast({
        type: 'SYNC_STATE',
        state: stateRef.current,
        config: newConfig,
        timestamp: Date.now(),
      });
    }

    setActiveTab('host');
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

    const fresh = createFreshState();
    setState(fresh);
    broadcastCurrent(fresh, defaultCfg);
  };

  // Helper to safely bootstrap DOM inside a same-origin blank window
  const initProjectorWindowDOM = useCallback((win: Window): HTMLElement | null => {
    try {
      win.document.title = `${configRef.current.gameName || 'OPS FORTUNE'} · Projector Display`;
      win.document.body.className = 'bg-[#F8F9FA] text-[#1E293B] antialiased min-h-screen select-none m-0 p-0 overflow-x-hidden';
      win.document.body.innerHTML = '<div id="projector-mount"></div>';

      // Copy stylesheet & font links from parent document
      const headNodes = document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style');
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

  // Safe window launcher: opens an in-memory same-origin window WITHOUT sending any HTTP request to the server!
  // This completely eliminates HTTP 403 Forbidden errors.
  const handleOpenProjectorWindow = useCallback(() => {
    try {
      // If already open and active, simply bring to front
      if (projectorWindowRef.current && !projectorWindowRef.current.closed) {
        projectorWindowRef.current.focus();
        setPopupBlockedNotice(false);
        return;
      }

      // Open a blank window directly inside the user's click event.
      // Parameter '' or 'about:blank' prevents any server HTTP fetch!
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

      // Handle window closure
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

  // Watchdog: monitors external projector window.
  // If user refreshes the projector window, re-bootstraps it immediately with ZERO HTTP requests.
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
          // Window was reloaded: re-bootstrap DOM and mount portal
          const newMount = initProjectorWindowDOM(win);
          if (newMount) {
            setProjectorMountNode(newMount);
          }
        }
      } catch {
        // Window detached or navigating
        setProjectorMountNode(null);
        projectorWindowRef.current = null;
      }
    }, 250);

    return () => clearInterval(watchdog);
  }, [initProjectorWindowDOM]);

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

        {/* View Switcher Tabs (All rendered client-side on same application origin) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('host')}
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
            onClick={() => setActiveTab('projector')}
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
            onClick={() => setActiveTab('admin')}
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
            onOpenEdit={() => setActiveTab('admin')}
            onResetGameplay={handleResetGameplay}
            onOpenProjectorWindow={handleOpenProjectorWindow}
            popupBlockedNotice={popupBlockedNotice}
          />
        )}

        {activeTab === 'projector' && (
          <div className="relative">
            <ProjectorView
              config={config}
              state={state}
              onBackToHost={() => setActiveTab('host')}
            />
          </div>
        )}

        {activeTab === 'admin' && (
          <AdminEditor
            initialConfig={config}
            onSave={handleSaveConfig}
            onCancel={() => setActiveTab('host')}
            onResetToDefaults={handleResetContentToDefaults}
          />
        )}
      </main>

      {/* React Portal to separate Projector Window (when open) */}
      {projectorMountNode &&
        createPortal(
          <ProjectorView
            config={config}
            state={state}
          />,
          projectorMountNode
        )}
    </div>
  );
}
