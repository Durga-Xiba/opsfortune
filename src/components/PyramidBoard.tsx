/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnswerItem } from '../types/game';
import { Check, Eye, Lock } from 'lucide-react';

interface PyramidBoardProps {
  answers: AnswerItem[];
  revealed: boolean[];
  mode: 'host' | 'projector';
  onAnswerClick?: (index: number) => void;
  size?: 'normal' | 'large' | 'compact';
}

export const PyramidBoard: React.FC<PyramidBoardProps> = ({
  answers,
  revealed,
  mode,
  onAnswerClick,
  size = 'normal',
}) => {
  // 10 levels: index 0 (100 pts) at the top, down to index 9 (10 pts) at the bottom
  return (
    <div
      className="w-full flex flex-col items-center gap-1.5 md:gap-2.5 py-2 px-2 select-none"
      role="region"
      aria-label="Answer Pyramid"
    >
      {answers.map((answer, index) => {
        const isRevealed = Boolean(revealed[index]);
        const points = answer.points;
        const answerText = answer.text;

        // Progressive width percentage: 0 is top (narrowest ~50%), 9 is bottom (widest ~100%)
        // Formula produces responsive stepped staircase:
        const widthPercentDesktop = 48 + index * 5.7; // 48% up to 99.3%
        const widthPercentMobile = 68 + index * 3.5; // 68% up to 99.5%

        const isInteractive = mode === 'host' && !isRevealed && Boolean(onAnswerClick);

        return (
          <div
            key={index}
            style={{
              width: `min(100%, max(280px, calc(var(--pyramid-base, 48%) + ${index} * var(--pyramid-step, 5.7%))))`,
            }}
            className="transition-all duration-200 ease-out flex justify-center max-w-4xl"
          >
            <button
              type="button"
              disabled={mode === 'projector' || isRevealed}
              onClick={() => {
                if (isInteractive && onAnswerClick) {
                  onAnswerClick(index);
                }
              }}
              aria-label={
                mode === 'host'
                  ? `Level ${10 - index}: ${answerText}, ${points} points. ${isRevealed ? 'Already revealed' : 'Click to reveal'}`
                  : `Level ${10 - index}: ${points} points. ${isRevealed ? answerText : 'Hidden'}`
              }
              className={`
                w-full relative flex items-center justify-between
                transition-all duration-200
                rounded-md border text-left
                ${size === 'compact' ? 'px-3 py-1.5 min-h-[38px]' : size === 'large' ? 'px-5 md:px-7 py-3 md:py-4 min-h-[54px] md:min-h-[62px]' : 'px-4 md:px-6 py-2.5 md:py-3 min-h-[46px] md:min-h-[52px]'}
                ${
                  isRevealed
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm ring-1 ring-slate-900/10'
                    : mode === 'host'
                    ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-2xs hover:border-slate-400 hover:shadow-xs active:scale-[0.99] cursor-pointer'
                    : 'bg-white/95 border-slate-200/90 text-slate-400 shadow-2xs'
                }
              `}
            >
              {/* Left Zone: Indicator & Answer Text */}
              <div className="flex items-center gap-2.5 md:gap-3.5 min-w-0 pr-3">
                {/* State Indicator */}
                {mode === 'host' ? (
                  <div className="shrink-0 flex items-center justify-center">
                    {isRevealed ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 group-hover:text-slate-600">
                        <Eye className="w-3 h-3 stroke-[2.2]" />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="shrink-0 flex items-center justify-center">
                    {isRevealed ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-slate-300">
                        <Lock className="w-3 h-3 stroke-[2]" />
                      </span>
                    )}
                  </div>
                )}

                {/* Answer Display */}
                <div className="truncate">
                  {mode === 'host' ? (
                    // Host always sees the answer text
                    <span
                      className={`font-semibold tracking-tight text-sm md:text-base lg:text-lg ${
                        isRevealed ? 'text-white' : 'text-slate-800'
                      }`}
                    >
                      {answerText}
                    </span>
                  ) : (
                    // Projector only sees answer if revealed
                    <div className="flex items-center">
                      {isRevealed ? (
                        <span className="font-semibold tracking-tight text-white text-base md:text-xl lg:text-2xl animate-in fade-in zoom-in-95 duration-200">
                          {answerText}
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="font-mono text-slate-300 tracking-widest text-base md:text-lg select-none"
                        >
                          ————————
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Zone: Fixed Points badge */}
              <div className="shrink-0 flex items-center gap-1 pl-2">
                <span
                  className={`font-mono font-bold tabular-nums text-base md:text-lg lg:text-xl ${
                    isRevealed
                      ? 'text-amber-300'
                      : mode === 'host'
                      ? 'text-slate-700'
                      : 'text-slate-500'
                  }`}
                >
                  {points}
                </span>
                <span
                  className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider ${
                    isRevealed ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  pts
                </span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
};
