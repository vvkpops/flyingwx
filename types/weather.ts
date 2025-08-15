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

// New types for Dispatcher View
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
}

export interface StationStatus {
  icao: string;
  name: string;
  metar: WeatherData;
  pireps: PIREP[];
  sigmets: SIGMET[];
  operationalStatus: 'NORMAL' | 'CAUTION' | 'CRITICAL';
  delayProbability: number;
  lastUpdated: Date;
}

export interface FlightInfo {
  id: string;
  callsign: string;
  departure: string;
  arrival: string;
  alternate?: string;
  etd: Date;
  eta: Date;
  status: 'SCHEDULED' | 'DEPARTED' | 'ENROUTE' | 'DELAYED' | 'CANCELLED';
  aircraft: string;
  route?: string;
}

export type ViewMode = 'pilot' | 'dispatcher';
