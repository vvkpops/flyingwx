import type { NextApiRequest, NextApiResponse } from 'next';

// Test API route for debugging weather data fetching

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { icao } = req.query;

  if (!icao || typeof icao !== 'string' || !/^[A-Z0-9]{4}$/.test(icao)) {
    res.status(400).json({ error: 'Invalid ICAO code' });
    return;
  }

  const results = {
    icao,
    sources: [] as any[],
    timestamp: new Date().toISOString(),
    summary: ''
  };

  // Test different weather sources
  const sources = [
    {
      name: 'AWC METAR JSON',
      url: `https://aviationweather.gov/api/data/metar?stationString=${icao}&format=json&hours=2`,
      type: 'json'
    },
    {
      name: 'AWC METAR Raw',
      url: `https://aviationweather.gov/api/data/metar?stationString=${icao}&format=raw&hours=2`,
      type: 'text'
    },
    {
      name: 'NWS METAR Direct',
      url: `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`,
      type: 'text'
    },
    {
      name: 'AWC TAF JSON',
      url: `https://aviationweather.gov/api/data/taf?stationString=${icao}&format=json&hours=8`,
      type: 'json'
    },
    {
      name: 'AWC TAF Raw',
      url: `https://aviationweather.gov/api/data/taf?stationString=${icao}&format=raw&hours=8`,
      type: 'text'
    }
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const source of sources) {
    const result = {
      name: source.name,
      url: source.url,
      status: 'unknown',
      data: null as any,
      error: null as any,
      responseTime: 0,
      size: 0
    };

    try {
      const startTime = Date.now();
      
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'FlyingWx/1.0 Test (https://flyingwx.com)',
          'Accept': source.type === 'json' ? 'application/json' : 'text/plain'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      result.responseTime = Date.now() - startTime;
      result.status = response.status.toString();

      if (response.ok) {
        const responseText = await response.text();
        result.size = responseText.length;

        if (source.type === 'json') {
          try {
            result.data = JSON.parse(responseText);
            successCount++;
          } catch (e) {
            result.error = 'Invalid JSON response';
            result.data = responseText.substring(0, 200);
            errorCount++;
          }
        } else {
          result.data = responseText.substring(0, 500); // Truncate for display
          successCount++;
        }
      } else {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        errorCount++;
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      errorCount++;
    }

    results.sources.push(result);
  }

  results.summary = `${successCount} successful, ${errorCount} failed out of ${sources.length} sources tested`;

  res.status(200).json(results);
}

// Export config to handle larger responses
export const config = {
  api: {
    responseLimit: '8mb',
  },
}
