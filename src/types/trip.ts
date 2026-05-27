export interface GeoPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
}

export interface CityVisited {
  name: string;
  enteredAt: number;
  exitedAt?: number;
}

export interface Trip {
  id: string;
  startTime: number;
  endTime?: number;
  points: GeoPoint[];
  citiesVisited: CityVisited[];
  distanceKm: number;
  durationMs?: number;
  indemnite: number;
  status: 'active' | 'completed';
  startAddress?: string;
  endAddress?: string;
}

export interface TripReport {
  trip: Trip;
  formattedDuration: string;
  formattedDistance: string;
  formattedIndemnite: string;
}
