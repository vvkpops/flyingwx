import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

// Correct Aviation Weather Center API endpoints
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
    
    const contentType = response.headers.get('content-type');
    let data;
    
    // Handle both JSON and text responses
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
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
    // Using correct REST API endpoints with proper parameters
    const [metarData, tafData] = await Promise.all([
      fetchWithCache(
        `${BASE_URL}/metar?stationString=${icao}&format=json&taf=false&hours=2`,
        `metar-${icao}`,
        CACHE_DURATIONS.METAR
      ),
      fetchWithCache(
        `${BASE_URL}/taf?stationString=${icao}&format=json&hours=8`,
        `taf-${icao}`,
        CACHE_DURATIONS.TAF
      )
    ]);

    // Handle response format - API returns array of objects
    let metar = '';
    let taf = '';

    if (Array.isArray(metarData) && metarData.length > 0) {
      metar = metarData[0].rawOb || metarData[0].raw || '';
    }

    if (Array.isArray(tafData) && tafData.length > 0) {
      taf = tafData[0].rawTAF || tafData[0].raw || '';
    }

    return { metar, taf };
  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { metar: '', taf: '', error: 'Failed to fetch data' };
  }
}

export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  try {
    // Correct PIREP endpoint with proper parameters
    const data = await fetchWithCache(
      `${BASE_URL}/pirep?stationString=${icao}&hoursBeforeNow=12&format=json`,
      `pirep-${icao}-${radiusNm}`,
      CACHE_DURATIONS.PIREP
    );

    if (!Array.isArray(data)) return [];

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return data
      .map((pirep: any, index: number) => {
        const timestamp = new Date(pirep.reportTime || pirep.obsTime || Date.now());
        return {
          id: pirep.reportId || `pirep-${icao}-${index}`,
          icao: pirep.stationId || icao,
          aircraft: pirep.aircraftRef || 'UNKNOWN',
          altitude: parseInt(pirep.altitude) || 0,
          turbulence: mapTurbulenceIntensity(pirep.turbulenceCondition),
          icing: mapIcingIntensity(pirep.icingCondition),
          timestamp,
          rawReport: pirep.rawOb || pirep.pirepText || '',
          location: {
            lat: parseFloat(pirep.latitude) || 0,
            lon: parseFloat(pirep.longitude) || 0
          },
          isExpired: timestamp < twelveHoursAgo
        };
      })
      .filter((pirep: PIREP) => pirep.timestamp >= twelveHoursAgo);
  } catch (error) {
    console.error(`Error fetching PIREPs for ${icao}:`, error);
    return [];
  }
}

export async function fetchSIGMETs(icao: string, radiusNm: number = 100): Promise<SIGMET[]> {
  try {
    // Correct SIGMET/AIRMET endpoint
    const data = await fetchWithCache(
      `${BASE_URL}/airsigmet?stationString=${icao}&format=json&hazard=convective,turbulence,icing,ifr`,
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

        return {
          id: sigmet.hazardId || `sigmet-${icao}-${index}`,
          type: sigmet.hazardType || 'AIRMET',
          hazard: mapHazardType(sigmet.hazard),
          severity: mapSeverityLevel(sigmet.severity || sigmet.hazard),
          altitudeMin: parseInt(sigmet.altitudeLow) || 0,
          altitudeMax: parseInt(sigmet.altitudeHigh) || 60000,
          validFrom,
          validTo,
          affectedICAOs: [icao],
          rawText: sigmet.rawText || sigmet.text || '',
          isExpired,
          isActive
        };
      })
      .filter((sigmet: SIGMET) => {
        // Only include SIGMETs from last 12 hours or future ones
        return sigmet.validFrom >= twelveHoursAgo || sigmet.validTo >= now;
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

    // Calculate operational status based on weather conditions
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
        const conditions = parseMetarConditions(weatherData.metar);
        
        if (conditions.visibility < 0.5 || conditions.ceiling < 100) {
          operationalStatus = 'CRITICAL';
        } else if (conditions.visibility < 1 || conditions.ceiling < 200) {
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

// Helper functions for mapping API responses to our types
function mapTurbulenceIntensity(condition: any): 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!condition) return 'NONE';
  
  const intensity = (condition.intensity || condition.type || '').toLowerCase();
  
  if (intensity.includes('severe') || intensity.includes('extreme')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light') || intensity.includes('weak')) return 'LIGHT';
  
  return 'NONE';
}

function mapIcingIntensity(condition: any): 'NONE' | 'TRACE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!condition) return 'NONE';
  
  const intensity = (condition.intensity || condition.type || '').toLowerCase();
  
  if (intensity.includes('severe') || intensity.includes('heavy')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light')) return 'LIGHT';
  if (intensity.includes('trace')) return 'TRACE';
  
  return 'NONE';
}

function mapHazardType(hazard: any): 'TURB' | 'ICE' | 'IFR' | 'MT_OBSC' | 'CONVECTIVE' {
  if (!hazard) return 'TURB';
  
  const h = hazard.toLowerCase();
  
  if (h.includes('turbulence') || h.includes('turb')) return 'TURB';
  if (h.includes('icing') || h.includes('ice')) return 'ICE';
  if (h.includes('ifr') || h.includes('visibility') || h.includes('fog')) return 'IFR';
  if (h.includes('mountain') || h.includes('obscur')) return 'MT_OBSC';
  if (h.includes('convective') || h.includes('thunderstorm') || h.includes('tstm')) return 'CONVECTIVE';
  
  return 'TURB';
}

function mapSeverityLevel(severity: any): 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!severity) return 'MODERATE';
  
  const s = severity.toLowerCase();
  
  if (s.includes('severe') || s.includes('extreme') || s.includes('strong')) return 'SEVERE';
  if (s.includes('light') || s.includes('weak') || s.includes('mild')) return 'LIGHT';
  
  return 'MODERATE';
}

function parseMetarConditions(metar: string): { visibility: number; ceiling: number } {
  let visibility = 10; // Default good visibility
  let ceiling = 5000;  // Default high ceiling
  
  // Parse visibility in statute miles
  const visMatch = metar.match(/(\d+(?:\s+\d+\/\d+)?|\d+\/\d+)SM/);
  if (visMatch) {
    const visStr = visMatch[1].replace(/\s+/g, '');
    if (visStr.includes('/')) {
      const [num, den] = visStr.split('/').map(Number);
      visibility = num / den;
    } else {
      visibility = parseInt(visStr);
    }
  }
  
  // Parse ceiling from cloud layers
  const ceilingMatch = metar.match(/(BKN|OVC)(\d{3})/);
  if (ceilingMatch) {
    ceiling = parseInt(ceilingMatch[2]) * 100;
  }
  
  return { visibility, ceiling };
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
