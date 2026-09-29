/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TimerStatus } from '../types/game';

interface TimerClockProps {
  remainingSeconds: number;
  status: TimerStatus;
  size?: 'normal' | 'large' | 'compact';
}

export function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const TimerClock: React.FC<TimerClockProps> = ({
  remainingSeconds,
  status,
  size = 'normal',
}) => {
  const isTimeUp = status === 'TIME_UP' || remainingSeconds <= 0;
  const isWarning = remainingSeconds <= 30 && remainingSeconds > 0 && status === 'RUNNING';

  const formatted = formatSeconds(remainingSeconds);

  return (
    <div className="flex flex-col items-center justify-center select-none" role="timer" aria-live="polite">
      <div className="flex items-center gap-3">
        <span
          className={`font-mono font-bold tracking-tight tabular-nums transition-colors duration-150 ${
            size === 'large'
              ? 'text-5xl md:text-7xl lg:text-8xl'
              : size === 'compact'
              ? 'text-2xl md:text-3xl'
              : 'text-3xl md:text-4xl lg:text-5xl'
          } ${
            isTimeUp
              ? 'text-rose-600'
              : isWarning
              ? 'text-amber-600'
              : 'text-slate-900'
          }`}
        >
          {formatted}
        </span>

        {status === 'PAUSED' && (
          <span className="text-xs md:text-sm font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded uppercase tracking-wider">
            PAUSED
          </span>
        )}

        {isTimeUp && (
          <span className="text-sm md:text-lg font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2.5 py-1 rounded uppercase tracking-wider animate-pulse">
            TIME UP
          </span>
        )}
      </div>
    </div>
  );
};
