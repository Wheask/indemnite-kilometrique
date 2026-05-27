import type { GeoPoint, Trip } from '@/types/trip';

export const INDEMNITE_PAR_KM = 0.45; // €/km

/**
 * Calcule la distance en km entre deux points GPS (formule de Haversine)
 */
export function haversineDistance(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371; // Rayon terrestre en km
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calcule la distance totale d'un tableau de points GPS
 */
export function calculateTotalDistance(points: GeoPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Calcule l'indemnité kilométrique
 */
export function calculateIndemnite(distanceKm: number): number {
  return Math.round(distanceKm * INDEMNITE_PAR_KM * 100) / 100;
}

/**
 * Formate une durée en ms en chaîne lisible
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}min`;
  }
  if (minutes > 0) {
    return `${minutes}min ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

/**
 * Formate une distance en km
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

/**
 * Formate un montant en euros
 */
export function formatIndemnite(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

/**
 * Formate une date timestamp en heure lisible
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formate une date timestamp en date + heure
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sauvegarde un trajet dans le localStorage
 */
export function saveTrip(trip: Trip): void {
  const trips = loadTrips();
  const index = trips.findIndex((t) => t.id === trip.id);
  if (index >= 0) {
    trips[index] = trip;
  } else {
    trips.unshift(trip);
  }
  localStorage.setItem('indemnite_trips', JSON.stringify(trips));
}

/**
 * Charge tous les trajets depuis le localStorage
 */
export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem('indemnite_trips');
    if (!raw) return [];
    return JSON.parse(raw) as Trip[];
  } catch {
    return [];
  }
}

/**
 * Supprime un trajet du localStorage
 */
export function deleteTrip(id: string): void {
  const trips = loadTrips().filter((t) => t.id !== id);
  localStorage.setItem('indemnite_trips', JSON.stringify(trips));
}

/**
 * Génère un identifiant unique
 */
export function generateId(): string {
  return `trip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
