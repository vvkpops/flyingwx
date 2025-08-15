import type { NextApiRequest, NextApiResponse } from 'next';

interface WeatherApiResponse {
  metar: string;
  taf: string;
  error?: string;
}

// Cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute cache

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WeatherApiResponse>
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ metar: '', taf: '', error: 'Method not allowed' });
    return;
  }

  const { icao } = req.query;

  if (!icao || typeof icao !== 'string' || !/^[A-Z0-9]{4}$/.test(icao)) {
    res.status(400).json({ metar: '', taf: '', error: 'Invalid ICAO code' });
    return;
  }

  const cacheKey = `weather-${icao}`;
  const cached = cache.get(cacheKey);

  // Return cached data if still valid
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    res.status(200).json(cached.data);
    return;
  }

  try {
    console.log(`Fetching weather for ${icao}`);

    // Try multiple data sources
    const weatherData = await fetchWeatherDataServer(icao);
    
    // Cache the response
    cache.set(cacheKey, {
      data: weatherData,
      timestamp: Date.now()
    });

    res.status(200).json(weatherData);

  } catch (error) {
    console.error(`Error fetching weather for ${icao}:`, error);
    const errorResponse = {
      metar: '',
      taf: '',
      error: `Failed to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
    res.status(500).json(errorResponse);
  }
}

async function fetchWeatherDataServer(icao: string): Promise<WeatherApiResponse> {
  const metarSources = [
    // Direct Aviation Weather Center (no CORS on server-side)
    `https://aviationweather.gov/api/data/metar?stationString=${icao}&format=json&hours=2&taf=false`,
    // NWS Direct Text
    `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`,
    // Backup CheckWX API (requires API key in production)
    `https://api.checkwx.com/v1/metar/${icao}/decoded`
  ];

  const tafSources = [
    `https://aviationweather.gov/api/data/taf?stationString=${icao}&format=json&hours=8`,
    `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`
  ];

  let metar = '';
  let taf = '';
  let lastError: Error | null = null;

  // Fetch METAR
  for (const url of metarSources) {
    try {
      console.log(`Trying METAR source: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FlyingWx/1.0 (https://flyingwx.com)',
          'Accept': 'application/json, text/plain, */*'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      if (!responseText || responseText.includes('not found') || responseText.length < 10) {
        throw new Error('No data available');
      }

      // Parse response based on content type
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          const jsonData = JSON.parse(responseText);
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            metar = jsonData[0].rawOb || jsonData[0].raw || '';
          }
        } catch (e) {
          throw new Error('Invalid JSON response');
        }
      } else {
        // Handle plain text responses (NWS format)
        const lines = responseText.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // For NWS files, the METAR is typically on the second line after timestamp
          metar = lines.length > 1 ? lines[1].trim() : lines[0].trim();
        }
      }

      if (metar) {
        console.log(`Got METAR from ${url}: ${metar.substring(0, 50)}...`);
        break; // Success, stop trying other sources
      }

    } catch (error) {
      lastError = error as Error;
      console.warn(`METAR source failed: ${url}`, error);
      continue;
    }
  }

  // Fetch TAF
  for (const url of tafSources) {
    try {
      console.log(`Trying TAF source: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FlyingWx/1.0 (https://flyingwx.com)',
          'Accept': 'application/json, text/plain, */*'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      if (!responseText || responseText.includes('not found') || responseText.length < 10) {
        throw new Error('No TAF data available');
      }

      // Parse response based on content type
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          const jsonData = JSON.parse(responseText);
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            taf = jsonData[0].rawTAF || jsonData[0].raw || '';
          }
        } catch (e) {
          throw new Error('Invalid JSON response');
        }
      } else {
        // Handle plain text responses (NWS format)
        const lines = responseText.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // For NWS TAF files, skip timestamp and get the TAF content
          taf = lines.length > 1 ? lines.slice(1).join('\n').trim() : lines[0].trim();
        }
      }

      if (taf) {
        console.log(`Got TAF from ${url}: ${taf.substring(0, 50)}...`);
        break; // Success, stop trying other sources
      }

    } catch (error) {
      lastError = error as Error;
      console.warn(`TAF source failed: ${url}`, error);
      continue;
    }
  }

  // Clean up the weather text
  metar = cleanWeatherText(metar);
  taf = cleanWeatherText(taf);

  // If we didn't get any data at all, throw error
  if (!metar && !taf) {
    throw lastError || new Error(`No weather data available for ${icao}`);
  }

  return { metar, taf };
}

function cleanWeatherText(text: string): string {
  if (!text) return '';
  
  // Remove extra whitespace and normalize
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Remove common prefixes/suffixes that aren't part of the actual report
  cleaned = cleaned.replace(/^(METAR|TAF|SPECI)\s+/, '');
  cleaned = cleaned.replace(/\s+(METAR|TAF|SPECI)$/, '');
  
  // Remove timestamp lines that might be included
  cleaned = cleaned.replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/, '');
  
  return cleaned;
}
