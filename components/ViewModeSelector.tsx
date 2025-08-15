import React from 'react';
import { useViewMode } from '../lib/viewContext';

export function ViewModeSelector() {
  const { viewMode, setViewMode } = useViewMode();

  return (
    <div className="flex justify-center gap-2 mb-6">
      <button
        onClick={() => setViewMode('pilot')}
        className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
          viewMode === 'pilot'
            ? 'bg-blue-600 text-white shadow-lg'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        🛩️ Pilot View
      </button>
      <button
        onClick={() => setViewMode('dispatcher')}
        className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
          viewMode === 'dispatcher'
            ? 'bg-purple-600 text-white shadow-lg'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        🏢 Dispatcher View
      </button>
    </div>
  );
}
