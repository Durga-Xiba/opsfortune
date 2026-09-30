/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  getActiveFirebaseConfig,
  saveActiveFirebaseConfig,
  FirebaseSyncConfig,
} from '../utils/firebaseSync';
import { Wifi, WifiOff, Settings2, X, Check, Database } from 'lucide-react';

interface FirebaseSyncStatusProps {
  isConnected: boolean;
  onConfigChanged?: () => void;
  compact?: boolean;
}

export const FirebaseSyncStatus: React.FC<FirebaseSyncStatusProps> = ({
  isConnected,
  onConfigChanged,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<FirebaseSyncConfig>(getActiveFirebaseConfig);
  const [savedToast, setSavedToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveActiveFirebaseConfig(config);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
    if (onConfigChanged) {
      onConfigChanged();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
          isConnected
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
        }`}
        title="Firebase Realtime Database synchronization status"
      >
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          ></span>
        </span>

        {compact ? (
          <Database className="w-3 h-3 text-slate-500" />
        ) : (
          <span className="hidden sm:inline">
            {isConnected ? 'Firebase Live' : 'Offline Cache'}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded ${
                    isConnected
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isConnected ? (
                    <Wifi className="w-4 h-4" />
                  ) : (
                    <WifiOff className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Firebase Realtime Database
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cross-APK Live State Synchronization
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-3 text-xs space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Connection Status:</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    isConnected ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {isConnected ? 'Connected (Live RTDB)' : 'Connecting / Offline'}
                </span>
              </div>

              <div className="text-[11px] text-slate-500">
                Sync Path:{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">
                  /opsFortune/liveState
                </code>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Database URL
                </label>
                <input
                  type="text"
                  value={config.databaseURL}
                  onChange={(e) =>
                    setConfig({ ...config, databaseURL: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  placeholder="https://your-rtdb.firebaseio.com"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Project ID
                </label>
                <input
                  type="text"
                  value={config.projectId}
                  onChange={(e) =>
                    setConfig({ ...config, projectId: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  placeholder="my-project-id"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {savedToast ? (
                  <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Saved! Reload to apply
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Stored locally in app settings
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                  >
                    Save Config
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
