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

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return data
      .map((pirep: any, index: number) => {
        const timestamp = new Date(pirep.obsTime || Date.now());
        return {
          id: pirep.pirepId || `pirep-${icao}-${index}`,
          icao: pirep.icaoId || icao,
          aircraft: pirep.aircraftRef || 'UNKNOWN',
          altitude: pirep.altitudeFtMsl || 0,
          turbulence: mapTurbulence(pirep.turbulence),
          icing: mapIcing(pirep.icing),
          timestamp,
          rawReport: pirep.rawOb || '',
          location: {
            lat: pirep.lat || 0,
            lon: pirep.lon || 0
          },
          isExpired: timestamp < twelveHoursAgo
        };
      })
      .filter((pirep: PIREP) => {
        // Only include PIREPs from last 12 hours
        return pirep.timestamp >= twelveHoursAgo;
      });
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

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return data
      .map((sigmet: any, index: number) => {
        const validFrom = new Date(sigmet.validTimeFrom || Date.now());
        const validTo = new Date(sigmet.validTimeTo || Date.now() + 6 * 60 * 60 * 1000);
        const isExpired = validTo < now;
        const isActive = validFrom <= now && validTo >= now;
        const isRecent = validFrom >= twelveHoursAgo || validTo >= now; // Recent or future

        return {
          id: sigmet.airsigmetId || `sigmet-${icao}-${index}`,
          type: sigmet.airsigmetType || 'SIGMET',
          hazard: mapHazard(sigmet.hazard),
          severity: mapSeverity(sigmet.severity),
          altitudeMin: sigmet.altitudeLowFt || 0,
          altitudeMax: sigmet.altitudeHighFt || 60000,
          validFrom,
          validTo,
          affectedICAOs: [icao],
          rawText: sigmet.rawAirsigmet || '',
          isExpired,
          isActive
        };
      })
      .filter((sigmet: SIGMET) => {
        // Only include SIGMETs from last 12 hours or future ones
        const isRecent = sigmet.validFrom >= twelveHoursAgo || sigmet.validTo >= now;
        return isRecent;
      });
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

    // Calculate operational status based on weather conditions only
    let operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL' = 'NORMAL';

    if (weatherData.error) {
      operationalStatus = 'CRITICAL';
    } else {
      // Check for active severe weather in SIGMETs
      const activeSevereSigmets = sigmets.filter(s => 
        s.isActive && s.severity === 'SEVERE'
      );
      
      // Check for severe conditions in PIREPs
      const severePireps = pireps.filter(p => 
        !p.isExpired && (p.turbulence === 'SEVERE' || p.icing === 'SEVERE')
      );

      if (activeSevereSigmets.length > 0 || severePireps.length > 0) {
        operationalStatus = 'CRITICAL';
      } else if (
        sigmets.some(s => s.isActive) || 
        pireps.some(p => !p.isExpired && (p.turbulence === 'MODERATE' || p.icing === 'MODERATE'))
      ) {
        operationalStatus = 'CAUTION';
      }

      // Analyze METAR for critical conditions
      if (weatherData.metar) {
        const metar = weatherData.metar.toLowerCase();
        
        // Check for very low visibility/ceiling
        const visMatch = metar.match(/(\d{1,2})sm/);
        const visibility = visMatch ? parseInt(visMatch[1]) : 10;
        
        const ceilingMatch = metar.match(/(ovc|bkn)(\d{3})/);
        const ceiling = ceilingMatch ? parseInt(ceilingMatch[2]) * 100 : 5000;
        
        if (visibility < 0.5 || ceiling < 100) {
          operationalStatus = 'CRITICAL';
        } else if (visibility < 1 || ceiling < 200) {
          operationalStatus = operationalStatus === 'NORMAL' ? 'CAUTION' : operationalStatus;
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
      lastUpdated: new Date()
    };
  }
}

// Helper functions remain the same...
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
    'KMKE': 'Milwaukee Mitchell'
  };
  return names[icao] || icao;
}
