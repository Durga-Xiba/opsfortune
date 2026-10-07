/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameConfig, GameState } from '../types/game';
import { calculateScore } from '../utils/gameState';
import { PyramidBoard } from './PyramidBoard';
import { TimerClock } from './TimerClock';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  ExternalLink,
  Edit3,
  Columns,
  Square,
  AlertCircle,
  Volume2,
  XCircle,
  Undo2,
} from 'lucide-react';

import { FirebaseSyncStatus } from './FirebaseSyncStatus';

interface HostControlProps {
  config: GameConfig;
  state: GameState;
  onRevealAnswer: (answerIndex: number) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
  onResetQuestion: () => void;
  onWrongGuess: () => void;
  onUndoWrongGuess?: () => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onResetTimer: () => void;
  onChangeQuestion: (newIndex: number) => void;
  onOpenEdit: () => void;
  onResetGameplay: () => void;
  onOpenProjectorWindow: () => void;
  popupBlockedNotice?: boolean;
  isFirebaseConnected?: boolean;
}

export const HostControl: React.FC<HostControlProps> = ({
  config,
  state,
  onRevealAnswer,
  onRevealAll,
  onHideAll,
  onResetQuestion,
  onWrongGuess,
  onUndoWrongGuess,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onChangeQuestion,
  onOpenEdit,
  onResetGameplay,
  onOpenProjectorWindow,
  popupBlockedNotice,
  isFirebaseConnected = false,
}) => {
  const [layoutMode, setLayoutMode] = useState<'focused' | 'split'>('focused');
  const [showResetGameConfirm, setShowResetGameConfirm] = useState(false);
  const [wrongAlertVisible, setWrongAlertVisible] = useState(false);

  const currentQIndex = state.currentQuestionIndex ?? 0;
  const currentQ = config.questions[currentQIndex] || config.questions[0];
  const revealedForCurrent = state.revealedMap[currentQIndex] || Array(10).fill(false);
  const currentWrongGuesses = state.wrongGuessesMap?.[currentQIndex] || 0;

  // Authoritative score calculation
  const score = calculateScore(currentQ, revealedForCurrent, currentWrongGuesses);

  // Trigger visual alert when wrong guess occurs
  const handleWrongGuessClick = () => {
    onWrongGuess();
    setWrongAlertVisible(true);
  };

  useEffect(() => {
    if (wrongAlertVisible) {
      const timer = setTimeout(() => {
        setWrongAlertVisible(false);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [wrongAlertVisible]);

  const isTimerRunning = state.timerStatus === 'RUNNING';

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-5">
      {/* Top Bar: Brand, Question Nav, Actions */}
      <header className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-lg tracking-wider shadow-2xs">
            OF
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                {config.gameName || 'OPS FORTUNE'}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Host Control
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {config.subtitle || 'Connect. Decode. Score.'}
            </p>
          </div>
        </div>

        {/* Question Selector & Prev / Next */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentQIndex === 0}
            onClick={() => onChangeQuestion(currentQIndex - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            PREV
          </button>

          {/* Direct Dropdown */}
          <div className="relative">
            <select
              value={currentQIndex}
              onChange={(e) => onChangeQuestion(Number(e.target.value))}
              className="appearance-none bg-slate-50 border border-slate-300 rounded px-3 py-1.5 pr-8 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
            >
              {config.questions.map((q, idx) => (
                <option key={q.id || idx} value={idx}>
                  Q{idx + 1}: {q.title}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-600">
              <span className="text-[10px]">▼</span>
            </div>
          </div>

          <button
            type="button"
            disabled={currentQIndex === 19}
            onClick={() => onChangeQuestion(currentQIndex + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            NEXT
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider ml-1">
            Q{currentQIndex + 1} of 20
          </span>
        </div>

        {/* View / Window Actions */}
        <div className="flex items-center gap-2">
          {/* Layout Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
            <button
              type="button"
              onClick={() => setLayoutMode('focused')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                layoutMode === 'focused'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Full Focused Host Pyramid"
            >
              <Square className="w-3.5 h-3.5" />
              Host Pyramid
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Side-by-side Projector Mirror & Host Pyramid"
            >
              <Columns className="w-3.5 h-3.5" />
              Mirror Split
            </button>
          </div>

          {/* Projector Window Launcher */}
          <button
            type="button"
            onClick={onOpenProjectorWindow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Projector Display
          </button>

          {/* Edit Questions Button */}
          <button
            type="button"
            onClick={onOpenEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Questions
          </button>

          {/* Firebase Realtime Connection Status */}
          <FirebaseSyncStatus isConnected={isFirebaseConnected} />
        </div>
      </header>

      {/* Popup Blocked Warning if applicable */}
      {popupBlockedNotice && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium">
              Projector window was blocked by the browser. Please allow pop-ups for this site.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenProjectorWindow}
            className="px-3 py-1 font-bold text-xs bg-amber-200/80 hover:bg-amber-300 text-amber-900 border border-amber-300 rounded cursor-pointer transition-colors shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Synchronous Timer & Round Control Banner */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 md:p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Question Headline */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
                Question {currentQIndex + 1} of 20
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-medium text-slate-500">2-Minute Timed Round</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 mt-0.5">
              {currentQ.title}
            </h2>
            {currentQ.prompt && (
              <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-xl">
                {currentQ.prompt}
              </p>
            )}
          </div>

          {/* Central Authoritative Timer Display */}
          <div className="flex flex-col items-center">
            <TimerClock
              remainingSeconds={state.timerRemaining}
              status={state.timerStatus}
              size="normal"
            />
            <div className="flex items-center gap-1.5 mt-2">
              {isTimerRunning ? (
                <button
                  type="button"
                  onClick={onPauseTimer}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-slate-800 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  PAUSE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartTimer}
                  disabled={state.timerStatus === 'TIME_UP'}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  START
                </button>
              )}

              <button
                type="button"
                onClick={onResetTimer}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                title="Reset Timer to 02:00"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RESET
              </button>
            </div>
          </div>

          {/* Live Reveal Score Summary */}
          <div className="flex flex-col items-center md:items-end justify-center bg-slate-50 border border-slate-200/80 rounded-md p-3 min-w-[200px]">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Current Question Score
            </span>
            <div
              className={`text-lg md:text-xl font-black mt-0.5 tabular-nums ${
                score.currentScore < 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {score.currentScore} PTS
            </div>
            <div className="text-[11px] font-mono text-slate-600 mt-0.5">
              <span className="text-emerald-700 font-semibold">+{score.correctPoints}</span> ({score.correctCount}/10) ·{' '}
              <span className="text-rose-600 font-semibold">−{score.wrongPenalty}</span> ({score.wrongGuessCount} wrong)
            </div>
          </div>
        </div>

        {/* Audio Buzzer Status Info */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Automatic Buzzer: Beeps every 10s · Distinct horn at 00:00 TIME UP</span>
          </div>
          <span className="font-mono text-slate-400">
            {state.buzzerHistory.length > 0 ? `${state.buzzerHistory.length} beeps triggered` : 'Ready'}
          </span>
        </div>
      </section>

      {/* Main Pyramid Interactive Stage */}
      {layoutMode === 'focused' ? (
        /* FOCUSED VIEW: The Pyramid IS the central host answer bank */
        <main className="bg-white border border-slate-200 rounded-lg p-5 md:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>HOST INTERACTIVE PYRAMID</span>
                <span className="text-xs font-normal text-slate-500">
                  (Click any level to reveal it on the projector)
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Top level: 100 points · Base level: 10 points. Answers remain visible to you and turn dark navy upon reveal.
              </p>
            </div>

            {/* Batch Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRevealAll}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                REVEAL ALL
              </button>
              <button
                type="button"
                onClick={onHideAll}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
              >
                <EyeOff className="w-3.5 h-3.5" />
                HIDE ALL
              </button>
              <button
                type="button"
                onClick={onResetQuestion}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RESET THIS QUESTION
              </button>
            </div>
          </div>

          {/* Full Interactive Host Pyramid Board */}
          <div className="py-2">
            {/* Brief Wrong Guess Alert Indicator */}
            {wrongAlertVisible && (
              <div className="max-w-md mx-auto mb-3 p-3 bg-rose-600 text-white rounded-md shadow-sm flex items-center justify-between animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-200 shrink-0" />
                  <span className="font-extrabold uppercase tracking-wide text-xs md:text-sm">
                    WRONG GUESS RECORDED
                  </span>
                </div>
                <span className="font-mono font-black text-base md:text-lg bg-rose-700/90 px-2.5 py-0.5 rounded">
                  −10 POINTS
                </span>
              </div>
            )}

            <PyramidBoard
              answers={currentQ.answers}
              revealed={revealedForCurrent}
              mode="host"
              onAnswerClick={onRevealAnswer}
              size="normal"
            />

            {/* Dedicated Wrong Guess & Score Bar */}
            <div className="max-w-4xl mx-auto mt-5 pt-4 border-t border-slate-200/90 bg-slate-50/90 rounded-lg p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleWrongGuessClick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs md:text-sm rounded-md shadow-2xs transition-colors cursor-pointer"
                  title="Record an incorrect answer and deduct 10 points"
                >
                  <XCircle className="w-4 h-4 stroke-[2.5]" />
                  WRONG GUESS −10
                </button>

                {score.wrongGuessCount > 0 && onUndoWrongGuess && (
                  <button
                    type="button"
                    onClick={onUndoWrongGuess}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Undo last wrong guess"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo (-1)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="text-center sm:text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Wrong Guesses
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {score.wrongGuessCount}{' '}
                    <span className="text-rose-600">(−{score.wrongPenalty})</span>
                  </span>
                </div>

                <div className="h-6 w-px bg-slate-200" />

                <div className="text-center sm:text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Correct
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    +{score.correctPoints}
                  </span>
                </div>

                <div className="h-6 w-px bg-slate-200" />

                <div className="text-center sm:text-right bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Current Score
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
            </div>
          </div>
        </main>
      ) : (
        /* DUAL MIRROR SPLIT VIEW: Left is Projector Mirror, Right is Host Interactive Pyramid */
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Panel: Projector Mirror (Audience view preview) */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-4 md:p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    PROJECTOR MIRROR
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    This is what the audience sees (hidden until revealed).
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Audience View
                </span>
              </div>

              {/* Mirror Pyramid */}
              <div className="py-1">
                <PyramidBoard
                  answers={currentQ.answers}
                  revealed={revealedForCurrent}
                  mode="projector"
                  size="compact"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-center text-xs text-slate-400">
              Projector Mirror · Synchronized in real time
            </div>
          </div>

          {/* Right Panel: Host Answer Bank Pyramid (Clickable) */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 md:p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    HOST ANSWER BANK PYRAMID
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Click an answer level to reveal it on the projector.
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onRevealAll}
                    className="p-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                    title="Reveal All"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onHideAll}
                    className="p-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                    title="Hide All"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onResetQuestion}
                    className="p-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100 cursor-pointer"
                    title="Reset Question"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Host Interactive Pyramid */}
              <div className="py-1">
                {wrongAlertVisible && (
                  <div className="mb-2 p-2 bg-rose-600 text-white rounded text-xs font-bold flex items-center justify-between animate-in fade-in duration-150">
                    <span className="flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" />
                      WRONG GUESS
                    </span>
                    <span>−10 POINTS</span>
                  </div>
                )}

                <PyramidBoard
                  answers={currentQ.answers}
                  revealed={revealedForCurrent}
                  mode="host"
                  onAnswerClick={onRevealAnswer}
                  size="compact"
                />

                {/* Wrong Guess Bar for Split Mode */}
                <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleWrongGuessClick}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      WRONG GUESS −10
                    </button>
                    {score.wrongGuessCount > 0 && onUndoWrongGuess && (
                      <button
                        type="button"
                        onClick={onUndoWrongGuess}
                        className="p-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
                        title="Undo"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-mono font-bold text-slate-700 block">
                      {score.wrongGuessCount} wrong ·{' '}
                      <span className={score.currentScore < 0 ? 'text-rose-600' : 'text-slate-900'}>
                        {score.currentScore} pts
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-500">
              Host View · Answers are always visible to you
            </div>
          </div>
        </main>
      )}

      {/* Bottom Global Controls: Quick Question Grid & Game Reset */}
      <footer className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Compact 20-Question Jump Bar */}
        <div className="flex flex-wrap items-center gap-1 max-w-2xl">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Jump to Question:
          </span>
          {config.questions.slice(0, 20).map((q, idx) => {
            const isCurrent = idx === currentQIndex;
            const revCount = (state.revealedMap[idx] || []).filter(Boolean).length;
            return (
              <button
                key={q.id || idx}
                type="button"
                onClick={() => onChangeQuestion(idx)}
                className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-slate-900 text-white shadow-2xs ring-1 ring-slate-900'
                    : revCount > 0
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title={`Q${idx + 1}: ${q.title} (${revCount}/10 revealed)`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Reset Gameplay Action */}
        <div className="flex items-center gap-2">
          {showResetGameConfirm ? (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 p-1.5 rounded">
              <span className="text-xs text-rose-800 font-semibold">Reset all gameplay?</span>
              <button
                type="button"
                onClick={() => {
                  onResetGameplay();
                  setShowResetGameConfirm(false);
                }}
                className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 rounded hover:bg-rose-700 cursor-pointer"
              >
                Yes, Reset
              </button>
              <button
                type="button"
                onClick={() => setShowResetGameConfirm(false)}
                className="px-2 py-1 text-xs text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowResetGameConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RESET GAMEPLAY
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
