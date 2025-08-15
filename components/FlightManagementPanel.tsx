import React, { useState, useEffect } from 'react';
import { FlightInfo } from '../types/weather';
import { fetchFlights } from '../lib/weatherApi';

export function FlightManagementPanel() {
  const [flights, setFlights] = useState<FlightInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFlights = async () => {
      try {
        const flightData = await fetchFlights();
        setFlights(flightData);
      } catch (error) {
        console.error('Error loading flights:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFlights();
    const interval = setInterval(loadFlights, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'text-blue-400';
      case 'DEPARTED': return 'text-green-400';
      case 'ENROUTE': return 'text-cyan-400';
      case 'DELAYED': return 'text-yellow-400';
      case 'CANCELLED': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-lg font-bold mb-4">Flight Operations</h3>
        <div className="text-center text-gray-400">Loading flights...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 mb-6">
      <h3 className="text-lg font-bold mb-4 flex items-center">
        ✈️ Flight Operations
        <span className="ml-2 text-sm bg-blue-600 px-2 py-1 rounded">
          {flights.length} Active
        </span>
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {flights.map(flight => (
          <div key={flight.id} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
            {/* Flight Header */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold text-white">{flight.callsign}</div>
                <div className="text-sm text-gray-400">{flight.aircraft}</div>
              </div>
              <div className={`text-sm font-semibold ${getStatusColor(flight.status)}`}>
                {flight.status}
              </div>
            </div>

            {/* Route */}
            <div className="text-center mb-2">
              <span className="font-mono text-blue-400">{flight.departure}</span>
              <span className="mx-2 text-gray-500">→</span>
              <span className="font-mono text-blue-400">{flight.arrival}</span>
              {flight.alternate && (
                <div className="text-xs text-gray-400 mt-1">
                  Alt: {flight.alternate}
                </div>
              )}
            </div>

            {/* Times */}
            <div className="flex justify-between text-xs text-gray-300 mb-3">
              <div>
                <div className="text-gray-400">ETD</div>
                <div>{flight.etd.toLocaleTimeString().slice(0, 5)}</div>
              </div>
              <div>
                <div className="text-gray-400">ETA</div>
                <div>{flight.eta.toLocaleTimeString().slice(0, 5)}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button className="flex-1 bg-blue-600 px-2 py-1 rounded text-white hover:bg-blue-700 text-xs transition-colors">
                Track
              </button>
              <button className="flex-1 bg-gray-600 px-2 py-1 rounded text-white hover:bg-gray-700 text-xs transition-colors">
                Weather
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
