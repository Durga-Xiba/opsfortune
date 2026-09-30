/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  Database,
  Unsubscribe,
} from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { GameConfig, GameState, GameQuestion } from '../types/game';
import { DEFAULT_QUESTIONS, FIXED_POINTS } from '../data/defaultQuestions';

export interface FirebaseSyncConfig {
  apiKey?: string;
  authDomain?: string;
  databaseURL: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const FIREBASE_CONFIG_STORAGE_KEY = 'ops_fortune_firebase_custom_config_v1';

export const DEFAULT_FIREBASE_CONFIG: FirebaseSyncConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoPlaceholderForRTDB',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ocxi-0369.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://ocxi-0369-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ocxi-0369',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ocxi-0369.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export function getActiveFirebaseConfig(): FirebaseSyncConfig {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.databaseURL === 'string' && parsed.databaseURL.trim()) {
          return {
            ...DEFAULT_FIREBASE_CONFIG,
            ...parsed,
          };
        }
      }
    } catch (e) {
      console.warn('Failed to parse custom Firebase config from localStorage', e);
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveActiveFirebaseConfig(cfg: FirebaseSyncConfig): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) {
      console.warn('Failed to save Firebase config to localStorage', e);
    }
  }
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Database | null = null;

export function getFirebaseInstance(): { app: FirebaseApp; db: Database } | null {
  try {
    const config = getActiveFirebaseConfig();
    if (!config.databaseURL) {
      return null;
    }

    if (!cachedApp) {
      const apps = getApps();
      if (apps.length > 0) {
        cachedApp = getApp();
      } else {
        cachedApp = initializeApp(config);
      }

      // Attempt anonymous auth in background if available
      try {
        const auth = getAuth(cachedApp);
        signInAnonymously(auth).catch(() => {
          // If auth isn't enabled or rules are open, this is harmlessly non-blocking
        });
      } catch {
        // Safe ignore
      }
    }

    if (!cachedDb && cachedApp) {
      cachedDb = getDatabase(cachedApp, config.databaseURL);
    }

    if (cachedApp && cachedDb) {
      return { app: cachedApp, db: cachedDb };
    }
    return null;
  } catch (err) {
    console.warn('Failed to initialize Firebase Realtime Database instance:', err);
    return null;
  }
}

/**
 * Validates and sanitizes GameState received from Firebase or storage
 */
export function sanitizeGameState(raw: unknown, fallbackState?: GameState): GameState {
  if (!raw || typeof raw !== 'object') {
    return fallbackState || createDefaultGameState();
  }

  const obj = raw as Record<string, unknown>;

  const currentQuestionIndex =
    typeof obj.currentQuestionIndex === 'number' && !isNaN(obj.currentQuestionIndex)
      ? Math.max(0, Math.min(29, Math.floor(obj.currentQuestionIndex)))
      : fallbackState?.currentQuestionIndex ?? 0;

  // Sanitize revealedMap: ensure all 30 questions have boolean[10]
  const revealedMap: Record<number, boolean[]> = {};
  const rawRev = (obj.revealedMap && typeof obj.revealedMap === 'object' ? obj.revealedMap : {}) as Record<string, unknown>;
  for (let i = 0; i < 30; i++) {
    const arr = rawRev[i];
    if (Array.isArray(arr) && arr.length === 10) {
      revealedMap[i] = arr.map(Boolean);
    } else if (fallbackState?.revealedMap?.[i]) {
      revealedMap[i] = [...fallbackState.revealedMap[i]];
    } else {
      revealedMap[i] = Array(10).fill(false);
    }
  }

  // Sanitize wrongGuessesMap: ensure all 30 questions have integer >= 0
  const wrongGuessesMap: Record<number, number> = {};
  const rawWrong = (obj.wrongGuessesMap && typeof obj.wrongGuessesMap === 'object' ? obj.wrongGuessesMap : {}) as Record<string, unknown>;
  for (let i = 0; i < 30; i++) {
    const val = rawWrong[i];
    if (typeof val === 'number' && !isNaN(val)) {
      wrongGuessesMap[i] = Math.max(0, Math.floor(val));
    } else if (fallbackState?.wrongGuessesMap?.[i] !== undefined) {
      wrongGuessesMap[i] = fallbackState.wrongGuessesMap[i];
    } else {
      wrongGuessesMap[i] = 0;
    }
  }

  const timerStatusRaw = obj.timerStatus;
  const timerStatus =
    timerStatusRaw === 'RUNNING' ||
    timerStatusRaw === 'PAUSED' ||
    timerStatusRaw === 'TIME_UP'
      ? timerStatusRaw
      : 'IDLE';

  let timerRemaining =
    typeof obj.timerRemaining === 'number' && !isNaN(obj.timerRemaining)
      ? Math.max(0, Math.min(120, Math.floor(obj.timerRemaining)))
      : 120;

  let timerEndTime =
    typeof obj.timerEndTime === 'number' && !isNaN(obj.timerEndTime)
      ? obj.timerEndTime
      : null;

  // Real-time calculation if running
  if (timerStatus === 'RUNNING' && timerEndTime) {
    const now = Date.now();
    if (now >= timerEndTime) {
      timerRemaining = 0;
    } else {
      timerRemaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
    }
  }

  const timerPausedAtRemaining =
    typeof obj.timerPausedAtRemaining === 'number' && !isNaN(obj.timerPausedAtRemaining)
      ? Math.max(0, Math.min(120, Math.floor(obj.timerPausedAtRemaining)))
      : timerRemaining;

  const buzzerHistory = Array.isArray(obj.buzzerHistory)
    ? obj.buzzerHistory.filter((n): n is number => typeof n === 'number' && !isNaN(n))
    : [];

  const lastWrongGuessTimestamp =
    typeof obj.lastWrongGuessTimestamp === 'number' && !isNaN(obj.lastWrongGuessTimestamp)
      ? obj.lastWrongGuessTimestamp
      : undefined;

  const lastUpdated =
    typeof obj.lastUpdated === 'number' && !isNaN(obj.lastUpdated)
      ? obj.lastUpdated
      : Date.now();

  return {
    currentQuestionIndex,
    revealedMap,
    wrongGuessesMap,
    lastWrongGuessTimestamp,
    timerStatus,
    timerRemaining,
    timerEndTime,
    timerPausedAtRemaining,
    buzzerHistory,
    lastUpdated,
  };
}

export function createDefaultGameState(): GameState {
  const revealedMap: Record<number, boolean[]> = {};
  const wrongGuessesMap: Record<number, number> = {};
  for (let i = 0; i < 30; i++) {
    revealedMap[i] = Array(10).fill(false);
    wrongGuessesMap[i] = 0;
  }
  return {
    currentQuestionIndex: 0,
    revealedMap,
    wrongGuessesMap,
    lastWrongGuessTimestamp: undefined,
    timerStatus: 'IDLE',
    timerRemaining: 120,
    timerEndTime: null,
    timerPausedAtRemaining: 120,
    buzzerHistory: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Validates and sanitizes GameConfig
 */
export function sanitizeGameConfig(raw: unknown, fallback?: GameConfig): GameConfig {
  if (!raw || typeof raw !== 'object') {
    return (
      fallback || {
        gameName: 'OPS FORTUNE',
        subtitle: 'Connect. Decode. Score.',
        defaultTimerSeconds: 120,
        questions: DEFAULT_QUESTIONS,
      }
    );
  }

  const obj = raw as Record<string, unknown>;
  const gameName =
    typeof obj.gameName === 'string' && obj.gameName.trim()
      ? obj.gameName.trim()
      : 'OPS FORTUNE';
  const subtitle =
    typeof obj.subtitle === 'string' && obj.subtitle.trim()
      ? obj.subtitle.trim()
      : 'Connect. Decode. Score.';

  let questions: GameQuestion[] = DEFAULT_QUESTIONS;
  if (Array.isArray(obj.questions) && obj.questions.length === 30) {
    questions = obj.questions.map((q: Partial<GameQuestion>, idx: number) => {
      const def = DEFAULT_QUESTIONS[idx] || DEFAULT_QUESTIONS[0];
      const answers = Array.isArray(q.answers) && q.answers.length === 10
        ? q.answers.map((a, aIdx) => ({
            text: typeof a.text === 'string' ? a.text : def.answers[aIdx]?.text || `Answer ${aIdx + 1}`,
            points: FIXED_POINTS[aIdx],
          }))
        : def.answers;

      return {
        id: idx + 1,
        title: typeof q.title === 'string' && q.title.trim() ? q.title.trim() : def.title,
        prompt: typeof q.prompt === 'string' ? q.prompt : def.prompt,
        answers,
      };
    });
  }

  return {
    gameName,
    subtitle,
    defaultTimerSeconds: 120,
    questions,
  };
}

/**
 * Firebase Realtime Database Paths
 */
const LIVE_STATE_PATH = 'opsFortune/liveState';
const CONFIG_PATH = 'opsFortune/config';

/**
 * Subscribes to /opsFortune/liveState in Firebase Realtime Database.
 * Runs onValue listener for instant WebSocket synchronization across Median APK instances.
 */
export function subscribeToGameState(
  onUpdate: (state: GameState) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const instance = getFirebaseInstance();
  if (!instance) {
    if (onError) onError(new Error('Firebase Realtime Database instance unavailable'));
    return () => {};
  }

  const stateRef = ref(instance.db, LIVE_STATE_PATH);

  const unsubscribe = onValue(
    stateRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const cleanState = sanitizeGameState(data);
        onUpdate(cleanState);
      }
    },
    (error) => {
      console.warn('Firebase liveState onValue error:', error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
}

/**
 * Subscribes to /opsFortune/config in Firebase Realtime Database.
 */
export function subscribeToGameConfig(
  onUpdate: (config: GameConfig) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const instance = getFirebaseInstance();
  if (!instance) {
    if (onError) onError(new Error('Firebase Realtime Database instance unavailable'));
    return () => {};
  }

  const configRef = ref(instance.db, CONFIG_PATH);

  const unsubscribe = onValue(
    configRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const cleanConfig = sanitizeGameConfig(data);
        onUpdate(cleanConfig);
      }
    },
    (error) => {
      console.warn('Firebase config onValue error:', error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
}

/**
 * Subscribes to Firebase connection health (.info/connected)
 */
export function subscribeToConnectionHealth(onHealthChange: (connected: boolean) => void): Unsubscribe {
  const instance = getFirebaseInstance();
  if (!instance) {
    onHealthChange(false);
    return () => {};
  }

  const connectedRef = ref(instance.db, '.info/connected');
  const unsubscribe = onValue(connectedRef, (snapshot) => {
    const isConnected = Boolean(snapshot.val());
    onHealthChange(isConnected);
  });

  return unsubscribe;
}

/**
 * Saves game state authoritatively to Firebase Realtime Database
 */
export async function saveGameStateToFirebase(state: GameState): Promise<void> {
  const instance = getFirebaseInstance();
  if (!instance) {
    return;
  }

  const stateRef = ref(instance.db, LIVE_STATE_PATH);
  await set(stateRef, {
    ...state,
    lastUpdated: Date.now(),
  });
}

/**
 * Saves game configuration authoritatively to Firebase Realtime Database
 */
export async function saveGameConfigToFirebase(config: GameConfig): Promise<void> {
  const instance = getFirebaseInstance();
  if (!instance) {
    return;
  }

  const configRef = ref(instance.db, CONFIG_PATH);
  await set(configRef, config);
}

/**
 * Fetch one-time snapshot of GameState from Firebase (used on boot/recovery)
 */
export async function fetchInitialGameStateFromFirebase(): Promise<GameState | null> {
  const instance = getFirebaseInstance();
  if (!instance) {
    return null;
  }

  try {
    const stateRef = ref(instance.db, LIVE_STATE_PATH);
    const snap = await get(stateRef);
    if (snap.exists()) {
      return sanitizeGameState(snap.val());
    }
  } catch (err) {
    console.warn('Failed to fetch initial state from Firebase:', err);
  }
  return null;
}

/**
 * Fetch one-time snapshot of GameConfig from Firebase
 */
export async function fetchInitialGameConfigFromFirebase(): Promise<GameConfig | null> {
  const instance = getFirebaseInstance();
  if (!instance) {
    return null;
  }

  try {
    const configRef = ref(instance.db, CONFIG_PATH);
    const snap = await get(configRef);
    if (snap.exists()) {
      return sanitizeGameConfig(snap.val());
    }
  } catch (err) {
    console.warn('Failed to fetch initial config from Firebase:', err);
  }
  return null;
}
