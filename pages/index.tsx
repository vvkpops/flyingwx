// pages/index.tsx (COMPLETE FIXED VERSION)
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { WeatherTile } from '../components/WeatherTile';
import { DispatcherWeatherTile } from '../components/DispatcherWeatherTile';
import { Clock } from '../components/Clock';
import { MinimaControls } from '../components/MinimaControls';
import { ICAOInput } from '../components/ICAOInput';
import { ViewModeSelector } from '../components/ViewModeSelector';
import { SystemOverview } from '../components/SystemOverview';
import { ViewProvider, useViewMode } from '../lib/viewContext';
import { WeatherData, Minima, StationStatus } from '../types/weather';
import { fetchWeatherData, fetchStationStatus } from '../lib/weatherApi';

const DEFAULT_MINIMA: Minima = { ceiling: 800, vis: 2 };

// Major airports for dispatcher default view
const DEFAULT_DISPATCHER_STATIONS = [
  'CYYT', 'CYQX', 'CYDF', 'CYYR', 'CYHZ', 'CYQM', 'CYWK', 'CYQB', 
  'CYUL', 'CYZV', 'CYYG', 'CYFC', 'KEWR', 'KBOS', 'KPHL'
];

function FlyingWxContent() {
  const { viewMode } = useViewMode();
  
  // Pilot view state
  const [weatherICAOs, setWeatherICAOs] = useState<string[]>([]);
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [globalMinima, setGlobalMinima] = useState<Minima>(DEFAULT_MINIMA);
  const [individualMinima, setIndividualMinima] = useState<Record<string, Minima>>({});
  
  // Dispatcher view state
  const [dispatcherStations, setDispatcherStations] = useState<StationStatus[]>([]);
  const [selectedStationDetails, setSelectedStationDetails] = useState<StationStatus | null>(null);
  
  // Shared state
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load from localStorage after hydration
  useEffect(() => {
    if (!isClient) return;

    try {
      // Load pilot view data
      const savedICAOs = localStorage.getItem('weatherICAOs');
      const savedGlobalMinima = localStorage.getItem('globalWeatherMinima');
      const savedIndividualMinima = localStorage.getItem('weatherMinima');
      
      // Load dispatcher view data
      const savedDispatcherStations = localStorage.getItem('dispatcherStations');

      if (savedICAOs) {
        setWeatherICAOs(JSON.parse(savedICAOs));
      }

      if (savedGlobalMinima) {
        setGlobalMinima(JSON.parse(savedGlobalMinima));
      }

      if (savedIndividualMinima) {
        setIndividualMinima(JSON.parse(savedIndividualMinima));
      }

      // Initialize dispatcher stations
      if (viewMode === 'dispatcher') {
        if (savedDispatcherStations) {
          const stationICAOs = JSON.parse(savedDispatcherStations);
          loadDispatcherStations(stationICAOs);
        } else {
          loadDispatcherStations(DEFAULT_DISPATCHER_STATIONS);
        }
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
      setError('Failed to load saved settings');
    }
  }, [isClient, viewMode]);

  // Save to localStorage when data changes
  useEffect(() => {
    if (!isClient) return;
    
    try {
      if (viewMode === 'pilot') {
        localStorage.setItem('weatherICAOs', JSON.stringify(weatherICAOs));
      } else {
        const stationICAOs = dispatcherStations.map(s => s.icao);
        localStorage.setItem('dispatcherStations', JSON.stringify(stationICAOs));
      }
      localStorage.setItem('globalWeatherMinima', JSON.stringify(globalMinima));
      localStorage.setItem('weatherMinima', JSON.stringify(individualMinima));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }, [weatherICAOs, dispatcherStations, globalMinima, individualMinima, isClient, viewMode]);

  // Load dispatcher station data with real API calls
  const loadDispatcherStations = useCallback(async (icaos: string[]) => {
    if (icaos.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all stations in parallel for better performance
      const stationPromises = icaos.map(async (icao) => {
        try {
          return await fetchStationStatus(icao);
        } catch (error) {
          console.error(`Error loading station ${icao}:`, error);
          // Return a basic error station status
          return {
            icao,
            name: icao,
            metar: { metar: '', taf: '', error: `Failed to load ${icao}` },
            pireps: [],
            sigmets: [],
            operationalStatus: 'CRITICAL' as const,
            lastUpdated: new Date()
          };
        }
      });
      
      const stations = await Promise.all(stationPromises);
      setDispatcherStations(stations);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading dispatcher stations:', error);
      setError('Failed to load weather stations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch weather data for pilot view with real API calls
  const updateWeatherData = useCallback(async () => {
    if (weatherICAOs.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    const newWeatherData: Record<string, WeatherData> = {};
    
    try {
      const weatherPromises = weatherICAOs.map(async (icao) => {
        try {
          const data = await fetchWeatherData(icao);
          newWeatherData[icao] = data;
        } catch (error) {
          console.error(`Error fetching weather for ${icao}:`, error);
          newWeatherData[icao] = { 
            metar: '', 
            taf: '', 
            error: `Failed to fetch data for ${icao}` 
          };
        }
      });
      
      await Promise.all(weatherPromises);
      setWeatherData(newWeatherData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating weather data:', error);
      setError('Failed to update weather data');
    } finally {
      setIsLoading(false);
    }
  }, [weatherICAOs]);

  // Update when ICAOs change (pilot view)
  useEffect(() => {
    if (!isClient || viewMode !== 'pilot') return;
    updateWeatherData();
  }, [updateWeatherData, isClient, viewMode]);

  // Auto-refresh every 5 minutes with real API calls
  useEffect(() => {
    if (!isClient) return;
    
    const refreshFunction = viewMode === 'pilot' 
      ? updateWeatherData 
      : () => {
          const currentICAOs = dispatcherStations.map(s => s.icao);
          if (currentICAOs.length > 0) {
            loadDispatcherStations(currentICAOs);
          }
        };
    
    const interval = setInterval(refreshFunction, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [updateWeatherData, loadDispatcherStations, isClient, viewMode, dispatcherStations]);

  // Pilot view functions
  const addICAOs = useCallback((icaos: string[]) => {
    const validICAOs = icaos.filter(icao => 
      icao.length === 4 && 
      /^[A-Z0-9]{4}$/.test(icao) && 
      !weatherICAOs.includes(icao)
    );
    
    if (validICAOs.length > 0) {
      setWeatherICAOs(prev => [...prev, ...validICAOs]);
    }
  }, [weatherICAOs]);

  const removeICAO = useCallback((icao: string) => {
    setWeatherICAOs(prev => prev.filter(i => i !== icao));
    setWeatherData(prev => {
      const newData = { ...prev };
      delete newData[icao];
      return newData;
    });
    setIndividualMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, []);

  // Dispatcher view functions
  const addDispatcherStation = useCallback(async (icaos: string[]) => {
    const validICAOs = icaos.filter(icao => 
      icao.length === 4 && 
      /^[A-Z0-9]{4}$/.test(icao) && 
      !dispatcherStations.some(s => s.icao === icao)
    );
    
    if (validICAOs.length > 0) {
      setIsLoading(true);
      try {
        const newStationPromises = validICAOs.map(icao => fetchStationStatus(icao));
        const newStations = await Promise.all(newStationPromises);
        setDispatcherStations(prev => [...prev, ...newStations]);
      } catch (error) {
        console.error('Error adding dispatcher stations:', error);
        setError('Failed to add weather stations');
      } finally {
        setIsLoading(false);
      }
    }
  }, [dispatcherStations]);

  const removeDispatcherStation = useCallback((icao: string) => {
    setDispatcherStations(prev => prev.filter(s => s.icao !== icao));
    if (selectedStationDetails?.icao === icao) {
      setSelectedStationDetails(null);
    }
  }, [selectedStationDetails]);

  const refreshDispatcherStation = useCallback(async (icao: string) => {
    setIsLoading(true);
    try {
      const updatedStation = await fetchStationStatus(icao);
      setDispatcherStations(prev => 
        prev.map(station => 
          station.icao === icao ? updatedStation : station
        )
      );
      if (selectedStationDetails?.icao === icao) {
        setSelectedStationDetails(updatedStation);
      }
    } catch (error) {
      console.error(`Error refreshing station ${icao}:`, error);
      setError(`Failed to refresh ${icao}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStationDetails]);

  // Minima management functions
  const updateGlobalMinima = useCallback((newMinima: Minima) => {
    setGlobalMinima(newMinima);
    setIndividualMinima({});
  }, []);

  const updateIndividualMinima = useCallback((icao: string, field: keyof Minima, value: number) => {
    setIndividualMinima(prev => ({
      ...prev,
      [icao]: {
        ...prev[icao] || globalMinima,
        [field]: value
      }
    }));
  }, [globalMinima]);

  const resetIndividualMinima = useCallback((icao: string) => {
    setIndividualMinima(prev => {
      const newMinima = { ...prev };
      delete newMinima[icao];
      return newMinima;
    });
  }, []);

  // Loading screen during hydration
  if (!isClient) {
    return (
      <>
        <Head>
          <title>FlyingWx</title>
          <meta name="description" content="FlyingWx - Aviation Weather Intelligence Platform" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold mb-4">FlyingWx</div>
            <div className="text-gray-400">Loading...</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>FlyingWx - {viewMode === 'pilot' ? 'Pilot Dashboard' : 'Dispatcher View'}</title>
        <meta name="description" content="FlyingWx - Aviation Weather Intelligence Platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
        <header className="relative p-4 bg-gray-800 shadow-md text-center text-xl font-bold mb-6 max-w-screen-2xl mx-auto">
          <Clock position="left" />
          FlyingWx {viewMode === 'pilot' ? '- Pilot Dashboard' : '- Dispatcher View'}
          <Clock position="right" />
        </header>

        <div className="max-w-screen-2xl mx-auto px-6">
          <ViewModeSelector />

          {/* Error Display */}
          {error && (
            <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
              <div className="flex">
                <div className="py-1">
                  <svg className="fill-current h-6 w-6 text-red-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-bold">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
                <div className="ml-auto">
                  <button 
                    onClick={() => setError(null)}
                    className="text-red-200 hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'pilot' ? (
            // PILOT VIEW - Single flight focused
            <>
              <MinimaControls
                globalMinima={globalMinima}
                onUpdateGlobalMinima={updateGlobalMinima}
              />

              <div className="w-full">
                <ICAOInput onAddICAOs={addICAOs} />
                
                {isLoading && (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading weather data...
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {weatherICAOs.map(icao => (
                    <WeatherTile
                      key={icao}
                      icao={icao}
                      weatherData={weatherData[icao]}
                      minima={individualMinima[icao] || globalMinima}
                      usingDefault={!individualMinima[icao]}
                      isLoading={isLoading}
                      onRemove={() => removeICAO(icao)}
                      onUpdateMinima={updateIndividualMinima}
                      onResetMinima={() => resetIndividualMinima(icao)}
                    />
                  ))}
                </div>

                {weatherICAOs.length === 0 && !isLoading && (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-lg mb-4">
                      🛩️ Welcome to FlyingWx Pilot Dashboard
                    </div>
                    <div className="text-gray-500">
                      Add airport ICAOs above to start monitoring weather conditions
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // DISPATCHER VIEW - Multi-station weather operations
            <>
              <SystemOverview stations={dispatcherStations} />

              <div className="bg-gray-800 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold flex items-center">
                    🌍 Weather Stations Monitor
                    <span className="ml-2 text-sm bg-purple-600 px-2 py-1 rounded">
                      {dispatcherStations.length} Stations
                    </span>
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-400">
                      Last updated: {lastUpdated.toLocaleTimeString()}
                    </div>
                    {isLoading && (
                      <div className="flex items-center text-sm text-blue-400">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating...
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const currentICAOs = dispatcherStations.map(s => s.icao);
                        loadDispatcherStations(currentICAOs);
                      }}
                      className="bg-blue-600 px-3 py-1 rounded text-white hover:bg-blue-700 text-sm transition-colors"
                      disabled={isLoading}
                    >
                      🔄 Refresh All
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <ICAOInput onAddICAOs={addDispatcherStation} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {dispatcherStations.map(station => (
                    <DispatcherWeatherTile
                      key={station.icao}
                      station={station}
                      onRemove={() => removeDispatcherStation(station.icao)}
                      onViewDetails={() => setSelectedStationDetails(station)}
                      onRefresh={() => refreshDispatcherStation(station.icao)}
                    />
                  ))}
                </div>

                {dispatcherStations.length === 0 && !isLoading && (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-lg mb-4">
                      🏢 Welcome to FlyingWx Dispatcher View
                    </div>
                    <div className="text-gray-500 mb-4">
                      Monitor multiple airports simultaneously for weather operations
                    </div>
                    <button
                      onClick={() => loadDispatcherStations(DEFAULT_DISPATCHER_STATIONS)}
                      className="bg-purple-600 px-4 py-2 rounded text-white hover:bg-purple-700 transition-colors"
                    >
                      Load Default Stations
                    </button>
                  </div>
                )}
              </div>

              {/* Station Details Modal */}
              {selectedStationDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
                    <div className="p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold">
                          {selectedStationDetails.icao} - {selectedStationDetails.name}
                        </h2>
                        <button
                          onClick={() => setSelectedStationDetails(null)}
                          className="text-gray-400 hover:text-white text-2xl"
                        >
                          ×
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Current Weather */}
                        <div className="bg-gray-700 rounded-lg p-4">
                          <h3 className="text-lg font-semibold mb-3">Current Weather</h3>
                          {selectedStationDetails.metar.metar ? (
                            <div className="text-sm">
                              <div className="mb-2">
                                <strong>METAR:</strong> 
                                <div className="mt-1 font-mono text-blue-200 bg-gray-800 p-2 rounded">
                                  {selectedStationDetails.metar.metar}
                                </div>
                              </div>
                              {selectedStationDetails.metar.taf && (
                                <div>
                                  <strong>TAF:</strong>
                                  <div className="mt-1 font-mono text-green-200 bg-gray-800 p-2 rounded">
                                    {selectedStationDetails.metar.taf}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-red-400">
                              {selectedStationDetails.metar.error || 'No weather data available'}
                            </div>
                          )}
                        </div>

                        {/* Operational Status */}
                        <div className="bg-gray-700 rounded-lg p-4">
                          <h3 className="text-lg font-semibold mb-3">Operational Status</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span>Status:</span>
                              <span className={`font-semibold ${
                                selectedStationDetails.operationalStatus === 'NORMAL' ? 'text-green-400' :
                                selectedStationDetails.operationalStatus === 'CAUTION' ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {selectedStationDetails.operationalStatus}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Last Updated:</span>
                              <span>{selectedStationDetails.lastUpdated.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* PIREPs */}
                        <div className="bg-gray-700 rounded-lg p-4">
                          <h3 className="text-lg font-semibold mb-3">
                            Pilot Reports ({selectedStationDetails.pireps.filter(p => !p.isExpired).length})
                          </h3>
                          {selectedStationDetails.pireps.filter(p => !p.isExpired).length > 0 ? (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {selectedStationDetails.pireps.filter(p => !p.isExpired).map((pirep, index) => (
                                <div key={pirep.id || index} className="bg-gray-600 rounded p-2 text-sm">
                                  <div className="flex justify-between mb-1">
                                    <span className="font-semibold">{pirep.aircraft}</span>
                                    <span className="text-gray-400">
                                      {pirep.timestamp.toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="text-xs space-y-1">
                                    <div>Altitude: {pirep.altitude.toLocaleString()} ft</div>
                                    {pirep.turbulence !== 'NONE' && (
                                      <div>Turbulence: <span className={`font-semibold ${
                                        pirep.turbulence === 'SEVERE' ? 'text-red-400' :
                                        pirep.turbulence === 'MODERATE' ? 'text-yellow-400' :
                                        'text-blue-400'
                                      }`}>{pirep.turbulence}</span></div>
                                    )}
                                    {pirep.icing !== 'NONE' && (
                                      <div>Icing: <span className={`font-semibold ${
                                        pirep.icing === 'SEVERE' ? 'text-red-400' :
                                        pirep.icing === 'MODERATE' ? 'text-yellow-400' :
                                        'text-blue-400'
                                      }`}>{pirep.icing}</span></div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-400">No recent pilot reports</div>
                          )}
                        </div>

                        {/* SIGMETs */}
                        <div className="bg-gray-700 rounded-lg p-4">
                          <h3 className="text-lg font-semibold mb-3">
                            Weather Warnings ({selectedStationDetails.sigmets.length})
                          </h3>
                          {selectedStationDetails.sigmets.length > 0 ? (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {selectedStationDetails.sigmets.map((sigmet, index) => (
                                <div key={sigmet.id || index} className="bg-gray-600 rounded p-2 text-sm">
                                  <div className="flex justify-between mb-1">
                                    <span className="font-semibold">{sigmet.type}</span>
                                    <div className="flex gap-2">
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        sigmet.severity === 'SEVERE' ? 'bg-red-600' :
                                        sigmet.severity === 'MODERATE' ? 'bg-yellow-600' :
                                        'bg-blue-600'
                                      }`}>
                                        {sigmet.severity}
                                      </span>
                                      {sigmet.isExpired && (
                                        <span className="text-xs px-2 py-1 rounded bg-gray-500">
                                          EXPIRED
                                        </span>
                                      )}
                                      {sigmet.isActive && (
                                        <span className="text-xs px-2 py-1 rounded bg-green-600">
                                          ACTIVE
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs space-y-1">
                                    <div>Hazard: {sigmet.hazard}</div>
                                    <div>
                                      Altitude: {sigmet.altitudeMin.toLocaleString()} - {sigmet.altitudeMax.toLocaleString()} ft
                                    </div>
                                    <div>
                                      Valid: {sigmet.validFrom.toLocaleTimeString()} - {sigmet.validTo.toLocaleTimeString()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-400">No weather warnings</div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end mt-6 space-x-3">
                        <button
                          onClick={() => refreshDispatcherStation(selectedStationDetails.icao)}
                          className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition-colors"
                          disabled={isLoading}
                        >
                          🔄 Refresh Data
                        </button>
                        <button
                          onClick={() => setSelectedStationDetails(null)}
                          className="bg-gray-600 px-4 py-2 rounded text-white hover:bg-gray-700 transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="text-sm text-center text-gray-500 py-4 max-w-screen-2xl mx-auto">
          FlyingWx | Weather data from Aviation Weather Center | Updated {lastUpdated.toUTCString().slice(17, 25)}
        </footer>
      </div>
    </>
  );
}

export default function FlyingWx() {
  return (
    <ViewProvider>
      <FlyingWxContent />
    </ViewProvider>
  );
}
                        </button>
