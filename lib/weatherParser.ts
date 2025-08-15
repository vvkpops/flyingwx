import { ParsedWeatherConditions, Minima } from '../types/weather';

export function parseWeatherLine(line: string): ParsedWeatherConditions {
  let ceiling = Infinity;
  let visMiles = Infinity;
  let isGreater = false;

  // Parse cloud ceiling (BKN, OVC, VV)
  const cloudMatch = line.match(/(BKN|OVC|VV)(\d{3})/);
  if (cloudMatch) {
    ceiling = parseInt(cloudMatch[2], 10) * 100;
  }

  // Parse visibility
  const visMatch = line.match(/(P?\d{1,2})SM/);
  if (visMatch) {
    if (visMatch[1].startsWith('P')) {
      visMiles = parseInt(visMatch[1].slice(1), 10);
      isGreater = true;
    } else {
      visMiles = parseInt(visMatch[1], 10);
    }
  }

  return { ceiling, visMiles, isGreater };
}

export function checkConditionsAgainstMinima(
  conditions: ParsedWeatherConditions,
  minima: Minima
): boolean {
  const visOk = conditions.isGreater || conditions.visMiles >= minima.vis;
  const ceilOk = conditions.ceiling >= minima.ceiling;
  return visOk && ceilOk;
}

export function highlightWeatherText(
  rawText: string,
  minima: Minima
): { html: string; hasViolations: boolean } {
  const lines = rawText.split('\n');
  let hasViolations = false;

  const html = lines
    .map(line => {
      const conditions = parseWeatherLine(line);
      const meetsMinima = checkConditionsAgainstMinima(conditions, minima);
      
      if (!meetsMinima && line.trim()) {
        hasViolations = true;
        return `<div class="text-red-400 font-bold">${line}</div>`;
      }
      
      return `<div>${line}</div>`;
    })
    .join('');

  return { html, hasViolations };
}
