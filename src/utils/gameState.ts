/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameConfig, GameQuestion, GameState, SyncMessage } from '../types/game';
import { DEFAULT_QUESTIONS, FIXED_POINTS } from '../data/defaultQuestions';

export const CONFIG_STORAGE_KEY = 'ops_fortune_config_v1';
export const STATE_STORAGE_KEY = 'ops_fortune_state_v1';
export const BROADCAST_CHANNEL_NAME = 'ops_fortune_channel_v1';

export const TOTAL_QUESTIONS = 20;

export function getInitialConfig(): GameConfig {
  if (typeof window === 'undefined') {
    return {
      gameName: 'OPS FORTUNE',
      subtitle: 'Connect. Decode. Score.',
      defaultTimerSeconds: 120,
      questions: DEFAULT_QUESTIONS,
    };
  }

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate safely if array has 20 or more questions
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length >= 20) {
        const sliced = parsed.questions.slice(0, TOTAL_QUESTIONS);
        // Validate each question has 10 answers with locked points
        const validatedQuestions: GameQuestion[] = sliced.map((q: Partial<GameQuestion>, idx: number) => {
          const fallback = DEFAULT_QUESTIONS[idx] || DEFAULT_QUESTIONS[0];
          const answers = Array.isArray(q.answers) && q.answers.length === 10
            ? q.answers.map((a, aIdx) => ({
                text: typeof a.text === 'string' ? a.text : (fallback.answers[aIdx]?.text || `Answer ${aIdx + 1}`),
                points: FIXED_POINTS[aIdx],
              }))
            : fallback.answers;

          return {
            id: idx + 1,
            title: typeof q.title === 'string' && q.title.trim() ? q.title : fallback.title,
            prompt: typeof q.prompt === 'string' ? q.prompt : fallback.prompt,
            answers,
          };
        });

        return {
          gameName: typeof parsed.gameName === 'string' && parsed.gameName.trim() ? parsed.gameName : 'OPS FORTUNE',
          subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : 'Connect. Decode. Score.',
          defaultTimerSeconds: 120,
          questions: validatedQuestions,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved config from localStorage, using defaults.', e);
  }

  return {
    gameName: 'OPS FORTUNE',
    subtitle: 'Connect. Decode. Score.',
    defaultTimerSeconds: 120,
    questions: DEFAULT_QUESTIONS,
  };
}

export function saveConfig(config: GameConfig): void {
  try {
    // Ensure only 20 questions are saved
    const safeConfig: GameConfig = {
      ...config,
      questions: config.questions.slice(0, TOTAL_QUESTIONS),
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(safeConfig));
  } catch (e) {
    console.error('Failed to save config to localStorage', e);
  }
}

export function getInitialState(): GameState {
  if (typeof window === 'undefined') {
    return createFreshState();
  }

  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.currentQuestionIndex === 'number') {
        const qIdx = Math.max(0, Math.min(TOTAL_QUESTIONS - 1, parsed.currentQuestionIndex));
        const revealedMap: Record<number, boolean[]> = {};

        if (parsed.revealedMap && typeof parsed.revealedMap === 'object') {
          for (let i = 0; i < TOTAL_QUESTIONS; i++) {
            if (Array.isArray(parsed.revealedMap[i]) && parsed.revealedMap[i].length === 10) {
              revealedMap[i] = parsed.revealedMap[i].map(Boolean);
            } else {
              revealedMap[i] = Array(10).fill(false);
            }
          }
        } else {
          for (let i = 0; i < TOTAL_QUESTIONS; i++) {
            revealedMap[i] = Array(10).fill(false);
          }
        }

        const wrongGuessesMap: Record<number, number> = {};
        if (parsed.wrongGuessesMap && typeof parsed.wrongGuessesMap === 'object') {
          for (let i = 0; i < TOTAL_QUESTIONS; i++) {
            wrongGuessesMap[i] = typeof parsed.wrongGuessesMap[i] === 'number' ? Math.max(0, parsed.wrongGuessesMap[i]) : 0;
          }
        } else {
          for (let i = 0; i < TOTAL_QUESTIONS; i++) {
            wrongGuessesMap[i] = 0;
          }
        }

        // Timer recovery
        let timerRemaining = typeof parsed.timerRemaining === 'number' ? Math.max(0, Math.min(120, parsed.timerRemaining)) : 120;
        let timerStatus = parsed.timerStatus || 'IDLE';
        let timerEndTime = parsed.timerEndTime || null;

        if (timerStatus === 'RUNNING' && timerEndTime) {
          const now = Date.now();
          if (now >= timerEndTime) {
            timerRemaining = 0;
            timerStatus = 'TIME_UP';
            timerEndTime = null;
          } else {
            timerRemaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
          }
        }

        return {
          currentQuestionIndex: qIdx,
          revealedMap,
          wrongGuessesMap,
          lastWrongGuessTimestamp: typeof parsed.lastWrongGuessTimestamp === 'number' ? parsed.lastWrongGuessTimestamp : undefined,
          timerStatus,
          timerRemaining,
          timerEndTime,
          timerPausedAtRemaining: typeof parsed.timerPausedAtRemaining === 'number' ? parsed.timerPausedAtRemaining : timerRemaining,
          buzzerHistory: Array.isArray(parsed.buzzerHistory) ? parsed.buzzerHistory : [],
          lastUpdated: Date.now(),
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse state from localStorage, creating fresh state', e);
  }

  return createFreshState();
}

export function createFreshState(): GameState {
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

export interface ScoreBreakdown {
  correctCount: number;
  correctPoints: number;
  wrongGuessCount: number;
  wrongPenalty: number;
  currentScore: number;
}

export function calculateScore(
  question: GameQuestion,
  revealed: boolean[] = [],
  wrongGuesses: number = 0
): ScoreBreakdown {
  let correctCount = 0;
  let correctPoints = 0;

  if (question && Array.isArray(question.answers)) {
    question.answers.forEach((ans, idx) => {
      if (revealed[idx]) {
        correctCount++;
        correctPoints += (typeof ans.points === 'number' ? ans.points : 0);
      }
    });
  }

  const safeWrongGuesses = Math.max(0, wrongGuesses || 0);
  const wrongPenalty = safeWrongGuesses * 10;
  const currentScore = correctPoints - wrongPenalty;

  return {
    correctCount,
    correctPoints,
    wrongGuessCount: safeWrongGuesses,
    wrongPenalty,
    currentScore,
  };
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state to localStorage', e);
  }
}

/**
 * Broadcast sync helper
 */
export class ChannelSync {
  private channel: BroadcastChannel | null = null;
  private onMessageCallback: ((msg: SyncMessage) => void) | null = null;

  constructor(onMessage?: (msg: SyncMessage) => void) {
    this.onMessageCallback = onMessage || null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (this.onMessageCallback && event.data) {
            this.onMessageCallback(event.data);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error, will use storage event fallback', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STATE_STORAGE_KEY && e.newValue && this.onMessageCallback) {
          try {
            const state = JSON.parse(e.newValue);
            this.onMessageCallback({
              type: 'SYNC_STATE',
              state,
              timestamp: Date.now(),
            });
          } catch {
            // ignore
          }
        }
      });
    }
  }

  public setListener(cb: (msg: SyncMessage) => void): void {
    this.onMessageCallback = cb;
  }

  public broadcast(msg: SyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.warn('Failed to broadcast message', err);
      }
    }
  }

  public destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.onMessageCallback = null;
  }
}
