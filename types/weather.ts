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

export interface PIREP {
  id: string;
  icao: string;
  aircraft: string;
  altitude: number;
  turbulence?: 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE';
  icing?: 'NONE' | 'TRACE' | 'LIGHT' | 'MODERATE' | 'SEVERE';
  timestamp: Date;
  rawReport: string;
  location: {
    lat: number;
    lon: number;
  };
  isExpired?: boolean;
}

export interface SIGMET {
  id: string;
  type: 'SIGMET' | 'AIRMET';
  hazard: 'TURB' | 'ICE' | 'IFR' | 'MT_OBSC' | 'CONVECTIVE';
  severity: 'LIGHT' | 'MODERATE' | 'SEVERE';
  altitudeMin: number;
  altitudeMax: number;
  validFrom: Date;
  validTo: Date;
  affectedICAOs: string[];
  rawText: string;
  isExpired?: boolean;
  isActive?: boolean;
}

export interface StationStatus {
  icao: string;
  name: string;
  metar: WeatherData;
  pireps: PIREP[];
  sigmets: SIGMET[];
  operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL';
  lastUpdated: Date;
}

export type ViewMode = 'pilot' | 'dispatcher';
