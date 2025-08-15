import React, { useState } from 'react';
import { Minima } from '../types/weather';

interface MinimaControlsProps {
  globalMinima: Minima;
  onUpdateGlobalMinima: (minima: Minima) => void;
}

export function MinimaControls({ globalMinima, onUpdateGlobalMinima }: MinimaControlsProps) {
  const [ceiling, setCeiling] = useState(globalMinima.ceiling.toString());
  const [vis, setVis] = useState(globalMinima.vis.toString());

  const handleApply = () => {
    const newMinima = {
      ceiling: parseFloat(ceiling) || 0,
      vis: parseFloat(vis) || 0
    };
    onUpdateGlobalMinima(newMinima);
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 mb-4">
      <div className="flex flex-wrap justify-center items-center gap-4 mb-2">
        <span className="font-bold">Weather Minima:</span>
        <label>
          Ceil (ft):
          <input
            type="number"
            value={ceiling}
            onChange={(e) => setCeiling(e.target.value)}
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1"
            min="0"
            step="100"
          />
        </label>
        <label>
          Vis (SM):
          <input
            type="number"
            value={vis}
            onChange={(e) => setVis(e.target.value)}
            step="0.1"
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1"
            min="0"
          />
        </label>
        <button
          onClick={handleApply}
          className="bg-green-600 px-3 py-1 rounded text-white hover:bg-green-700 text-sm transition-colors"
        >
          Set Default
        </button>
      </div>
    </div>
  );
}
