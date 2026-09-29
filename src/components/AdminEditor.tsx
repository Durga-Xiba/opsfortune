/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GameConfig, GameQuestion } from '../types/game';
import { DEFAULT_QUESTIONS, FIXED_POINTS } from '../data/defaultQuestions';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Save, X } from 'lucide-react';

interface AdminEditorProps {
  initialConfig: GameConfig;
  onSave: (newConfig: GameConfig) => void;
  onCancel: () => void;
  onResetToDefaults: () => void;
}

export const AdminEditor: React.FC<AdminEditorProps> = ({
  initialConfig,
  onSave,
  onCancel,
  onResetToDefaults,
}) => {
  // Deep clone to allow discarding edits
  const [config, setConfig] = useState<GameConfig>(() => {
    return JSON.parse(JSON.stringify(initialConfig));
  });

  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const currentQ: GameQuestion = config.questions[activeQuestionIndex] || {
    id: activeQuestionIndex + 1,
    title: `Question ${activeQuestionIndex + 1}`,
    prompt: '',
    answers: FIXED_POINTS.map((pts) => ({ text: `Option ${pts}`, points: pts })),
  };

  const handleUpdateQuestionTitle = (title: string) => {
    setConfig((prev) => {
      const copy = { ...prev, questions: [...prev.questions] };
      copy.questions[activeQuestionIndex] = {
        ...copy.questions[activeQuestionIndex],
        title,
      };
      return copy;
    });
  };

  const handleUpdateQuestionPrompt = (prompt: string) => {
    setConfig((prev) => {
      const copy = { ...prev, questions: [...prev.questions] };
      copy.questions[activeQuestionIndex] = {
        ...copy.questions[activeQuestionIndex],
        prompt,
      };
      return copy;
    });
  };

  const handleUpdateAnswerText = (answerIdx: number, text: string) => {
    setConfig((prev) => {
      const copy = { ...prev, questions: [...prev.questions] };
      const q = copy.questions[activeQuestionIndex];
      const newAnswers = [...q.answers];
      newAnswers[answerIdx] = {
        ...newAnswers[answerIdx],
        text,
        points: FIXED_POINTS[answerIdx], // Guarantee point immutability
      };
      copy.questions[activeQuestionIndex] = { ...q, answers: newAnswers };
      return copy;
    });
  };

  const handleSave = () => {
    onSave(config);
    setSaveToast('Changes saved successfully.');
    setTimeout(() => {
      setSaveToast(null);
    }, 2500);
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 md:px-8">
      {/* Top Banner / Actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              EDIT GAME CONTENT
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              Customize game title, subtitle, and all 30 questions with their 10 answers. Fixed point values (100 to 10) are preserved.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>

        {saveToast && (
          <div className="mt-3 flex items-center gap-2 text-xs md:text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2.5 animate-in fade-in duration-150">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{saveToast}</span>
          </div>
        )}

        {/* Global Game Branding Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Game Name
            </label>
            <input
              type="text"
              value={config.gameName}
              onChange={(e) => setConfig({ ...config, gameName: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="e.g. OPS FORTUNE"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Tagline / Subtitle
            </label>
            <input
              type="text"
              value={config.subtitle}
              onChange={(e) => setConfig({ ...config, subtitle: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="e.g. Connect. Decode. Score."
            />
          </div>
        </div>
      </div>

      {/* 30-Question Compact Navigation Strip */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Select Question to Edit ({activeQuestionIndex + 1} of 30)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={activeQuestionIndex === 0}
              onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
              className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Previous Question"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={activeQuestionIndex === 29}
              onClick={() => setActiveQuestionIndex((prev) => Math.min(29, prev + 1))}
              className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Next Question"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {config.questions.map((q, idx) => {
            const isSelected = idx === activeQuestionIndex;
            return (
              <button
                key={q.id || idx}
                type="button"
                onClick={() => setActiveQuestionIndex(idx)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Q{idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Question Editor Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs mb-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-white bg-slate-900 px-2 py-0.5 rounded">
              QUESTION {activeQuestionIndex + 1}
            </span>
            <span className="text-sm font-semibold text-slate-600">
              {currentQ.title || 'Untitled'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeQuestionIndex === 0}
              onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded disabled:opacity-30 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={activeQuestionIndex === 29}
              onClick={() => setActiveQuestionIndex((prev) => Math.min(29, prev + 1))}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded disabled:opacity-30 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Question Title / Topic
            </label>
            <input
              type="text"
              value={currentQ.title}
              onChange={(e) => handleUpdateQuestionTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-base font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="e.g. PROCUREMENT & SOURCING"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Question Prompt / Description (Audience Context)
            </label>
            <input
              type="text"
              value={currentQ.prompt || ''}
              onChange={(e) => handleUpdateQuestionPrompt(e.target.value)}
              className="w-full px-3.5 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="e.g. Core business activities, contracts, and vendor interactions..."
            />
          </div>
        </div>

        {/* 10 Answers Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              10 Pyramid Answers (Fixed Point Hierarchy)
            </h3>
            <span className="text-[11px] text-slate-400">
              100 pts (Top of pyramid) down to 10 pts (Base)
            </span>
          </div>

          <div className="space-y-2">
            {currentQ.answers.map((answer, aIdx) => {
              const points = FIXED_POINTS[aIdx];
              return (
                <div
                  key={aIdx}
                  className="flex items-center gap-3 p-2 bg-slate-50/70 border border-slate-200/80 rounded"
                >
                  {/* Fixed Points (Read-Only) */}
                  <div className="shrink-0 w-24 flex items-center justify-end gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded select-none">
                    <span className="font-mono font-bold text-slate-800 tabular-nums text-sm">
                      {points}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">
                      pts
                    </span>
                  </div>

                  {/* Editable Answer text */}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={answer.text}
                      onChange={(e) => handleUpdateAnswerText(aIdx, e.target.value)}
                      className="w-full px-3 py-1.5 text-sm font-medium text-slate-800 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
                      placeholder={`Answer for ${points} pts`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Danger Zone: Reset to Defaults */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Reset Game Content
          </h4>
          <p className="text-xs text-slate-500">
            Restore all 30 questions and answers back to the default Operations Management set.
          </p>
        </div>

        {showResetConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-rose-700 font-medium">Are you sure?</span>
            <button
              type="button"
              onClick={() => {
                onResetToDefaults();
                setShowResetConfirm(false);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 cursor-pointer"
            >
              Yes, Reset Content
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 hover:text-rose-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore Default 30 Questions
          </button>
        )}
      </div>
    </div>
  );
};
