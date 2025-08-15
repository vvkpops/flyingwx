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

/**
 * Robust fetcher that:
 * - tries multiple sources
 * - handles multiple JSON shapes
 * - extracts probable raw text fields
 * - ensures returned METAR includes the ICAO (prefixes it if necessary)
 */
async function fetchWeatherDataServer(icao: string): Promise<WeatherApiResponse> {
  const metarSources = [
    // Direct Aviation Weather Center (server-side requests avoid CORS)
    `https://aviationweather.gov/api/data/metar?stationString=${icao}&format=json&hours=2&taf=false`,
    // NWS Direct Text
    `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`,
    // CheckWX (fallback - requires API key for reliable responses in production)
    `https://api.checkwx.com/v1/metar/${icao}/decoded`
  ];

  const tafSources = [
    `https://aviationweather.gov/api/data/taf?stationString=${icao}&format=json&hours=8`,
    `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`
  ];

  let metar = '';
  let taf = '';
  let lastError: Error | null = null;

  // Helper: attempt to extract common raw fields from parsed JSON/object
  function extractRawFromObject(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    // Common possible fields across providers
    const candidates = [
      'raw_text', 'raw', 'raw_ob', 'rawOb', 'rawText', 'rawTAF', 'rawTAFText', 'text',
      'rawMessage', 'raw_message', 'rawMETAR', 'obs', 'observation', 'rawOb'
    ];

    for (const k of candidates) {
      if (typeof obj[k] === 'string' && obj[k].trim().length > 0) {
        return obj[k].trim();
      }
    }

    // Some providers nest data under properties e.g. feature.properties.rawMessage
    if (obj.properties && typeof obj.properties === 'object') {
      return extractRawFromObject(obj.properties);
    }

    // Some return station_id + raw_text separately; build if present
    if (obj.station_id || obj.station || obj.stationId) {
      const stationId = String(obj.station_id || obj.station || obj.stationId).trim();
      const rawText = (obj.raw_text || obj.raw || obj.text || '') as string;
      if (rawText && rawText.trim().length > 0) {
        return `${stationId} ${rawText.trim()}`;
      }
    }

    return null;
  }

  // Try METAR sources
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

      const contentType = response.headers.get('content-type') || '';

      // TEXT response (NWS)
      if (contentType.includes('text') || contentType.includes('plain')) {
        const responseText = await response.text();
        const lines = responseText.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // For NWS TXT, the METAR is usually on line 2
          metar = lines.length > 1 ? lines[1].trim() : lines[0].trim();
        }
      } else {
        // Try JSON parsing and robust extraction
        const responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty response from source');
        }

        let parsed: any;
        try {
          parsed = JSON.parse(responseText);
        } catch (e) {
          // Not JSON - fall back to raw text
          if (responseText && responseText.trim().length > 0) {
            metar = responseText.trim();
          } else {
            throw new Error('Invalid JSON and empty text response');
          }
        }

        if (parsed) {
          // Many providers wrap results in arrays or `data` properties
          let candidate: any = null;

          if (Array.isArray(parsed) && parsed.length > 0) {
            candidate = parsed[0];
          } else if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
            candidate = parsed.data[0];
          } else if (parsed.features && Array.isArray(parsed.features) && parsed.features.length > 0) {
            // GeoJSON style
            candidate = parsed.features[0];
          } else if (parsed.response && parsed.response.data && Array.isArray(parsed.response.data) && parsed.response.data.length > 0) {
            candidate = parsed.response.data[0];
          } else {
            candidate = parsed;
          }

          const raw = extractRawFromObject(candidate);
          if (raw) {
            metar = raw;
          } else if (typeof candidate === 'string' && candidate.trim().length > 0) {
            metar = candidate.trim();
          }
        }
      }

      if (metar) {
        metar = cleanWeatherText(metar);
        // Ensure the returned METAR string contains the ICAO; if not, prefix it.
        if (!metar.includes(icao)) {
          metar = `${icao} ${metar}`.trim();
        }
        console.log(`Got METAR from ${url}: ${metar.substring(0, 80)}`);
        break;
      }

    } catch (error) {
      lastError = error as Error;
      console.warn(`METAR source failed: ${url}`, error);
      continue;
    }
  }

  // Try TAF sources
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

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text') || contentType.includes('plain')) {
        const responseText = await response.text();
        const lines = responseText.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          taf = lines.length > 1 ? lines.slice(1).join('\n').trim() : lines[0].trim();
        }
      } else {
        const responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty TAF response');
        }

        let parsed: any;
        try {
          parsed = JSON.parse(responseText);
        } catch (e) {
          // If not JSON, use raw text
          if (responseText && responseText.trim().length > 0) {
            taf = responseText.trim();
          } else {
            throw new Error('Invalid JSON and empty text response for TAF');
          }
        }

        if (parsed) {
          let candidate: any = null;

          if (Array.isArray(parsed) && parsed.length > 0) {
            candidate = parsed[0];
          } else if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
            candidate = parsed.data[0];
          } else if (parsed.features && Array.isArray(parsed.features) && parsed.features.length > 0) {
            candidate = parsed.features[0];
          } else {
            candidate = parsed;
          }

          // Several TAF providers put text under rawTAF, raw_text, raw, etc.
          const raw = (candidate && (candidate.rawTAF || candidate.raw_taf || candidate.raw_text || candidate.raw || candidate.text)) || null;
          if (typeof raw === 'string' && raw.trim().length > 0) {
            taf = raw.trim();
          } else {
            // fallback to generic extractor
            const extracted = (candidate && (candidate.raw_text || candidate.raw || candidate.text)) ? String(candidate.raw_text || candidate.raw || candidate.text) : null;
            if (extracted) taf = extracted.trim();
          }
        }
      }

      if (taf) {
        taf = cleanWeatherText(taf);
        // Ensure TAF contains ICAO if reasonable
        if (!taf.includes(icao)) {
          taf = `${icao} ${taf}`.trim();
        }
        console.log(`Got TAF from ${url}: ${taf.substring(0, 80)}`);
        break;
      }

    } catch (error) {
      lastError = error as Error;
      console.warn(`TAF source failed: ${url}`, error);
      continue;
    }
  }

  // If nothing was found at all, surface lastError
  if (!metar && !taf) {
    throw lastError || new Error(`No weather data available for ${icao}`);
  }

  return { metar, taf };
}

function cleanWeatherText(text: string): string {
  if (!text) return '';

  // Collapse and normalize whitespace
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();

  // Remove common labels but avoid removing the ICAO
  cleaned = cleaned.replace(/^(METAR|TAF|SPECI)\s+/i, '');
  cleaned = cleaned.replace(/\s+(METAR|TAF|SPECI)$/i, '');

  // Remove obvious timestamp lines like YYYY/MM/DD HH:MM at the start
  cleaned = cleaned.replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/i, '');

  return cleaned;
}
