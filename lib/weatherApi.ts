import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

// Aviation Weather Center API endpoints
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
    
    const responseText = await response.text();
    
    // Check if response is an error message
    if (responseText.startsWith('error') || responseText.includes('error')) {
      console.warn(`API returned error for ${cacheKey}: ${responseText}`);
      return null;
    }
    
    let data;
    try {
      // Try to parse as JSON
      data = JSON.parse(responseText);
    } catch (jsonError) {
      // If JSON parsing fails, return the text as is
      console.warn(`Failed to parse JSON for ${cacheKey}, returning text:`, responseText);
      data = responseText;
    }
    
    cache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${cacheKey}:`, error);
    return null;
  }
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  try {
    // Try multiple API endpoints for better reliability
    const [metarData, tafData] = await Promise.all([
      fetchWithCache(
        `${BASE_URL}/metar?stationString=${icao}&format=json&taf=false&hours=2`,
        `metar-${icao}`,
        CACHE_DURATIONS.METAR
      ).catch(() => 
        // Fallback to text format if JSON fails
        fetchWithCache(
          `${BASE_URL}/metar?stationString=${icao}&format=raw&hours=2`,
          `metar-text-${icao}`,
          CACHE_DURATIONS.METAR
        )
      ),
      fetchWithCache(
        `${BASE_URL}/taf?stationString=${icao}&format=json&hours=8`,
        `taf-${icao}`,
        CACHE_DURATIONS.TAF
      ).catch(() =>
        // Fallback to text format if JSON fails
        fetchWithCache(
          `${BASE_URL}/taf?stationString=${icao}&format=raw&hours=8`,
          `taf-text-${icao}`,
          CACHE_DURATIONS.TAF
        )
      )
    ]);

    let metar = '';
    let taf = '';

    // Handle METAR response
    if (metarData) {
      if (Array.isArray(metarData) && metarData.length > 0) {
        metar = metarData[0].rawOb || metarData[0].raw || '';
      } else if (typeof metarData === 'string') {
        metar = metarData;
      }
    }

    // Handle TAF response
    if (tafData) {
      if (Array.isArray(tafData) && tafData.length > 0) {
        taf = tafData[0].rawTAF || tafData[0].raw || '';
      } else if (typeof tafData === 'string') {
        taf = tafData;
      }
    }

    return { metar, taf };
  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { metar: '', taf: '', error: 'Failed to fetch data' };
  }
}

export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  try {
    const data = await fetchWithCache(
      `${BASE_URL}/pirep?stationString=${icao}&hoursBeforeNow=12&format=json`,
      `pirep-${icao}-${radiusNm}`,
      CACHE_DURATIONS.PIREP
    );

    if (!data || !Array.isArray(data)) return [];

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return data
      .map((pirep: any, index: number) => {
        // Safely parse timestamp
        let timestamp = new Date();
        try {
          timestamp = new Date(pirep.reportTime || pirep.obsTime || Date.now());
        } catch (e) {
          console.warn(`Invalid timestamp for PIREP ${index}:`, pirep.reportTime || pirep.obsTime);
        }

        return {
          id: pirep.reportId || `pirep-${icao}-${index}`,
          icao: pirep.stationId || icao,
          aircraft: pirep.aircraftRef || 'UNKNOWN',
          altitude: safeParseInt(pirep.altitude),
          turbulence: mapTurbulenceIntensity(pirep.turbulenceCondition),
          icing: mapIcingIntensity(pirep.icingCondition),
          timestamp,
          rawReport: pirep.rawOb || pirep.pirepText || '',
          location: {
            lat: safeParseFloat(pirep.latitude),
            lon: safeParseFloat(pirep.longitude)
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
    const data = await fetchWithCache(
      `${BASE_URL}/airsigmet?stationString=${icao}&format=json`,
      `sigmet-${icao}-${radiusNm}`,
      CACHE_DURATIONS.SIGMET
    );

    if (!data || !Array.isArray(data)) return [];

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return data
      .map((sigmet: any, index: number) => {
        // Safely parse timestamps
        let validFrom = new Date();
        let validTo = new Date(Date.now() + 6 * 60 * 60 * 1000);
        
        try {
          validFrom = new Date(sigmet.validTimeFrom || Date.now());
          validTo = new Date(sigmet.validTimeTo || Date.now() + 6 * 60 * 60 * 1000);
        } catch (e) {
          console.warn(`Invalid timestamps for SIGMET ${index}:`, sigmet.validTimeFrom, sigmet.validTimeTo);
        }

        const isExpired = validTo < now;
        const isActive = validFrom <= now && validTo >= now;

        return {
          id: sigmet.hazardId || `sigmet-${icao}-${index}`,
          type: sigmet.hazardType || 'AIRMET',
          hazard: mapHazardType(sigmet.hazard),
          severity: mapSeverityLevel(sigmet.severity || sigmet.hazard),
          altitudeMin: safeParseInt(sigmet.altitudeLow),
          altitudeMax: safeParseInt(sigmet.altitudeHigh, 60000),
          validFrom,
          validTo,
          affectedICAOs: [icao],
          rawText: sigmet.rawText || sigmet.text || '',
          isExpired,
          isActive
        };
      })
      .filter((sigmet: SIGMET) => {
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

// Safe parsing helper functions
function safeParseInt(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const parsed = parseInt(String(value));
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseFloat(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeToLowerCase(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

// Helper functions for mapping API responses to our types
function mapTurbulenceIntensity(condition: any): 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!condition) return 'NONE';
  
  const intensity = safeToLowerCase(condition.intensity || condition.type || condition);
  
  if (intensity.includes('severe') || intensity.includes('extreme')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light') || intensity.includes('weak')) return 'LIGHT';
  
  return 'NONE';
}

function mapIcingIntensity(condition: any): 'NONE' | 'TRACE' | 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!condition) return 'NONE';
  
  const intensity = safeToLowerCase(condition.intensity || condition.type || condition);
  
  if (intensity.includes('severe') || intensity.includes('heavy')) return 'SEVERE';
  if (intensity.includes('moderate')) return 'MODERATE';
  if (intensity.includes('light')) return 'LIGHT';
  if (intensity.includes('trace')) return 'TRACE';
  
  return 'NONE';
}

function mapHazardType(hazard: any): 'TURB' | 'ICE' | 'IFR' | 'MT_OBSC' | 'CONVECTIVE' {
  if (!hazard) return 'TURB';
  
  const h = safeToLowerCase(hazard);
  
  if (h.includes('turbulence') || h.includes('turb')) return 'TURB';
  if (h.includes('icing') || h.includes('ice')) return 'ICE';
  if (h.includes('ifr') || h.includes('visibility') || h.includes('fog')) return 'IFR';
  if (h.includes('mountain') || h.includes('obscur')) return 'MT_OBSC';
  if (h.includes('convective') || h.includes('thunderstorm') || h.includes('tstm')) return 'CONVECTIVE';
  
  return 'TURB';
}

function mapSeverityLevel(severity: any): 'LIGHT' | 'MODERATE' | 'SEVERE' {
  if (!severity) return 'MODERATE';
  
  const s = safeToLowerCase(severity);
  
  if (s.includes('severe') || s.includes('extreme') || s.includes('strong')) return 'SEVERE';
  if (s.includes('light') || s.includes('weak') || s.includes('mild')) return 'LIGHT';
  
  return 'MODERATE';
}

function parseMetarConditions(metar: string): { visibility: number; ceiling: number } {
  let visibility = 10; // Default good visibility
  let ceiling = 5000;  // Default high ceiling
  
  if (!metar || typeof metar !== 'string') return { visibility, ceiling };
  
  // Parse visibility in statute miles
  const visMatch = metar.match(/(\d+(?:\s+\d+\/\d+)?|\d+\/\d+)SM/);
  if (visMatch) {
    const visStr = visMatch[1].replace(/\s+/g, '');
    if (visStr.includes('/')) {
      const [num, den] = visStr.split('/').map(Number);
      if (den && den !== 0) {
        visibility = num / den;
      }
    } else {
      const parsed = parseInt(visStr);
      if (!isNaN(parsed)) {
        visibility = parsed;
      }
    }
  }
  
  // Parse ceiling from cloud layers
  const ceilingMatch = metar.match(/(BKN|OVC)(\d{3})/);
  if (ceilingMatch) {
    const parsed = parseInt(ceilingMatch[2]);
    if (!isNaN(parsed)) {
      ceiling = parsed * 100;
    }
  }
  
  return { visibility, ceiling };
}

function getAirportName(icao: string): string {
  const names: Record<string, string> = {
    'CYYT': 'St. John\'s Intl',
    'CYWK': 'Wabush',
    'CYQM': 'Moncton',
    'CYQX': 'Gander Intl',
    'CYHZ': 'Halifax Stanfield',
    'CYYR': 'Goose Bay',
    'CYDF': 'Deer Lake',
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
