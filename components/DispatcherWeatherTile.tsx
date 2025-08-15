import React from 'react';
import { StationStatus } from '../types/weather';

interface DispatcherWeatherTileProps {
  station: StationStatus;
  onRemove: () => void;
  onViewDetails: () => void;
}

export function DispatcherWeatherTile({ 
  station, 
  onRemove, 
  onViewDetails 
}: DispatcherWeatherTileProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NORMAL': return 'border-green-500';
      case 'CAUTION': return 'border-yellow-500';
      case 'CRITICAL': return 'border-red-500';
      default: return 'border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'NORMAL': return '✅';
      case 'CAUTION': return '⚠️';
      case 'CRITICAL': return '🚨';
      default: return '❓';
    }
  };

  return (
    <div className={`flight-tile bg-gray-800 rounded-xl shadow-md p-4 border ${getStatusColor(station.operationalStatus)}`}>
      <button
        onClick={onRemove}
        type="button"
        className="weather-remove-btn"
        title="Remove Station"
      >
        <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
          <path d="M5.5 14.5l9-9m-9 0l9 9" strokeLinecap="round"/>
          <rect x="3" y="3" width="14" height="14" rx="7" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        </svg>
      </button>

      <div className="flight-title text-xl font-bold text-center mb-1">{station.icao}</div>
      <div className="text-center text-sm text-gray-400 mb-3">{station.name}</div>

      {/* Operational Status */}
      <div className="flex items-center justify-center mb-3">
        <span className="text-2xl mr-2">{getStatusIcon(station.operationalStatus)}</span>
        <div className="text-center">
          <div className="font-semibold">{station.operationalStatus}</div>
          <div className="text-sm text-gray-400">
            Delay Risk: {station.delayProbability}%
          </div>
        </div>
      </div>

      {/* Quick Weather Summary */}
      {station.metar.metar && (
        <div className="text-xs mb-2">
          <strong>Current:</strong> {station.metar.metar.substring(0, 50)}...
        </div>
      )}

      {/* Alert Summary */}
      <div className="flex justify-between text-xs mb-3">
        <div className="text-center">
          <div className="font-semibold text-blue-400">{station.pireps.length}</div>
          <div className="text-gray-400">PIREPs</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-orange-400">{station.sigmets.length}</div>
          <div className="text-gray-400">SIGMETs</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-green-400">
            {station.operationalStatus === 'NORMAL' ? '0' : '1+'}
          </div>
          <div className="text-gray-400">Issues</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 bg-blue-600 px-2 py-1 rounded text-white hover:bg-blue-700 text-sm transition-colors"
        >
          Details
        </button>
        <button className="flex-1 bg-gray-600 px-2 py-1 rounded text-white hover:bg-gray-700 text-sm transition-colors">
          Monitor
        </button>
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-center mt-2">
        Updated: {station.lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}
