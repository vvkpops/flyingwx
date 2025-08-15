import { WeatherData, PIREP, SIGMET, StationStatus } from '../types/weather';

// Client-side cache
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
    console.log(`Cache hit for ${cacheKey}`);
    return cached.data;
  }

  try {
    console.log(`Fetching: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache successful response
    cache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    console.log(`Success for ${cacheKey}`);
    return data;
    
  } catch (error) {
    console.error(`Failed to fetch ${cacheKey}:`, error);
    throw error;
  }
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  try {
    console.log(`Fetching weather data for ${icao}`);
    
    // Use our Next.js API route
    const data = await fetchWithCache(
      `/api/weather/${icao}`,
      `weather-${icao}`,
      CACHE_DURATIONS.METAR
    );
    
    return data;

  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    return { 
      metar: '', 
      taf: '', 
      error: `Failed to fetch data for ${icao}: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

export async function fetchPIREPs(icao: string, radiusNm: number = 50): Promise<PIREP[]> {
  try {
    console.log(`Fetching PIREPs for ${icao}`);
    
    // For now, return mock data since PIREPs are complex to parse
    // In a production environment, you'd want to create another API route for this
    const mockPireps: PIREP[] = generateMockPireps(icao);
    
    return mockPireps;

  } catch (error) {
    console.error(`Error fetching PIREPs for ${icao}:`, error);
    return [];
  }
}

export async function fetchSIGMETs(icao: string, radiusNm: number = 100): Promise<SIGMET[]> {
  try {
    console.log(`Fetching SIGMETs for ${icao}`);
    
    // For now, return mock data since SIGMETs are complex to parse
    // In a production environment, you'd want to create another API route for this
    const mockSigmets: SIGMET[] = generateMockSigmets(icao);
    
    return mockSigmets;

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

// Mock data generators for demonstration (replace with real API calls in production)
function generateMockPireps(icao: string): PIREP[] {
  const now = new Date();
  const mockPireps: PIREP[] = [];
  
  // Generate 0-3 random PIREPs
  const count = Math.floor(Math.random() * 4);
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * 12 * 60 * 60 * 1000);
    const aircraftTypes = ['B737', 'A320', 'CRJ2', 'B777', 'A330', 'E175'];
    const turbulenceLevels: ('NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE')[] = ['NONE', 'LIGHT', 'MODERATE', 'SEVERE'];
    const icingLevels: ('NONE' | 'TRACE' | 'LIGHT' | 'MODERATE' | 'SEVERE')[] = ['NONE', 'TRACE', 'LIGHT', 'MODERATE', 'SEVERE'];
    
    mockPireps.push({
      id: `pirep-${icao}-${i}`,
      icao,
      aircraft: aircraftTypes[Math.floor(Math.random() * aircraftTypes.length)],
      altitude: Math.floor(Math.random() * 40000) + 5000,
      turbulence: turbulenceLevels[Math.floor(Math.random() * turbulenceLevels.length)],
      icing: icingLevels[Math.floor(Math.random() * icingLevels.length)],
      timestamp,
      rawReport: `UUA /OV ${icao}/TM ${timestamp.getHours().toString().padStart(2, '0')}${timestamp.getMinutes().toString().padStart(2, '0')}/FL${Math.floor((Math.random() * 40000 + 5000) / 100)}/TP ${aircraftTypes[Math.floor(Math.random() * aircraftTypes.length)]}/TB LGT-MOD`,
      location: {
        lat: 47.6062 + (Math.random() - 0.5) * 2,
        lon: -122.3321 + (Math.random() - 0.5) * 2
      },
      isExpired: false
    });
  }
  
  return mockPireps;
}

function generateMockSigmets(icao: string): SIGMET[] {
  const now = new Date();
  const mockSigmets: SIGMET[] = [];
  
  // Generate 0-2 random SIGMETs
  const count = Math.floor(Math.random() * 3);
  
  for (let i = 0; i < count; i++) {
    const validFrom = new Date(now.getTime() - Math.random() * 2 * 60 * 60 * 1000);
    const validTo = new Date(validFrom.getTime() + (4 + Math.random() * 4) * 60 * 60 * 1000);
    const hazardTypes: ('TURB' | 'ICE' | 'IFR' | 'MT_OBSC' | 'CONVECTIVE')[] = ['TURB', 'ICE', 'IFR', 'CONVECTIVE'];
    const severityLevels: ('LIGHT' | 'MODERATE' | 'SEVERE')[] = ['LIGHT', 'MODERATE', 'SEVERE'];
    const types: ('SIGMET' | 'AIRMET')[] = ['SIGMET', 'AIRMET'];
    
    const isActive = validFrom <= now && validTo >= now;
    const isExpired = validTo < now;
    
    mockSigmets.push({
      id: `sigmet-${icao}-${i}`,
      type: types[Math.floor(Math.random() * types.length)],
      hazard: hazardTypes[Math.floor(Math.random() * hazardTypes.length)],
      severity: severityLevels[Math.floor(Math.random() * severityLevels.length)],
      altitudeMin: Math.floor(Math.random() * 10000),
      altitudeMax: Math.floor(Math.random() * 30000) + 20000,
      validFrom,
      validTo,
      affectedICAOs: [icao],
      rawText: `BOSN WA 121855 AIRMET TURB...ME NH VT MA RI CT FROM 40NNW BGR TO 30E BGR TO 20S PWM TO 30WNW GDM TO 40NNW BGR MOD TURB BLW 100 DUE TO STG SFC WNDS AND LLWS. CONDS CONTG BYD 22Z.`,
      isExpired,
      isActive
    });
  }
  
  return mockSigmets;
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
