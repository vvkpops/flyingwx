import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

// Updated API endpoints with working alternatives
const AVIATIONWEATHER_BASE = 'https://aviationweather.gov/api/data';
const CHECKWX_BASE = 'https://api.checkwx.com/v1';

// Multiple CORS proxy options for better reliability
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

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

async function fetchWithFallback(urls: string[], cacheKey: string, cacheDuration: number): Promise<any> {
  const cached = cache[cacheKey];
  
  if (cached && (Date.now() - cached.timestamp < cacheDuration)) {
    console.log(`Cache hit for ${cacheKey}`);
    return cached.data;
  }

  let lastError: Error | null = null;

  // Try each URL with each CORS proxy
  for (const url of urls) {
    for (const proxy of CORS_PROXIES) {
      try {
        console.log(`Trying: ${proxy}${encodeURIComponent(url)}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(`${proxy}${encodeURIComponent(url)}`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'FlyingWx/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseText = await response.text();
        
        // Check for common error responses
        if (responseText.includes('error') || responseText.includes('Error') || 
            responseText.includes('not found') || responseText.length < 10) {
          throw new Error(`Invalid response: ${responseText.substring(0, 100)}`);
        }
        
        let data;
        try {
          // Try to parse as JSON first
          data = JSON.parse(responseText);
        } catch (jsonError) {
          // If not JSON, treat as plain text (for raw format responses)
          data = responseText.trim();
        }
        
        // Cache successful response
        cache[cacheKey] = {
          data,
          timestamp: Date.now()
        };
        
        console.log(`Success for ${cacheKey} via ${proxy}`);
        return data;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`Failed ${cacheKey} via ${proxy}:`, error);
        continue; // Try next proxy/URL combination
      }
    }
  }

  console.error(`All attempts failed for ${cacheKey}:`, lastError);
  throw lastError || new Error('All fetch attempts failed');
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  console.log(`Fetching weather data for ${icao}`);

  try {
    // Try multiple data sources for better reliability
    const metarUrls = [
      `${AVIATIONWEATHER_BASE}/metar?stationString=${icao}&format=json&hours=2&taf=false`,
      `${AVIATIONWEATHER_BASE}/metar?stationString=${icao}&format=raw&hours=2`,
      `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`
    ];

    const tafUrls = [
      `${AVIATIONWEATHER_BASE}/taf?stationString=${icao}&format=json&hours=8`,
      `${AVIATIONWEATHER_BASE}/taf?stationString=${icao}&format=raw&hours=8`,
      `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`
    ];

    const [metarData, tafData] = await Promise.allSettled([
      fetchWithFallback(metarUrls, `metar-${icao}`, CACHE_DURATIONS.METAR),
      fetchWithFallback(tafUrls, `taf-${icao}`, CACHE_DURATIONS.TAF)
    ]);

    let metar = '';
    let taf = '';

    // Process METAR data
    if (metarData.status === 'fulfilled' && metarData.value) {
      const data = metarData.value;
      if (Array.isArray(data) && data.length > 0) {
        // JSON format response
        metar = data[0].rawOb || data[0].raw || data[0].reportBody || '';
      } else if (typeof data === 'string') {
        // Raw text format - extract the METAR line
        const lines = data.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // For NWS files, skip the timestamp line and get the METAR
          metar = lines.length > 1 ? lines[1].trim() : lines[0].trim();
        }
      }
    }

    // Process TAF data
    if (tafData.status === 'fulfilled' && tafData.value) {
      const data = tafData.value;
      if (Array.isArray(data) && data.length > 0) {
        // JSON format response
        taf = data[0].rawTAF || data[0].raw || data[0].reportBody || '';
      } else if (typeof data === 'string') {
        // Raw text format
        const lines = data.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // For NWS files, skip the timestamp line and get the TAF
          taf = lines.length > 1 ? lines.slice(1).join('\n').trim() : lines[0].trim();
        }
      }
    }

    // Clean up the data
    metar = cleanWeatherText(metar);
    taf = cleanWeatherText(taf);

    console.log(`Weather data fetched for ${icao}:`, { metar: metar.substring(0, 50), taf: taf.substring(0, 50) });

    return { metar, taf };

  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { 
      metar: '', 
      taf: '', 
      error: `Failed to fetch data for ${icao}: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

function cleanWeatherText(text: string): string {
  if (!text) return '';
  
  // Remove extra whitespace and normalize
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Remove common prefixes/suffixes that aren't part of the actual report
  cleaned = cleaned.replace(/^(METAR|TAF|SPECI)\s+/, '');
  cleaned = cleaned.replace(/\s+(METAR|TAF|SPECI)$/, '');
  
  return cleaned;
}

export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  try {
    console.log(`Fetching PIREPs for ${icao}`);
    
    const pirepUrls = [
      `${AVIATIONWEATHER_BASE}/pirep?stationString=${icao}&hoursBeforeNow=12&format=json`,
      `${AVIATIONWEATHER_BASE}/pirep?stationString=${icao}&hoursBeforeNow=12&format=raw`
    ];

    const data = await fetchWithFallback(pirepUrls, `pirep-${icao}-${radiusNm}`, CACHE_DURATIONS.PIREP);

    if (!data) return [];

    let pirepsArray: any[] = [];
    
    if (Array.isArray(data)) {
      pirepsArray = data;
    } else if (typeof data === 'string') {
      // Parse raw PIREP text format
      const lines = data.split('\n').filter(line => line.trim());
      pirepsArray = lines.map((line, index) => ({
        rawOb: line,
        reportId: `pirep-${icao}-${index}`,
        stationId: icao,
        reportTime: new Date().toISOString(),
        aircraftRef: 'UNKNOWN',
        altitude: '0',
        latitude: '0',
        longitude: '0'
      }));
    }

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return pirepsArray
      .map((pirep: any, index: number) => {
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
    console.log(`Fetching SIGMETs for ${icao}`);
    
    const sigmetUrls = [
      `${AVIATIONWEATHER_BASE}/airsigmet?stationString=${icao}&format=json`,
      `${AVIATIONWEATHER_BASE}/airsigmet?stationString=${icao}&format=raw`
    ];

    const data = await fetchWithFallback(sigmetUrls, `sigmet-${icao}-${radiusNm}`, CACHE_DURATIONS.SIGMET);

    if (!data) return [];

    let sigmetsArray: any[] = [];
    
    if (Array.isArray(data)) {
      sigmetsArray = data;
    } else if (typeof data === 'string') {
      // Parse raw SIGMET text format
      const lines = data.split('\n').filter(line => line.trim());
      sigmetsArray = lines.map((line, index) => ({
        rawText: line,
        hazardId: `sigmet-${icao}-${index}`,
        hazardType: 'AIRMET',
        severity: 'MODERATE',
        validTimeFrom: new Date().toISOString(),
        validTimeTo: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        altitudeLow: '0',
        altitudeHigh: '60000'
      }));
    }

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    return sigmetsArray
      .map((sigmet: any, index: number) => {
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
          type: (sigmet.hazardType || 'AIRMET') as 'SIGMET' | 'AIRMET',
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
    console.log(`Fetching station status for ${icao}`);
    
    const [weatherData, pireps, sigmets] = await Promise.allSettled([
      fetchWeatherData(icao),
      fetchPIREPs(icao),
      fetchSIGMETs(icao)
    ]);

    const weather = weatherData.status === 'fulfilled' ? weatherData.value : { metar: '', taf: '', error: 'Failed to fetch weather' };
    const pirepsList = pireps.status === 'fulfilled' ? pireps.value : [];
    const sigmetsList = sigmets.status === 'fulfilled' ? sigmets.value : [];

    // Calculate operational status based on weather conditions
    let operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL' = 'NORMAL';

    if (weather.error) {
      operationalStatus = 'CRITICAL';
    } else {
      // Check for active severe weather in SIGMETs
      const activeSevereSigmets = sigmetsList.filter(s => 
        s.isActive && s.severity === 'SEVERE'
      );
      
      // Check for severe conditions in PIREPs
      const severePireps = pirepsList.filter(p => 
        !p.isExpired && (p.turbulence === 'SEVERE' || p.icing === 'SEVERE')
      );

      if (activeSevereSigmets.length > 0 || severePireps.length > 0) {
        operationalStatus = 'CRITICAL';
      } else if (
        sigmetsList.some(s => s.isActive) || 
        pirepsList.some(p => !p.isExpired && (p.turbulence === 'MODERATE' || p.icing === 'MODERATE'))
      ) {
        operationalStatus = 'CAUTION';
      }

      // Analyze METAR for critical conditions
      if (weather.metar) {
        const conditions = parseMetarConditions(weather.metar);
        
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
      metar: weather,
      pireps: pirepsList,
      sigmets: sigmetsList,
      operationalStatus,
      lastUpdated: new Date()
    };

  } catch (error) {
    console.error(`Error fetching station status for ${icao}:`, error);
    return {
      icao,
      name: getAirportName(icao),
      metar: { metar: '', taf: '', error: `Failed to fetch data for ${icao}` },
      pireps: [],
      sigmets: [],
      operationalStatus: 'CRITICAL',
      lastUpdated: new Date()
    };
  }
}

// Helper functions (unchanged but included for completeness)
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
    'CYQB': 'Quebec City',
    'CYUL': 'Montreal Trudeau',
    'CYZV': 'Sept-Îles',
    'CYYG': 'Charlottetown',
    'CYFC': 'Fredericton',
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
