import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

const CORS_PROXY = 'https://corsproxy.io/?';
const TAF_CACHE_MS = 600000; // 10 minutes
const METAR_CACHE_MS = 60000; // 1 minute
const PIREP_CACHE_MS = 120000; // 2 minutes
const SIGMET_CACHE_MS = 300000; // 5 minutes

interface CacheEntry {
  data: any;
  time: number;
}

const cache: Record<string, { [key: string]: CacheEntry }> = {};

async function fetchWithCache(
  url: string,
  key: string,
  cacheMs: number
): Promise<any> {
  const cached = cache[key];
  
  if (cached && (Date.now() - cached.time < cacheMs)) {
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!cache[key]) cache[key] = {};
    cache[key] = { data, time: Date.now() };
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${key}:`, error);
    return null;
  }
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  try {
    const [metarResponse, tafResponse] = await Promise.all([
      fetch(`${CORS_PROXY}https://aviationweather.gov/cgi-bin/data/metar.php?ids=${icao}&format=raw`),
      fetch(`${CORS_PROXY}https://aviationweather.gov/cgi-bin/data/taf.php?ids=${icao}&format=raw`)
    ]);

    const metar = metarResponse.ok ? (await metarResponse.text()).trim() : '';
    const taf = tafResponse.ok ? (await tafResponse.text()).trim() : '';

    return { metar, taf };
  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { metar: '', taf: '', error: 'Failed to fetch data' };
  }
}

// Mock API functions for demonstration (replace with real API calls)
export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  // Simulated PIREP data - replace with real API call
  const mockPireps: PIREP[] = [
    {
      id: `pirep-${icao}-1`,
      icao,
      aircraft: 'B737',
      altitude: 12000,
      turbulence: 'LIGHT',
      icing: 'NONE',
      timestamp: new Date(Date.now() - 30 * 60000), // 30 minutes ago
      rawReport: 'UA /OV ABC123 DEF234/TM 1545/FL120/TP B737/TB LGT/RM SMTH',
      location: { lat: 47.6, lon: -52.7 }
    },
    {
      id: `pirep-${icao}-2`,
      icao,
      aircraft: 'A320',
      altitude: 18000,
      turbulence: 'MODERATE',
      icing: 'TRACE',
      timestamp: new Date(Date.now() - 60 * 60000), // 1 hour ago
      rawReport: 'UA /OV XYZ789 ABC123/TM 1445/FL180/TP A320/TB MOD/IC TRC',
      location: { lat: 47.5, lon: -52.8 }
    }
  ];

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return mockPireps;
}

export async function fetchSIGMETs(icao: string, radiusNm: number = 100): Promise<SIGMET[]> {
  // Simulated SIGMET data - replace with real API call
  const mockSigmets: SIGMET[] = [
    {
      id: `sigmet-${icao}-1`,
      type: 'SIGMET',
      hazard: 'TURB',
      severity: 'MODERATE',
      altitudeMin: 15000,
      altitudeMax: 25000,
      validFrom: new Date(Date.now() - 30 * 60000),
      validTo: new Date(Date.now() + 2 * 60 * 60000),
      affectedICAOs: [icao],
      rawText: `SIGMET for moderate turbulence between FL150-FL250 in vicinity of ${icao}`
    }
  ];

  await new Promise(resolve => setTimeout(resolve, 300));
  return mockSigmets;
}

export async function fetchStationStatus(icao: string): Promise<StationStatus> {
  const [weatherData, pireps, sigmets] = await Promise.all([
    fetchWeatherData(icao),
    fetchPIREPs(icao),
    fetchSIGMETs(icao)
  ]);

  // Calculate operational status based on weather conditions
  let operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL' = 'NORMAL';
  let delayProbability = 0;

  // Simple logic for demo - enhance with real algorithms
  if (weatherData.error) {
    operationalStatus = 'CRITICAL';
    delayProbability = 80;
  } else if (sigmets.length > 0 || pireps.some(p => p.turbulence === 'SEVERE')) {
    operationalStatus = 'CAUTION';
    delayProbability = 40;
  } else if (pireps.some(p => p.turbulence === 'MODERATE')) {
    operationalStatus = 'CAUTION';
    delayProbability = 20;
  }

  return {
    icao,
    name: getAirportName(icao),
    metar: weatherData,
    pireps,
    sigmets,
    operationalStatus,
    delayProbability,
    lastUpdated: new Date()
  };
}

function getAirportName(icao: string): string {
  const names: Record<string, string> = {
    'CYYT': 'St. John\'s Intl',
    'KJFK': 'John F Kennedy Intl',
    'EGLL': 'London Heathrow',
    'KORD': 'Chicago O\'Hare',
    'KLAX': 'Los Angeles Intl',
    'KDEN': 'Denver Intl',
    'KATL': 'Atlanta Hartsfield',
    'KSEA': 'Seattle Tacoma',
    'KBOS': 'Boston Logan',
    'KMIA': 'Miami Intl'
  };
  return names[icao] || icao;
}

// Mock flight data
export async function fetchFlights(): Promise<FlightInfo[]> {
  const mockFlights: FlightInfo[] = [
    {
      id: 'FX001',
      callsign: 'FlyingWx 001',
      departure: 'CYYT',
      arrival: 'KJFK',
      alternate: 'KEWR',
      etd: new Date(Date.now() + 2 * 60 * 60000),
      eta: new Date(Date.now() + 5 * 60 * 60000),
      status: 'SCHEDULED',
      aircraft: 'B737-800',
      route: 'CYYT..KJFK'
    },
    {
      id: 'FX002',
      callsign: 'FlyingWx 002',
      departure: 'KJFK',
      arrival: 'EGLL',
      alternate: 'EGKK',
      etd: new Date(Date.now() + 1 * 60 * 60000),
      eta: new Date(Date.now() + 8 * 60 * 60000),
      status: 'DELAYED',
      aircraft: 'A350-900',
      route: 'KJFK..EGLL'
    },
    {
      id: 'FX003',
      callsign: 'FlyingWx 003',
      departure: 'KORD',
      arrival: 'KLAX',
      etd: new Date(Date.now() - 1 * 60 * 60000),
      eta: new Date(Date.now() + 3 * 60 * 60000),
      status: 'ENROUTE',
      aircraft: 'B787-9'
    }
  ];

  return mockFlights;
}
