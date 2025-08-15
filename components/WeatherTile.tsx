import React from 'react';
import { WeatherData, Minima } from '../types/weather';
import { highlightWeatherText } from '../lib/weatherParser';

interface WeatherTileProps {
  icao: string;
  weatherData?: WeatherData;
  minima: Minima;
  usingDefault: boolean;
  isLoading: boolean;
  onRemove: () => void;
  onUpdateMinima: (icao: string, field: keyof Minima, value: number) => void;
  onResetMinima: () => void;
}

export function WeatherTile({
  icao,
  weatherData,
  minima,
  usingDefault,
  isLoading,
  onRemove,
  onUpdateMinima,
  onResetMinima
}: WeatherTileProps) {
  const tafHighlight = weatherData?.taf ? 
    highlightWeatherText(weatherData.taf, minima) : 
    { html: '', hasViolations: false };

  // Border color logic - exactly matching original
  let borderColor = 'border-gray-700'; // Default
  
  if (weatherData) {
    if (weatherData.error) {
      borderColor = 'border-yellow-500'; // Error state
    } else if (weatherData.taf && tafHighlight.html) {
      // Only check TAF violations if we have TAF data
      borderColor = tafHighlight.hasViolations ? 'border-red-500' : 'border-green-500';
    } else {
      borderColor = 'border-green-500'; // Has data but no TAF violations detected
    }
  }

  return (
    <div className={`flight-tile bg-gray-800 rounded-xl shadow-md p-4 border ${borderColor}`}>
      <button
        onClick={onRemove}
        type="button"
        className="weather-remove-btn"
        title="Remove ICAO"
        aria-label={`Remove ${icao}`}
      >
        <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
          <path d="M5.5 14.5l9-9m-9 0l9 9" strokeLinecap="round"/>
          <rect x="3" y="3" width="14" height="14" rx="7" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        </svg>
      </button>

      <div className="flight-title text-2xl font-bold text-center">{icao}</div>
      
      <div className="flex gap-3 items-center mt-2 text-xs">
        <label className={usingDefault ? 'minima-default' : ''}>
          Ceil: 
          <input
            type="number"
            value={minima.ceiling}
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1 transition-colors border border-gray-600"
            onChange={(e) => onUpdateMinima(icao, 'ceiling', parseFloat(e.target.value) || 0)}
            min="0"
            step="100"
          />
        </label>
        <label className={usingDefault ? 'minima-default' : ''}>
          Vis: 
          <input
            type="number"
            value={minima.vis}
            step="0.1"
            className="bg-gray-700 p-1 rounded w-20 text-center ml-1 transition-colors border border-gray-600"
            onChange={(e) => onUpdateMinima(icao, 'vis', parseFloat(e.target.value) || 0)}
            min="0"
          />
        </label>
        {usingDefault ? (
          <span className="minima-default">(default)</span>
        ) : (
          <button className="minima-reset-btn" onClick={onResetMinima}>
            reset
          </button>
        )}
      </div>

      {isLoading && (
        <div className="mt-2 text-center text-blue-400">Loading...</div>
      )}

      {weatherData?.error && (
        <div className="mt-2 text-xs text-yellow-400">
          <strong>Error:</strong> {weatherData.error}
        </div>
      )}

      {weatherData?.metar && (
        <div className="mt-2 text-xs">
          <strong>METAR:</strong> {weatherData.metar}
        </div>
      )}

      {weatherData?.taf && (
        <div className="mt-2 text-xs taf-block">
          <strong>TAF:</strong>
          <div dangerouslySetInnerHTML={{ __html: tafHighlight.html }} />
        </div>
      )}
    </div>
  );
}
