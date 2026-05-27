/**
 * Remplissage des gaps GPS avec de vraies routes via OSRM (OpenStreetMap Routing)
 * 100% gratuit, aucune clé API nécessaire.
 */

import type { GeoPoint } from '@/types/trip';
import { haversineDistance } from './tripCalculations';

const OSRM = 'https://router.project-osrm.org';

interface OSRMRouteResponse {
  code: string;
  routes?: Array<{
    geometry: { coordinates: [number, number][] };
    distance: number; // mètres
    duration: number; // secondes
  }>;
}

/**
 * Remplace un gap (ex: pendant utilisation de Waze) par un itinéraire
 * suivant les routes réelles entre le dernier point connu et la position actuelle.
 *
 * - Si la distance est < 30m → retourne juste le point d'arrivée (pas besoin de routing)
 * - Si OSRM échoue ou timeout → fallback : juste le point d'arrivée
 */
export async function fillGapWithRoute(
  from: GeoPoint,
  to: GeoPoint
): Promise<GeoPoint[]> {
  const distKm = haversineDistance(from, to);

  // Moins de 30m de gap → pas besoin de routing
  if (distKm < 0.03) return [to];

  try {
    const url =
      `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return [to];

    const data: OSRMRouteResponse = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return [to];

    const coords = data.routes[0].geometry.coordinates; // [[lng, lat], ...]
    const timeDiff = to.timestamp - from.timestamp;
    const n = coords.length;

    // Interpoler les timestamps linéairement entre from.timestamp et to.timestamp
    return coords.map(([lng, lat], idx) => ({
      lat,
      lng,
      timestamp: from.timestamp + Math.round((idx / Math.max(n - 1, 1)) * timeDiff),
      accuracy: 15, // Précision "synthétique" des points interpolés
    }));
  } catch {
    // Timeout, erreur réseau, OSRM indisponible → on ajoute juste le point actuel
    return [to];
  }
}

/**
 * Map matching : colle les points GPS aux routes les plus proches (OSRM Match API).
 * Utilisé à la fin du trajet pour corriger la distance totale.
 *
 * Retourne null si le snap échoue (le caller garde alors les points originaux).
 */
export async function snapToRoads(points: GeoPoint[]): Promise<GeoPoint[] | null> {
  if (points.length < 2) return null;

  // OSRM Match accepte max 100 coordonnées — on sous-échantillonne si besoin
  const MAX = 100;
  const step = Math.max(1, Math.ceil(points.length / MAX));
  const sampled: GeoPoint[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
  // Toujours inclure le dernier point
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }

  const coords     = sampled.map((p) => `${p.lng},${p.lat}`).join(';');
  const timestamps = sampled.map((p) => Math.round(p.timestamp / 1000)).join(';');
  const url =
    `${OSRM}/match/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&timestamps=${timestamps}&tidy=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.code !== 'Ok' || !data.matchings?.[0]) return null;

    const snapped: [number, number][] = data.matchings[0].geometry.coordinates;
    const duration: number = data.matchings[0].duration * 1000; // ms
    const startTs  = points[0].timestamp;
    const n = snapped.length;

    return snapped.map(([lng, lat], idx) => ({
      lat,
      lng,
      timestamp: startTs + Math.round((idx / Math.max(n - 1, 1)) * duration),
      accuracy: 8,
    }));
  } catch {
    return null;
  }
}
