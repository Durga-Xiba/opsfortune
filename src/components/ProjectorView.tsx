/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GameConfig, GameState } from '../types/game';
import { calculateScore, TOTAL_QUESTIONS } from '../utils/gameState';
import { Maximize2, Minimize2, Lock, CheckCircle2, XCircle } from 'lucide-react';

interface ProjectorViewProps {
  config: GameConfig;
  state: GameState;
  onBackToHost?: () => void;
  onExitFullscreen?: () => void;
  isFirebaseConnected?: boolean;
}

export const ProjectorView: React.FC<ProjectorViewProps> = ({
  config,
  state,
  onBackToHost,
  isFirebaseConnected = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showWrongBanner, setShowWrongBanner] = useState(false);
  const lastTsRef = useRef<number | undefined>(state.lastWrongGuessTimestamp);

  // Wrong guess feedback banner (auto-dismiss after 1.8s)
  useEffect(() => {
    if (state.lastWrongGuessTimestamp && state.lastWrongGuessTimestamp !== lastTsRef.current) {
      lastTsRef.current = state.lastWrongGuessTimestamp;
      setShowWrongBanner(true);
      const timer = setTimeout(() => {
        setShowWrongBanner(false);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [state.lastWrongGuessTimestamp]);

  useEffect(() => {
    const doc = containerRef.current?.ownerDocument || document;
    const handleFsChange = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement));
    };
    doc.addEventListener('fullscreenchange', handleFsChange);
    return () => doc.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    const doc = containerRef.current?.ownerDocument || document;
    if (!doc.fullscreenElement) {
      const el = doc.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      }
    }
  };

  const currentQIndex = Math.max(0, Math.min(TOTAL_QUESTIONS - 1, state.currentQuestionIndex ?? 0));
  const currentQ = config.questions[currentQIndex] || config.questions[0];
  const revealedForCurrent = state.revealedMap[currentQIndex] || Array(10).fill(false);
  const currentWrongGuesses = state.wrongGuessesMap?.[currentQIndex] || 0;

  // Authoritative Score Calculation
  const score = calculateScore(currentQ, revealedForCurrent, currentWrongGuesses);

  // Format Timer mm:ss
  const formatTime = (secs: number) => {
    const safe = Math.max(0, Math.min(120, secs || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Two Columns: Left (indices 0..4 = 100, 90, 80, 70, 60), Right (indices 5..9 = 50, 40, 30, 20, 10)
  const leftColumnIndices = [0, 1, 2, 3, 4];
  const rightColumnIndices = [5, 6, 7, 8, 9];

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen max-h-screen overflow-hidden bg-gradient-to-b from-[#061229] via-[#0A1A3A] to-[#040C1D] text-white flex flex-col justify-between select-none relative p-3 md:p-5"
    >
      {/* Optional Top Return Banner if embedded in same window */}
      {onBackToHost && (
        <div className="w-full shrink-0 mb-1 flex items-center justify-between bg-slate-900/90 border border-slate-700 text-white px-3 py-1 rounded text-xs z-50">
          <span className="text-amber-400 font-semibold tracking-wide">
            PROJECTOR DISPLAY (AUDIENCE 16:9 VIEW)
          </span>
          <button
            type="button"
            onClick={onBackToHost}
            className="px-2.5 py-0.5 font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded cursor-pointer transition-colors"
          >
            ← Return to Host Control
          </button>
        </div>
      )}

      {/* Top Header: Left Branding, Center Alerts, Right Score & Timer */}
      <header className="w-full shrink-0 flex items-center justify-between border-b border-[#1E3A6E]/80 pb-2 px-2">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-9 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 rounded-xs shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-black tracking-tight text-white drop-shadow-sm font-sans">
                {config.gameName || 'OPS FORTUNE'}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] md:text-xs font-black tracking-widest bg-gradient-to-r from-amber-500/20 to-amber-400/10 text-amber-300 border border-amber-400/40 uppercase">
                QUESTION {currentQIndex + 1} OF {TOTAL_QUESTIONS}
              </span>
            </div>
            <p className="text-[11px] md:text-xs font-medium text-amber-200/70 tracking-wider">
              {config.subtitle || 'Connect. Decode. Score.'}
            </p>
          </div>
        </div>

        {/* Center: Live Feedback / Phase Banner */}
        <div className="min-w-[220px] flex items-center justify-center">
          {showWrongBanner ? (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 border border-rose-400 rounded-md shadow-[0_0_20px_rgba(225,29,72,0.6)] animate-in fade-in zoom-in-95 duration-150">
              <XCircle className="w-4 h-4 text-white stroke-[3]" />
              <span className="text-xs md:text-sm font-black tracking-wider text-white uppercase">
                WRONG GUESS &middot; &minus;10 PTS
              </span>
            </div>
          ) : state.timerStatus === 'TIME_UP' || state.timerRemaining <= 0 ? (
            <div className="flex flex-col items-center justify-center px-3 py-1 bg-gradient-to-r from-rose-950/80 via-[#122852] to-rose-950/80 border border-amber-400/80 rounded-md shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-in fade-in duration-200">
              <span className="text-xs md:text-sm font-black tracking-widest text-amber-300 uppercase drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]">
                ROUND OVER
              </span>
              <span className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase">
                ANSWERS REVEALED
              </span>
            </div>
          ) : state.timerRemaining <= 60 && state.timerRemaining > 54 && state.timerStatus === 'RUNNING' ? (
            <div className="flex flex-col items-center justify-center px-3 py-1 bg-[#0B1E45]/95 border-2 border-amber-400 rounded-md shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-in fade-in zoom-in-95 duration-200">
              <span className="text-xs md:text-sm font-black text-amber-300 tracking-wider font-sans drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]">
                TIME&apos;S UP!
              </span>
              <span className="text-[9px] md:text-[10px] font-black text-white tracking-[0.2em] uppercase">
                LET&apos;S SEE WHAT YOU&apos;VE GOT!
              </span>
            </div>
          ) : state.timerRemaining <= 54 && state.timerRemaining > 0 && state.timerStatus === 'RUNNING' ? (
            <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-[#102B63] to-amber-500/20 border border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.35)] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              <span className="text-xs md:text-sm font-black tracking-[0.2em] text-amber-300 uppercase">
                THE REVEAL BEGINS...
              </span>
            </div>
          ) : state.timerStatus === 'RUNNING' ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E2554] border border-[#1E3B70] text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[11px] font-bold tracking-widest text-emerald-300 uppercase">
                PARTICIPANT GUESSING PHASE
              </span>
            </div>
          ) : (
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden lg:block">
              LIVE OPERATIONS MANAGEMENT STAGE
            </div>
          )}
        </div>

        {/* Right: Score, Timer & Controls */}
        <div className="flex items-center gap-3 md:gap-5">
          {/* Score Box */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-300">
                SCORE:
              </span>
              <span
                className={`font-mono font-black text-lg md:text-2xl tabular-nums ${
                  score.currentScore < 0
                    ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                    : 'text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                }`}
              >
                {score.currentScore} PTS
              </span>
            </div>
            <div className="text-[10px] md:text-[11px] text-slate-300/80 font-mono flex items-center justify-end gap-1.5">
              <span className="text-emerald-400 font-semibold">
                +{score.correctPoints} ({score.correctCount}/10)
              </span>
              {score.wrongGuessCount > 0 && (
                <>
                  <span className="text-slate-500">&middot;</span>
                  <span className="text-rose-400 font-semibold">
                    &minus;{score.wrongPenalty} ({score.wrongGuessCount} wrong)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 2-Minute Authoritative Countdown Display */}
          <div
            className={`px-3 py-1 md:px-4 md:py-1.5 rounded-md border flex items-center gap-2 font-mono font-black transition-all ${
              state.timerStatus === 'TIME_UP'
                ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.7)] animate-pulse'
                : state.timerRemaining <= 60 && state.timerStatus === 'RUNNING'
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.5)]'
                : 'bg-[#0B1E45] border-[#254B8C] text-white'
            }`}
          >
            {state.timerStatus === 'TIME_UP' ? (
              <span className="text-sm md:text-base tracking-widest text-rose-400 font-sans font-black">
                TIME UP
              </span>
            ) : state.timerRemaining <= 60 && state.timerRemaining > 0 ? (
              <div className="flex items-center gap-1.5 md:gap-2">
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-sans font-black text-[10px] md:text-xs tracking-wider animate-pulse">
                  TIME UP
                </span>
                <span className="text-base md:text-2xl tracking-wider text-rose-300">
                  {formatTime(state.timerRemaining)}
                </span>
              </div>
            ) : (
              <>
                <div
                  className={`w-2 h-2 rounded-full ${
                    state.timerStatus === 'RUNNING'
                      ? 'bg-emerald-400 animate-ping'
                      : state.timerStatus === 'PAUSED'
                      ? 'bg-amber-400'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="text-lg md:text-2xl tracking-wider">
                  {formatTime(state.timerRemaining)}
                </span>
              </>
            )}
          </div>

          {/* Realtime Connection Status Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 bg-[#0E2554] border border-[#1E3B70] rounded text-[10px] text-slate-300 font-medium"
            title={
              isFirebaseConnected
                ? 'Firebase Realtime: Connected (Live Sync)'
                : 'Firebase Realtime: Reconnecting / Cached'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isFirebaseConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
              }`}
            />
            <span className="hidden sm:inline">
              {isFirebaseConnected ? 'LIVE' : 'SYNCING'}
            </span>
          </div>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-1.5 text-slate-300 hover:text-amber-300 hover:bg-[#132B60] border border-transparent hover:border-[#2B549B] rounded transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 md:w-5 md:h-5" />
            ) : (
              <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Center Stage: Question Category Title & Prompt */}
      <section className="w-full shrink-0 text-center py-1 md:py-2 px-4">
        <div className="inline-flex items-center gap-2 mb-0.5">
          <span className="text-[11px] md:text-xs font-black tracking-[0.25em] text-amber-400 uppercase drop-shadow-sm">
            OPERATIONS CHALLENGE &middot; QUESTION {currentQIndex + 1}
          </span>
        </div>
        <h2 className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-black uppercase tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] leading-tight max-w-5xl mx-auto">
          {currentQ.title}
        </h2>
        {currentQ.prompt && (
          <p className="text-xs md:text-sm text-slate-300/80 max-w-3xl mx-auto mt-0.5 line-clamp-1">
            {currentQ.prompt}
          </p>
        )}

        {/* 01:00 Reveal Phase Visual Sequence */}
        {state.timerRemaining <= 60 && state.timerRemaining > 54 && state.timerStatus === 'RUNNING' && (
          <div className="mt-1.5 animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex flex-col items-center justify-center px-6 py-1.5 bg-[#0B1E45]/95 border-2 border-amber-400 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.6)]">
              <span className="text-lg md:text-2xl lg:text-3xl font-black text-amber-300 tracking-wider font-sans drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]">
                TIME&apos;S UP!
              </span>
              <span className="text-[10px] md:text-xs font-black text-white tracking-[0.25em] uppercase mt-0.5">
                LET&apos;S SEE WHAT YOU&apos;VE GOT!
              </span>
            </div>
          </div>
        )}

        {state.timerRemaining <= 54 && state.timerRemaining > 0 && state.timerStatus === 'RUNNING' && (
          <div className="mt-1 animate-in fade-in duration-200">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-[#102B63] to-amber-500/20 border border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.35)] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              <span className="text-xs md:text-sm font-black tracking-[0.25em] text-amber-300 uppercase">
                THE REVEAL BEGINS...
              </span>
            </div>
          </div>
        )}

        {(state.timerStatus === 'TIME_UP' || state.timerRemaining <= 0) && (
          <div className="mt-1 animate-in fade-in duration-200">
            <div className="inline-flex flex-col items-center justify-center px-5 py-0.5 rounded-lg bg-gradient-to-r from-rose-950/80 via-[#122852] to-rose-950/80 border border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
              <span className="text-xs md:text-sm font-black tracking-widest text-amber-300 uppercase">
                ROUND OVER
              </span>
              <span className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase">
                ANSWERS REVEALED
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Main 10-Option Two-Column Grid (Fits 16:9 Viewport Without Any Scrolling) */}
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-2 md:px-6 flex items-center justify-center">
        <div className="w-full h-full grid grid-cols-2 gap-3 md:gap-5 py-1">
          {/* LEFT COLUMN: 100, 90, 80, 70, 60 POINTS */}
          <div className="h-full flex flex-col justify-between gap-1.5 md:gap-2.5">
            {leftColumnIndices.map((idx) => {
              const ans = currentQ.answers[idx];
              const isRevealed = Boolean(revealedForCurrent[idx]);

              return (
                <div
                  key={`left-${idx}`}
                  className={`flex-1 min-h-0 flex items-center justify-between px-3 md:px-5 rounded-lg border transition-all duration-200 ${
                    isRevealed
                      ? 'bg-gradient-to-r from-[#102B63] via-[#1A3D85] to-[#12316E] border-amber-400/90 shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                      : 'bg-[#0B1E45]/80 border-[#1B366B] shadow-inner'
                  }`}
                >
                  {/* Left Side: Points + Status Icon + Answer Text */}
                  <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0 pr-2">
                    {/* Fixed Points Badge */}
                    <div
                      className={`shrink-0 px-2.5 py-1 rounded font-mono font-black text-xs md:text-base lg:text-lg tracking-wider ${
                        isRevealed
                          ? 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                          : 'bg-[#061430] border border-[#1E3B70] text-amber-300/90'
                      }`}
                    >
                      {ans?.points || (100 - idx * 10)}
                    </div>

                    {/* Status Icon */}
                    <div className="shrink-0">
                      {isRevealed ? (
                        <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-amber-300 stroke-[2.5]" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-500 stroke-[2]" />
                      )}
                    </div>

                    {/* Answer Text */}
                    <span
                      className={`truncate text-xs md:text-sm lg:text-base xl:text-lg font-bold tracking-wide uppercase ${
                        isRevealed
                          ? 'text-white font-extrabold drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]'
                          : 'text-slate-400/80 italic font-medium'
                      }`}
                    >
                      {isRevealed ? ans?.text : 'OPTION LOCKED'}
                    </span>
                  </div>

                  {/* Right Side Pill */}
                  <div className="shrink-0">
                    <span
                      className={`text-[10px] md:text-xs font-mono font-bold uppercase tracking-widest ${
                        isRevealed ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {isRevealed ? 'REVEALED' : `${ans?.points || (100 - idx * 10)} PTS`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* RIGHT COLUMN: 50, 40, 30, 20, 10 POINTS */}
          <div className="h-full flex flex-col justify-between gap-1.5 md:gap-2.5">
            {rightColumnIndices.map((idx) => {
              const ans = currentQ.answers[idx];
              const isRevealed = Boolean(revealedForCurrent[idx]);

              return (
                <div
                  key={`right-${idx}`}
                  className={`flex-1 min-h-0 flex items-center justify-between px-3 md:px-5 rounded-lg border transition-all duration-200 ${
                    isRevealed
                      ? 'bg-gradient-to-r from-[#102B63] via-[#1A3D85] to-[#12316E] border-amber-400/90 shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                      : 'bg-[#0B1E45]/80 border-[#1B366B] shadow-inner'
                  }`}
                >
                  {/* Left Side: Points + Status Icon + Answer Text */}
                  <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0 pr-2">
                    {/* Fixed Points Badge */}
                    <div
                      className={`shrink-0 px-2.5 py-1 rounded font-mono font-black text-xs md:text-base lg:text-lg tracking-wider ${
                        isRevealed
                          ? 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                          : 'bg-[#061430] border border-[#1E3B70] text-amber-300/90'
                      }`}
                    >
                      {ans?.points || (100 - idx * 10)}
                    </div>

                    {/* Status Icon */}
                    <div className="shrink-0">
                      {isRevealed ? (
                        <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-amber-300 stroke-[2.5]" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-500 stroke-[2]" />
                      )}
                    </div>

                    {/* Answer Text */}
                    <span
                      className={`truncate text-xs md:text-sm lg:text-base xl:text-lg font-bold tracking-wide uppercase ${
                        isRevealed
                          ? 'text-white font-extrabold drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]'
                          : 'text-slate-400/80 italic font-medium'
                      }`}
                    >
                      {isRevealed ? ans?.text : 'OPTION LOCKED'}
                    </span>
                  </div>

                  {/* Right Side Pill */}
                  <div className="shrink-0">
                    <span
                      className={`text-[10px] md:text-xs font-mono font-bold uppercase tracking-widest ${
                        isRevealed ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    >
                      {isRevealed ? 'REVEALED' : `${ans?.points || (100 - idx * 10)} PTS`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Compact Presentation Footer */}
      <footer className="w-full shrink-0 pt-2 pb-0.5 px-3 flex items-center justify-between text-[11px] text-slate-400/80 border-t border-[#18315E]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="font-semibold uppercase tracking-wider text-amber-200/90">
            Operations Management Live Game Show
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] md:text-[11px]">
          <span>10 Locked Answers: 100 to 10 Points</span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-rose-300 font-bold">&minus;10 Pts Penalty per Wrong Guess</span>
        </div>
      </footer>
    </div>
  );
};
