/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AnswerItem {
  text: string;
  points: number; // Strictly 100, 90, 80, 70, 60, 50, 40, 30, 20, 10
}

export interface GameQuestion {
  id: number; // 1 to 30
  title: string;
  prompt?: string;
  answers: AnswerItem[]; // exactly 10 items
}

export interface GameConfig {
  gameName: string;
  subtitle: string;
  defaultTimerSeconds: number; // 120
  questions: GameQuestion[]; // exactly 30 questions
}

export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'TIME_UP';

export interface GameState {
  currentQuestionIndex: number; // 0 to 29
  // Map of questionIndex => boolean[10] indicating which answers are revealed
  revealedMap: Record<number, boolean[]>;
  // Map of questionIndex => count of wrong guesses (-10 points each)
  wrongGuessesMap: Record<number, number>;
  lastWrongGuessTimestamp?: number; // timestamp to display brief WRONG GUESS banner
  timerStatus: TimerStatus;
  timerRemaining: number; // in seconds (0 to 120)
  timerEndTime: number | null; // epoch ms when running
  timerPausedAtRemaining: number;
  buzzerHistory: number[]; // track which intervals already beeped: [110, 100, 90, ..., 10, 0]
  lastUpdated: number;
}

export interface SyncMessage {
  type: 'SYNC_STATE' | 'REQUEST_STATE' | 'RESET_STATE' | 'BUZZER_EVENT';
  state?: GameState;
  config?: GameConfig;
  buzzerType?: '10s' | 'final' | 'reveal' | 'wrong';
  timestamp: number;
}
