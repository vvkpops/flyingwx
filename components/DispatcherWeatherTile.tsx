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

  const getDelayRiskColor = (risk: number) => {
    if (risk >= 70) return 'text-red-400';
    if (risk >= 40) return 'text-yellow-400';
    if (risk >= 20) return 'text-orange-400';
    return 'text-green-400';
  };

  // Get weather summary from METAR
  const getWeatherSummary = (metar: string) => {
    if (!metar) return 'No data';
    
    // Extract key info from METAR
    const visMatch = metar.match(/(\d+)SM/);
    const ceilingMatch = metar.match(/(OVC|BKN)(\d{3})/);
    const windMatch = metar.match(/(\d{3})(\d{2,3})KT/);
    
    const visibility = visMatch ? `${visMatch[1]}SM` : '';
    const ceiling = ceilingMatch ? `${ceilingMatch[1]}${parseInt(ceilingMatch[2]) * 100}` : '';
    const wind = windMatch ? `${windMatch[1]}°/${windMatch[2]}kt` : '';
    
    return [visibility, ceiling, wind].filter(Boolean).join(' ') || metar.substring(0, 30) + '...';
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
          <div className={`text-sm font-semibold ${getDelayRiskColor(station.delayProbability)}`}>
            {station.delayProbability}% delay risk
          </div>
        </div>
      </div>

      {/* Weather Summary */}
      {station.metar.metar && (
        <div className="text-xs mb-2 bg-gray-700 rounded p-2">
          <div className="text-gray-400 mb-1">Current:</div>
          <div className="text-white">
            {getWeatherSummary(station.metar.metar)}
          </div>
        </div>
      )}

      {/* Alert Summary */}
      <div className="flex justify-between text-xs mb-3">
        <div className="text-center">
          <div className={`font-semibold ${station.pireps.length > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
            {station.pireps.length}
          </div>
          <div className="text-gray-400">PIREPs</div>
        </div>
        <div className="text-center">
          <div className={`font-semibold ${station.sigmets.length > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
            {station.sigmets.length}
          </div>
          <div className="text-gray-400">Warnings</div>
        </div>
        <div className="text-center">
          <div className={`font-semibold ${
            station.operationalStatus === 'CRITICAL' ? 'text-red-400' :
            station.operationalStatus === 'CAUTION' ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {station.operationalStatus === 'NORMAL' ? '0' : station.sigmets.filter(s => s.severity === 'SEVERE').length || '1'}
          </div>
          <div className="text-gray-400">Critical</div>
        </div>
      </div>

      {/* Error Display */}
      {station.metar.error && (
        <div className="text-xs text-red-400 mb-2 bg-red-900 rounded p-2">
          Error: {station.metar.error}
        </div>
      )}

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
