export interface Minima {
  ceiling: number;
  vis: number;
}

export interface WeatherData {
  metar: string;
  taf: string;
  error?: string;
}

export interface ParsedWeatherConditions {
  ceiling: number;
  visMiles: number;
  isGreater: boolean;
}
