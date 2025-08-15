import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

const BASE_URL = 'https://aviationweather.gov/api/data';
const CORS_PROXY = 'https://corsproxy.io/?';

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache: Record<string, CacheEntry> = {};

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
  METAR: 60000,     // 1 minute
  TAF: 600000,      // 10 minutes
  PIREP: 120000,    // 2 minutes
  SIGMET: 300000,   // 5 minutes
  AIRMET: 600000,   // 10 minutes
};

async function fetchWithCache(url: string, cacheKey: string, cacheDuration: number): Promise<any> {
  const cached = cache[cacheKey];
  
  if (cached && (Date.now() - cached.timestamp < cacheDuration)) {
    return cached.data;
  }

  try {
    const response = await fetch(`${CORS_PROXY}${url}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    cache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${cacheKey}:`, error);
    throw error;
  }
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  try {
    const [metarData, tafData] = await Promise.all([
      fetchWithCache(
        `${BASE_URL}/metar?ids=${icao}&format=json`,
        `metar-${icao}`,
        CACHE_DURATIONS.METAR
      ),
      fetchWithCache(
        `${BASE_URL}/taf?ids=${icao}&format=json`,
        `taf-${icao}`,
        CACHE_DURATIONS.TAF
      )
    ]);

    const metar = metarData?.[0]?.rawOb || '';
    const taf = tafData?.[0]?.rawTAF || '';

    return { metar, taf };
  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { metar: '', taf: '', error: 'Failed to fetch data' };
  }
}

export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  try {
    const data = await fetchWithCache(
      `${BASE_URL}/pirep?ids=${icao}&distance=${radiusNm}&format=json`,
      `pirep-${icao}-${radiusNm}`,
      CACHE_DURATIONS.PIREP
    );

    if (!Array.isArray(data)) return [];

    return data.map((pirep: any, index: number) => ({
      id: pirep.pirepId || `pirep-${icao}-${index}`,
      icao: pirep.icaoId || icao,
      aircraft: pirep.aircraftRef || 'UNKNOWN',
      altitude: pirep.altitudeFtMsl || 0,
      turbulence: mapTurbulence(pirep.turbulence),
      icing: mapIcing(pirep.icing),
      timestamp: new Date(pirep.obsTime || Date.now()),
      rawReport: pirep.rawOb || '',
      location: {
        lat: pirep.lat || 0,
        lon: pirep.lon || 0
      }
    }));
  } catch (error) {
    console.error(`Error fetching PIREPs for ${icao}:`, error);
    return [];
  }
}

export async function fetchSIGMETs(icao: string, radiusNm: number = 100): Promise<SIGMET[]> {
  try {
    const data = await fetchWithCache(
      `${BASE_URL}/airsigmet?ids=${icao}&distance=${radiusNm}&format=json`,
      `sigmet-${icao}-${radiusNm}`,
      CACHE_DURATIONS.SIGMET
    );

    if (!Array.isArray(data)) return [];

    return data.map((sigmet: any, index: number) => ({
      id: sigmet.airsigmetId || `sigmet-${icao}-${index}`,
      type: sigmet.airsigmetType || 'SIGMET',
      hazard: mapHazard(sigmet.hazard),
      severity: mapSeverity(sigmet.severity),
      altitudeMin: sigmet.altitudeLowFt || 0,
      altitudeMax: sigmet.altitudeHighFt || 60000,
      validFrom: new Date(sigmet.validTimeFrom || Date.now()),
      validTo: new Date(sigmet.validTimeTo || Date.now() + 6 * 60 * 60 * 1000),
      affectedICAOs: [icao],
      rawText: sigmet.rawAirsigmet || ''
    }));
  } catch (error) {
    console.error(`Error fetching SIGMETs for ${icao}:`, error);
    return [];
  }
}

export async function fetchStationStatus(icao: string): Promise<StationStatus> {
  try {
    const [weatherData, pireps, sigmets] = await Promise.all([
      fetchWeatherData(icao),
      fetchPIREPs(icao),
      fetchSIGMETs(icao)
    ]);

    // Calculate operational status based on real weather conditions
    let operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL' = 'NORMAL';
    let delayProbability = 0;

    // Analyze weather conditions
    if (weatherData.error) {
      operationalStatus = 'CRITICAL';
      delayProbability = 85;
    } else {
      // Check for severe weather in SIGMETs
      const severeSigmets = sigmets.filter(s => 
        s.severity === 'SEVERE' || s.hazard === 'CONVECTIVE'
      );
      
      // Check for severe turbulence/icing in PIREPs
      const severePireps = pireps.filter(p => 
        p.turbulence === 'SEVERE' || p.icing === 'SEVERE'
      );

      if (severeSigmets.length > 0 || severePireps.length > 0) {
        operationalStatus = 'CRITICAL';
        delayProbability = 70;
      } else if (sigmets.length > 0 || pireps.some(p => p.turbulence === 'MODERATE' || p.icing === 'MODERATE')) {
        operationalStatus = 'CAUTION';
        delayProbability = 35;
      }

      // Analyze METAR for low visibility/ceiling
      if (weatherData.metar) {
        const metar = weatherData.metar.toLowerCase();
        
        // Check for low visibility
        const visMatch = metar.match(/(\d{1,2})sm/);
        const visibility = visMatch ? parseInt(visMatch[1]) : 10;
        
        // Check for low ceiling
        const ceilingMatch = metar.match(/(ovc|bkn)(\d{3})/);
        const ceiling = ceilingMatch ? parseInt(ceilingMatch[2]) * 100 : 5000;
        
        if (visibility < 1 || ceiling < 200) {
          operationalStatus = 'CRITICAL';
          delayProbability = Math.max(delayProbability, 80);
        } else if (visibility < 3 || ceiling < 500) {
          operationalStatus = operationalStatus === 'NORMAL' ? 'CAUTION' : operationalStatus;
          delayProbability = Math.max(delayProbability, 45);
        }
      }
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
  } catch (error) {
    console.error(`Error fetching station status for ${icao}:`, error);
    return {
      icao,
      name: getAirportName(icao),
      metar: { metar: '', taf: '', error: 'Failed to fetch data' },
      pireps: [],
      sigmets: [],
      operationalStatus: 'CRITICAL',
      delayProbability: 90,
      lastUpdated: new Date()
    };
  }
}

// Helper functions for mapping API data
function mapTurbulence(turbulence: any): 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!turbulence) return 'NONE';
  const intensity = turbulence.intensity?.toLowerCase() || '';
  
  if (intensity.includes('severe') || intensity.includes('extreme')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light')) return 'LIGHT';
  return 'NONE';
}

function mapIcing(icing: any): 'NONE' | 'TRACE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!icing) return 'NONE';
  const intensity = icing.intensity?.toLowerCase() || '';
  
  if (intensity.includes('severe') || intensity.includes('heavy')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light')) return 'LIGHT';
  if (intensity.includes('trace')) return 'TRACE';
  return 'NONE';
}

function mapHazard(hazard: any): 'TURB' | 'ICE' | 'IFR' | 'MT_OBSC' | 'CONVECTIVE' {
  if (!hazard) return 'TURB';
  const h = hazard.toLowerCase();
  
  if (h.includes('turbulence')) return 'TURB';
  if (h.includes('icing')) return 'ICE';
  if (h.includes('ifr') || h.includes('visibility')) return 'IFR';
  if (h.includes('mountain') || h.includes('obscur')) return 'MT_OBSC';
  if (h.includes('convective') || h.includes('thunderstorm')) return 'CONVECTIVE';
  
  return 'TURB';
}

function mapSeverity(severity: any): 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!severity) return 'MODERATE';
  const s = severity.toLowerCase();
  
  if (s.includes('severe') || s.includes('extreme')) return 'SEVERE';
  if (s.includes('light') || s.includes('weak')) return 'LIGHT';
  return 'MODERATE';
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
    'KMIA': 'Miami Intl',
    'KEWR': 'Newark Liberty',
    'KSFO': 'San Francisco Intl',
    'KLAS': 'Las Vegas McCarran',
    'KPHX': 'Phoenix Sky Harbor',
    'KDFW': 'Dallas Fort Worth',
    'KIAH': 'Houston Intercontinental',
    'KMSP': 'Minneapolis St Paul',
    'KDTW': 'Detroit Metropolitan',
    'KPHL': 'Philadelphia Intl',
    'KLGA': 'LaGuardia',
    'KDCA': 'Reagan National',
    'KBWI': 'Baltimore Washington',
    'KMDW': 'Chicago Midway',
    'KHOU': 'Houston Hobby',
    'KOAK': 'Oakland Intl',
    'KSAN': 'San Diego Intl',
    'KTPA': 'Tampa Intl',
    'KBNA': 'Nashville Intl',
    'KSTL': 'St Louis Lambert',
    'KCVG': 'Cincinnati Northern Kentucky',
    'KCLT': 'Charlotte Douglas',
    'KPIT': 'Pittsburgh Intl',
    'KCLE': 'Cleveland Hopkins',
    'KIND': 'Indianapolis Intl',
    'KMKE': 'Milwaukee Mitchell',
    'KRIC': 'Richmond Intl',
    'KRDU': 'Raleigh Durham',
    'KGSO': 'Greensboro Piedmont',
    'KAVL': 'Asheville Regional',
    'KCHA': 'Chattanooga Metropolitan',
    'KBHM': 'Birmingham Shuttlesworth',
    'KHSV': 'Huntsville Intl',
    'KMOB': 'Mobile Regional',
    'KGPT': 'Gulfport Biloxi',
    'KLIX': 'New Orleans Intl',
    'KBTR': 'Baton Rouge Metropolitan',
    'KSHV': 'Shreveport Regional',
    'KTXK': 'Texarkana Regional',
    'KLIT': 'Little Rock National',
    'KXNA': 'Northwest Arkansas',
    'KTUL': 'Tulsa Intl'
  };
  return names[icao] || icao;
}

// Real flight data would come from your flight operations system
export async function fetchFlights(): Promise<any[]> {
  // This would integrate with your actual flight operations system
  // For now, return empty array since we don't have access to flight data
  return [];
}
