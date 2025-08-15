import React from 'react';
import { StationStatus } from '../types/weather';

interface DispatcherWeatherTileProps {
  station: StationStatus;
  onRemove: () => void;
  onViewDetails: () => void;
  onRefresh?: () => void;
}

export function DispatcherWeatherTile({ 
  station, 
  onRemove, 
  onViewDetails,
  onRefresh 
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

  // Count active vs expired items
  const activePireps = station.pireps.filter(p => !p.isExpired).length;
  const activeSigmets = station.sigmets.filter(s => s.isActive).length;
  const expiredSigmets = station.sigmets.filter(s => s.isExpired).length;

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
          <div className="text-xs text-gray-400">Operations Status</div>
        </div>
      </div>

      {/* Full METAR Display */}
      <div className="mb-3">
        {station.metar.metar ? (
          <div className="bg-gray-700 rounded p-2 text-xs">
            <div className="text-blue-400 font-semibold mb-1">METAR:</div>
            <div className="text-white font-mono leading-relaxed break-all">
              {station.metar.metar}
            </div>
          </div>
        ) : (
          <div className="bg-red-900 rounded p-2 text-xs">
            <div className="text-red-400 font-semibold">
              {station.metar.error || 'No METAR data available'}
            </div>
          </div>
        )}
      </div>

      {/* Weather Reports Summary */}
      <div className="flex justify-between text-xs mb-3">
        <div className="text-center">
          <div className={`font-semibold ${activePireps > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
            {activePireps}
          </div>
          <div className="text-gray-400">PIREPs</div>
          <div className="text-xs text-gray-500">(12hr)</div>
        </div>
        <div className="text-center">
          <div className={`font-semibold ${activeSigmets > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
            {activeSigmets}
          </div>
          <div className="text-gray-400">Active</div>
          <div className="text-xs text-gray-500">SIGMETs</div>
        </div>
        <div className="text-center">
          <div className={`font-semibold ${expiredSigmets > 0 ? 'text-gray-400' : 'text-gray-500'}`}>
            {expiredSigmets}
          </div>
          <div className="text-gray-400">Expired</div>
          <div className="text-xs text-gray-500">SIGMETs</div>
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
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="bg-gray-600 px-2 py-1 rounded text-white hover:bg-gray-700 text-sm transition-colors"
            title="Refresh Station Data"
          >
            🔄
          </button>
        )}
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-center mt-2">
        Updated: {station.lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}
