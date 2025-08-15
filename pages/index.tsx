import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { WeatherTile } from '../components/WeatherTile';
import { Clock } from '../components/Clock';
import { MinimaControls } from '../components/MinimaControls';
import { ICAOInput } from '../components/ICAOInput';
import { WeatherData, Minima } from '../types/weather';
import { fetchWeatherData } from '../lib/weatherApi';

const DEFAULT_MINIMA: Minima = { ceiling: 500, vis: 1 };

export default function WeatherMonitor() {
  const [weatherICAOs, setWeatherICAOs] = useState<string[]>([]);
  const [globalMinima, setGlobalMinima] = useState<Minima>(DEFAULT_MINIMA);
  const [individualMinima, setIndividualMinima] = useState<Record<string, Minima>>({});
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedICAOs = localStorage.getItem('weatherICAOs');
      const savedGlobalMinima = localStorage.getItem('globalWeatherMinima');
      const savedIndividualMinima = localStorage.getItem('weatherMinima');

      if (savedICAOs) {
        try {
          setWeatherICAOs(JSON.parse(savedICAOs));
        } catch (e) {
          console.error('Error parsing saved ICAOs:', e);
        }
      }

      if (savedGlobalMinima) {
        try {
          setGlobalMinima(JSON.parse(savedGlobalMinima));
        } catch (e) {
          console.error('Error parsing saved global minima:', e);
        }
      }

      if (savedIndividualMinima) {
        try {
          setIndividualMinima(JSON.parse(savedIndividualMinima));
        } catch (e) {
          console.error('Error parsing saved individual minima:', e);
        }
      }
    }
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('weatherICAOs', JSON.stringify(weatherICAOs));
    }
  }, [weatherICAOs]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('globalWeatherMinima', JSON.stringify(globalMinima));
    }
  }, [globalMinima]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('weatherMinima', JSON.stringify(individualMinima));
    }
  }, [individualMinima]);

  // Fetch weather data for all ICAOs
  const updateWeatherData = useCallback(async () => {
    if (weatherICAOs.length === 0) return;
    
    setIsLoading(true);
    const newWeatherData: Record<string, WeatherData> = {};
    
    try {
      await Promise.all(
        weatherICAOs.map(async (icao) => {
          try {
            const data = await fetchWeatherData(icao);
            newWeatherData[icao] = data;
          } catch (error) {
            console.error(`Error fetching weather for ${icao}:`, error);
            newWeatherData[icao] = { metar: '', taf: '', error: 'Failed to fetch data' };
          }
        })
      );
      
      setWeatherData(newWeatherData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating weather data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [weatherICAOs]);

  // Update weather data when ICAOs change
  useEffect(() => {
    updateWeatherData();
  }, [updateWeatherData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(updateWeatherData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [updateWeatherData]);

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

  return (
    <>
      <Head>
        <title>Weather Monitor</title>
        <meta name="description" content="Aviation Weather Monitor Dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
        <header className="relative p-4 bg-gray-800 shadow-md text-center text-xl font-bold mb-6 max-w-screen-2xl mx-auto">
          <Clock position="left" />
          Weather Monitor
          <Clock position="right" />
        </header>

        <MinimaControls
          globalMinima={globalMinima}
          onUpdateGlobalMinima={updateGlobalMinima}
        />

        <div className="w-full px-6">
          <ICAOInput onAddICAOs={addICAOs} />
          
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
        </div>

        <footer className="text-sm text-center text-gray-500 py-4 max-w-screen-2xl mx-auto">
          Aviation Weather Data | Updated {lastUpdated.toUTCString().slice(17, 25)}
        </footer>
      </div>
    </>
  );
}
