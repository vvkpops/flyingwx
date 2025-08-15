import { WeatherData } from '../types/weather';

const CORS_PROXY = 'https://corsproxy.io/?';
const TAF_CACHE_MS = 600000; // 10 minutes (matches original)
const METAR_CACHE_MS = 60000; // 1 minute (matches original)

interface CacheEntry {
  data: string;
  time: number; // Using 'time' to match original
}

const cache: Record<string, { metar?: CacheEntry; taf?: CacheEntry }> = {};

async function fetchWithCache(
  url: string,
  icao: string,
  type: 'metar' | 'taf',
  cacheMs: number
): Promise<string> {
  const cached = cache[icao]?.[type];
  
  if (cached && (Date.now() - cached.time < cacheMs)) {
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const cleanText = text.trim();
    
    if (!cache[icao]) cache[icao] = {};
    cache[icao][type] = { data: cleanText, time: Date.now() };
    
    return cleanText;
  } catch (error) {
    console.error(`Error fetching ${type} for ${icao}:`, error);
    return '';
  }
}

export async function fetchWeatherData(icao: string): Promise<WeatherData> {
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('Invalid ICAO code');
  }

  const [metar, taf] = await Promise.all([
    fetchWithCache(
      `${CORS_PROXY}https://aviationweather.gov/cgi-bin/data/metar.php?ids=${icao}&format=raw`,
      icao,
      'metar',
      METAR_CACHE_MS
    ),
    fetchWithCache(
      `${CORS_PROXY}https://aviationweather.gov/cgi-bin/data/taf.php?ids=${icao}&format=raw`,
      icao,
      'taf',
      TAF_CACHE_MS
    )
  ]);

  return { metar, taf };
}
