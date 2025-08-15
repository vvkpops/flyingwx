import { ParsedWeatherConditions, Minima } from '../types/weather';

export function parseWeatherLine(line: string): ParsedWeatherConditions {
  let ceiling = Infinity;
  let visMiles = Infinity;
  let isGreater = false;

  // Parse cloud ceiling (BKN, OVC, VV) - exactly like original
  const cloudMatch = line.match(/(BKN|OVC|VV)(\d{3})/);
  if (cloudMatch) {
    ceiling = parseInt(cloudMatch[2], 10) * 100;
  }

  // Parse visibility - exactly like original
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

// Fixed to exactly match original highlighting logic
export function highlightWeatherText(
  rawText: string,
  minima: Minima
): { html: string; hasViolations: boolean } {
  if (!rawText.trim()) {
    return { html: '', hasViolations: false };
  }

  const lines = rawText.split('\n');
  let hasViolations = false;

  const html = lines
    .map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return '<div></div>';
      }

      const conditions = parseWeatherLine(trimmedLine);
      const meetsMinima = checkConditionsAgainstMinima(conditions, minima);
      
      // If conditions don't meet minima AND it's not infinity (meaning we found actual weather data)
      if (!meetsMinima && (conditions.ceiling !== Infinity || conditions.visMiles !== Infinity)) {
        hasViolations = true;
        return `<div class="text-red-400 font-bold">${trimmedLine}</div>`;
      }
      
      return `<div>${trimmedLine}</div>`;
    })
    .join('');

  return { html, hasViolations };
}
