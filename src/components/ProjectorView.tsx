/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GameConfig, GameState } from '../types/game';
import { calculateScore } from '../utils/gameState';
import { PyramidBoard } from './PyramidBoard';
import { TimerClock } from './TimerClock';
import { Maximize2, Minimize2, XCircle } from 'lucide-react';

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

  // Watch for new wrong guess events and show brief, clean feedback
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

  const currentQIndex = state.currentQuestionIndex ?? 0;
  const currentQ = config.questions[currentQIndex] || config.questions[0];
  const revealedForCurrent = state.revealedMap[currentQIndex] || Array(10).fill(false);
  const currentWrongGuesses = state.wrongGuessesMap?.[currentQIndex] || 0;

  // Calculate authoritative score
  const score = calculateScore(currentQ, revealedForCurrent, currentWrongGuesses);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#F8F9FA] text-[#1E293B] flex flex-col justify-between p-4 md:p-8 select-none relative overflow-x-hidden"
    >
      {/* Optional Top Return Banner if in same window */}
      {onBackToHost && (
        <div className="max-w-5xl mx-auto w-full mb-3 flex items-center justify-between bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs">
          <span>Projector Display Mode (Audience View)</span>
          <button
            type="button"
            onClick={onBackToHost}
            className="px-2.5 py-0.5 font-semibold bg-white/20 hover:bg-white/30 rounded cursor-pointer transition-colors"
          >
            ← Return to Host Control
          </button>
        </div>
      )}

      {/* Top Presentation Header */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            {config.gameName || 'OPS FORTUNE'}
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 tracking-wide mt-0.5">
            {config.subtitle || 'Connect. Decode. Score.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-500">
                Question {currentQIndex + 1} of 30
              </span>
              <span className="text-slate-300">·</span>
              <div className="inline-flex items-center gap-1 bg-white border border-slate-200/90 shadow-2xs px-2.5 py-0.5 rounded">
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400">
                  Score
                </span>
                <span
                  className={`font-mono font-black text-sm md:text-base tabular-nums ${
                    score.currentScore < 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {score.currentScore} PTS
                </span>
              </div>
            </div>
            <div className="text-[11px] md:text-xs text-slate-500 mt-1 flex items-center justify-end gap-2 font-mono">
              <span className="text-emerald-700 font-semibold">
                +{score.correctPoints} ({score.correctCount}/10)
              </span>
              {score.wrongGuessCount > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-rose-600 font-semibold">
                    −{score.wrongPenalty} ({score.wrongGuessCount} wrong)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Realtime Sync Status Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded text-[11px] text-slate-500 font-medium"
            title={
              isFirebaseConnected
                ? 'Firebase Realtime: Connected (Live)'
                : 'Firebase Realtime: Reconnecting / Cached'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isFirebaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="hidden sm:inline">
              {isFirebaseConnected ? 'Live' : 'Cached'}
            </span>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Main Center Stage: Question Title, Timer, and Pyramid */}
      <main className="max-w-5xl mx-auto w-full my-auto flex flex-col items-center py-4">
        {/* Brief Professional Wrong Guess Visual Indicator */}
        {showWrongBanner && (
          <div className="w-full max-w-md mx-auto mb-4 py-3 px-6 bg-white border-2 border-rose-600 rounded-lg shadow-md text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-widest text-rose-600 mb-0.5">
              <XCircle className="w-4 h-4 stroke-[2.5]" />
              WRONG GUESS
            </div>
            <div className="font-mono text-2xl md:text-3xl font-black text-rose-600 tracking-tight">
              −10 POINTS
            </div>
          </div>
        )}

        {/* Question Title & Prompt */}
        <div className="text-center mb-4 max-w-3xl">
          <div className="inline-block mb-1.5">
            <span className="text-xs font-extrabold tracking-widest text-slate-600 uppercase border-b-2 border-slate-900 pb-0.5">
              Round {currentQIndex + 1}
            </span>
          </div>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 mb-2">
            {currentQ.title}
          </h2>
          {currentQ.prompt && (
            <p className="text-sm md:text-base text-slate-600 max-w-2xl mx-auto">
              {currentQ.prompt}
            </p>
          )}
        </div>

        {/* Big Centered Presentation Timer */}
        <div className="my-2 md:my-3">
          <TimerClock
            remainingSeconds={state.timerRemaining}
            status={state.timerStatus}
            size="large"
          />
        </div>

        {/* 10-Level Audience Pyramid Board */}
        <div className="w-full mt-2">
          <PyramidBoard
            answers={currentQ.answers}
            revealed={revealedForCurrent}
            mode="projector"
            size="large"
          />
        </div>
      </main>

      {/* Subtle Presentation Footer */}
      <footer className="max-w-5xl mx-auto w-full pt-3 text-center border-t border-slate-200/60 text-xs text-slate-400">
        <span>Operations Management Quiz Challenge</span>
        <span className="mx-2">·</span>
        <span>Fixed 100 to 10 Points Scale · −10 Pts Wrong Guess</span>
      </footer>
    </div>
  );
};
