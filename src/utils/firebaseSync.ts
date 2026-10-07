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
import { GameConfig, GameState, GameQuestion } from '../types/game';
import { DEFAULT_QUESTIONS, FIXED_POINTS } from '../data/defaultQuestions';

export const TOTAL_QUESTIONS = 20;

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

// Production Firebase Realtime Database configuration (Hardcoded defaults for Android APK & Web)
export const DEFAULT_FIREBASE_CONFIG: FirebaseSyncConfig = {
  databaseURL:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_DATABASE_URL) ||
    'https://ocxi-0369-default-rtdb.firebaseio.com',
  projectId:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) ||
    'ocxi-0369',
  authDomain:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) ||
    'ocxi-0369.firebaseapp.com',
  storageBucket:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) ||
    'ocxi-0369.appspot.com',
};

export function getActiveFirebaseConfig(): FirebaseSyncConfig {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed.databaseURL === 'string' &&
          parsed.databaseURL.startsWith('https://')
        ) {
          return {
            ...DEFAULT_FIREBASE_CONFIG,
            ...parsed,
          };
        }
      }
    } catch {
      // Fallback to production default
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveActiveFirebaseConfig(cfg: FirebaseSyncConfig): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // safe
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
    }

    if (!cachedDb && cachedApp) {
      cachedDb = getDatabase(cachedApp, config.databaseURL);
    }

    if (cachedApp && cachedDb) {
      return { app: cachedApp, db: cachedDb };
    }
    return null;
  } catch (err) {
    console.warn('Failed to initialize Firebase Realtime Database:', err);
    return null;
  }
}

/**
 * Prepares and sanitizes GameState before writing to Firebase Realtime Database.
 * CRITICAL: Firebase Realtime Database throws an error if ANY property contains undefined.
 * This function guarantees no undefined values and ensures proper JSON serialization.
 */
export function prepareStateForFirebase(state: GameState): Record<string, unknown> {
  const revealedObj: Record<string, boolean[]> = {};
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const row = state.revealedMap?.[i];
    if (Array.isArray(row) && row.length === 10) {
      revealedObj[i] = row.map(Boolean);
    } else {
      revealedObj[i] = Array(10).fill(false);
    }
  }

  const wrongObj: Record<string, number> = {};
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const val = state.wrongGuessesMap?.[i];
    wrongObj[i] = typeof val === 'number' && !isNaN(val) ? Math.max(0, Math.floor(val)) : 0;
  }

  return {
    currentQuestionIndex:
      typeof state.currentQuestionIndex === 'number' && !isNaN(state.currentQuestionIndex)
        ? Math.max(0, Math.min(TOTAL_QUESTIONS - 1, Math.floor(state.currentQuestionIndex)))
        : 0,
    revealedMap: revealedObj,
    wrongGuessesMap: wrongObj,
    lastWrongGuessTimestamp:
      typeof state.lastWrongGuessTimestamp === 'number' && state.lastWrongGuessTimestamp > 0
        ? state.lastWrongGuessTimestamp
        : null,
    timerStatus: state.timerStatus || 'IDLE',
    timerRemaining:
      typeof state.timerRemaining === 'number' && !isNaN(state.timerRemaining)
        ? Math.max(0, Math.min(120, Math.floor(state.timerRemaining)))
        : 120,
    timerEndTime:
      typeof state.timerEndTime === 'number' && !isNaN(state.timerEndTime)
        ? state.timerEndTime
        : null,
    timerPausedAtRemaining:
      typeof state.timerPausedAtRemaining === 'number' && !isNaN(state.timerPausedAtRemaining)
        ? Math.max(0, Math.min(120, Math.floor(state.timerPausedAtRemaining)))
        : 120,
    buzzerHistory: Array.isArray(state.buzzerHistory)
      ? state.buzzerHistory.filter((n): n is number => typeof n === 'number' && !isNaN(n))
      : [],
    lastUpdated: Date.now(),
  };
}

/**
 * Validates and sanitizes GameState received from Firebase or storage.
 * Supports both Array and Object representations (since Firebase RTDB converts numeric-key objects to arrays).
 */
export function sanitizeGameState(raw: unknown, fallbackState?: GameState): GameState {
  if (!raw || typeof raw !== 'object') {
    return fallbackState || createDefaultGameState();
  }

  const obj = raw as Record<string, unknown>;

  const currentQuestionIndex =
    typeof obj.currentQuestionIndex === 'number' && !isNaN(obj.currentQuestionIndex)
      ? Math.max(0, Math.min(TOTAL_QUESTIONS - 1, Math.floor(obj.currentQuestionIndex)))
      : fallbackState?.currentQuestionIndex ?? 0;

  // Sanitize revealedMap: ensure all 20 questions have boolean[10]
  const revealedMap: Record<number, boolean[]> = {};
  const rawRev = (obj.revealedMap && typeof obj.revealedMap === 'object' ? obj.revealedMap : {}) as Record<string | number, unknown>;
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const arr = rawRev[i];
    if (Array.isArray(arr) && arr.length === 10) {
      revealedMap[i] = arr.map(Boolean);
    } else if (Array.isArray(arr) && arr.length > 0) {
      const padded = Array(10).fill(false);
      for (let j = 0; j < Math.min(10, arr.length); j++) {
        padded[j] = Boolean(arr[j]);
      }
      revealedMap[i] = padded;
    } else if (fallbackState?.revealedMap?.[i]) {
      revealedMap[i] = [...fallbackState.revealedMap[i]];
    } else {
      revealedMap[i] = Array(10).fill(false);
    }
  }

  // Sanitize wrongGuessesMap: ensure all 20 questions have integer >= 0
  const wrongGuessesMap: Record<number, number> = {};
  const rawWrong = (obj.wrongGuessesMap && typeof obj.wrongGuessesMap === 'object' ? obj.wrongGuessesMap : {}) as Record<string | number, unknown>;
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
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
    typeof obj.lastWrongGuessTimestamp === 'number' && obj.lastWrongGuessTimestamp > 0
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
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
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
 * Validates and sanitizes GameConfig for 20 questions
 */
export function sanitizeGameConfig(raw: unknown, fallback?: GameConfig): GameConfig {
  if (!raw || typeof raw !== 'object') {
    return (
      fallback || {
        gameName: 'OPS FORTUNE',
        subtitle: 'Connect. Decode. Score.',
        defaultTimerSeconds: 120,
        questions: DEFAULT_QUESTIONS.slice(0, TOTAL_QUESTIONS),
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

  let questions: GameQuestion[] = DEFAULT_QUESTIONS.slice(0, TOTAL_QUESTIONS);
  if (Array.isArray(obj.questions) && obj.questions.length >= TOTAL_QUESTIONS) {
    questions = obj.questions.slice(0, TOTAL_QUESTIONS).map((q: Partial<GameQuestion>, idx: number) => {
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
 * Runs onValue listener for instant WebSocket synchronization across Median APK / Web instances.
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
 * Saves game state authoritatively to Firebase Realtime Database.
 * Uses prepareStateForFirebase to ensure no undefined values are written.
 */
export async function saveGameStateToFirebase(state: GameState): Promise<void> {
  const instance = getFirebaseInstance();
  if (!instance) {
    return;
  }

  const stateRef = ref(instance.db, LIVE_STATE_PATH);
  const payload = prepareStateForFirebase(state);
  await set(stateRef, payload);
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
