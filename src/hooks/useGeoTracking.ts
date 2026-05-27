'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GeoPoint, Trip } from '@/types/trip';
import {
  calculateTotalDistance,
  calculateIndemnite,
  generateId,
  saveTrip,
} from '@/lib/tripCalculations';
import { reverseGeocode, getAddress } from '@/lib/geocoding';
import { haversineDistance } from '@/lib/tripCalculations';
import { fillGapWithRoute, snapToRoads } from '@/lib/routing';

// ── Constantes ──────────────────────────────────────────────────────────────

const MIN_DISTANCE_FOR_POINT = 0.005; // km — 5m minimum entre deux points
const MAX_SPEED_KMH          = 250;   // km/h — au-delà = saut GPS → ignoré
const CITY_CHECK_INTERVAL    = 10000; // ms — geocoding max toutes les 10s

// Types Wake Lock
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}
interface WakeLockAPI {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

export interface UseGeoTrackingReturn {
  isTracking: boolean;
  currentTrip: Trip | null;
  currentCity: string | null;
  userLocation: GeoPoint | null;
  error: string | null;
  hasWakeLock: boolean;
  gpsPaused: boolean;
  startTracking: () => void;
  stopTracking: () => Promise<Trip | null>;
  requestLocation: () => void;
}

export function useGeoTracking(): UseGeoTrackingReturn {
  const [isTracking,   setIsTracking]   = useState(false);
  const [currentTrip,  setCurrentTrip]  = useState<Trip | null>(null);
  const [currentCity,  setCurrentCity]  = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [hasWakeLock,  setHasWakeLock]  = useState(false);
  const [gpsPaused,    setGpsPaused]    = useState(false);

  const watchIdRef           = useRef<number | null>(null);
  const tripRef              = useRef<Trip | null>(null);
  const lastCityCheckRef     = useRef<number>(0);
  const isMountedRef         = useRef(true);
  const wakeLockRef          = useRef<WakeLockSentinel | null>(null);
  const isTrackingRef        = useRef(false);
  const handlePositionRef    = useRef<((p: GeolocationPosition) => void) | null>(null);
  const handleErrorRef       = useRef<((e: GeolocationPositionError) => void) | null>(null);
  const lastPointBeforeBgRef = useRef<GeoPoint | null>(null); // dernier point avant passage en arrière-plan

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    requestLocationSilently();
    return () => {
      isMountedRef.current = false;
      doReleaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gestion du passage en arrière-plan (Waze, appel, etc.) ─────────────────

  useEffect(() => {
    isTrackingRef.current = isTracking;

    const onVisibility = async () => {
      if (!isTrackingRef.current) return;

      if (document.visibilityState === 'hidden') {
        // Mémoriser le dernier point connu avant de passer en arrière-plan
        const pts = tripRef.current?.points ?? [];
        lastPointBeforeBgRef.current = pts[pts.length - 1] ?? null;
        setGpsPaused(true);

      } else {
        // Retour au premier plan
        setGpsPaused(false);
        await doAcquireWakeLock();

        // Relancer watchPosition (tué sur iOS, parfois sur Android)
        restartWatchPosition();

        // Obtenir la position actuelle et remplir le gap avec une vraie route
        if (navigator.geolocation && handlePositionRef.current) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const currentPoint: GeoPoint = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                timestamp: pos.timestamp,
                accuracy: pos.coords.accuracy,
              };

              const lastPoint = lastPointBeforeBgRef.current;

              if (lastPoint && tripRef.current) {
                const gapSeconds = (currentPoint.timestamp - lastPoint.timestamp) / 1000;

                if (gapSeconds > 10) {
                  // Gap significatif → remplir avec route réelle (OSRM)
                  const routePoints = await fillGapWithRoute(lastPoint, currentPoint);

                  // Insérer tous les points de route dans le trajet
                  for (const pt of routePoints) {
                    if (!tripRef.current) break;
                    const pts      = tripRef.current.points;
                    const prevPt   = pts[pts.length - 1];
                    if (!prevPt || haversineDistance(prevPt, pt) >= MIN_DISTANCE_FOR_POINT) {
                      const newPts   = [...tripRef.current.points, pt];
                      const distKm   = calculateTotalDistance(newPts);
                      const updated: Trip = {
                        ...tripRef.current,
                        points:     newPts,
                        distanceKm: distKm,
                        indemnite:  calculateIndemnite(distKm),
                      };
                      tripRef.current = updated;
                      setCurrentTrip({ ...updated });
                    }
                  }

                  // Mettre à jour carte + localStorage
                  if (tripRef.current) {
                    saveTrip(tripRef.current);
                    setUserLocation(currentPoint);
                    // Vérifier la ville d'arrivée
                    updateCityFn.current?.(currentPoint);
                  }
                } else {
                  // Gap court → comportement normal
                  handlePositionRef.current?.(pos);
                }
              } else {
                handlePositionRef.current?.(pos);
              }

              lastPointBeforeBgRef.current = null;
            },
            () => { /* silencieux */ },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking]);

  // ── Wake Lock ───────────────────────────────────────────────────────────────

  const doAcquireWakeLock = async () => {
    const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
    if (!nav.wakeLock) return;
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await nav.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        if (isMountedRef.current) setHasWakeLock(false);
      });
      if (isMountedRef.current) setHasWakeLock(true);
    } catch { /* indisponible */ }
  };

  const doReleaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
    if (isMountedRef.current) setHasWakeLock(false);
  };

  // ── GPS helpers ─────────────────────────────────────────────────────────────

  const formatGeoError = (err: GeolocationPositionError): string => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Permission GPS refusée — activez la géolocalisation dans les réglages.';
      case err.POSITION_UNAVAILABLE:
        return 'Position GPS indisponible — vérifiez que le GPS est activé.';
      case err.TIMEOUT:
        return 'Délai GPS dépassé — relance en cours…';
      default:
        return 'Erreur GPS inconnue.';
    }
  };

  const requestLocationSilently = () => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude,
          timestamp: pos.timestamp, accuracy: pos.coords.accuracy });
        setError(null);
      },
      (err) => {
        if (!isMountedRef.current) return;
        if (err.code === err.PERMISSION_DENIED) setError(formatGeoError(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude,
          timestamp: pos.timestamp, accuracy: pos.coords.accuracy });
      },
      (err) => { if (isMountedRef.current) setError(formatGeoError(err)); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  // ── Détection des villes (basée uniquement sur le temps) ────────────────────

  const updateCity = useCallback(async (point: GeoPoint) => {
    const now = Date.now();
    if (now - lastCityCheckRef.current < CITY_CHECK_INTERVAL) return;
    lastCityCheckRef.current = now;

    const cityName = await reverseGeocode(point.lat, point.lng);
    if (!cityName || !isMountedRef.current || !tripRef.current) return;

    setCurrentCity(cityName);
    const cities   = [...tripRef.current.citiesVisited];
    const lastCity = cities[cities.length - 1];

    if (!lastCity || lastCity.name !== cityName) {
      if (lastCity && !lastCity.exitedAt) {
        cities[cities.length - 1] = { ...lastCity, exitedAt: now };
      }
      cities.push({ name: cityName, enteredAt: now });
      const updated = { ...tripRef.current, citiesVisited: cities };
      tripRef.current = updated;
      setCurrentTrip({ ...updated });
      saveTrip(updated);
    }
  }, []);

  // Ref pour accéder à updateCity depuis le closure de visibilitychange
  const updateCityFn = useRef(updateCity);
  useEffect(() => { updateCityFn.current = updateCity; }, [updateCity]);

  // ── Callback watchPosition ──────────────────────────────────────────────────

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      const newPoint: GeoPoint = {
        lat: latitude, lng: longitude,
        timestamp: position.timestamp, accuracy,
      };

      if (isMountedRef.current) {
        setUserLocation(newPoint);
        setGpsPaused(false);
      }

      if (!tripRef.current) return;

      const points    = tripRef.current.points;
      const lastPoint = points[points.length - 1];

      if (lastPoint) {
        const dist    = haversineDistance(lastPoint, newPoint);
        const timeSec = (newPoint.timestamp - lastPoint.timestamp) / 1000;

        // Filtre saut GPS
        if (timeSec > 0 && (dist / timeSec) * 3600 > MAX_SPEED_KMH) return;
        // Filtre doublon
        if (dist < MIN_DISTANCE_FOR_POINT) return;
      }

      const newPoints  = [...points, newPoint];
      const distanceKm = calculateTotalDistance(newPoints);
      const indemnite  = calculateIndemnite(distanceKm);

      const updatedTrip: Trip = {
        ...tripRef.current, points: newPoints, distanceKm, indemnite,
      };
      tripRef.current = updatedTrip;
      setCurrentTrip({ ...updatedTrip });
      saveTrip(updatedTrip);
      updateCity(newPoint);
    },
    [updateCity]
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (!isMountedRef.current || err.code === err.TIMEOUT) return;
    setError(formatGeoError(err));
  }, []);

  // Refs synchronisées pour closures
  useEffect(() => { handlePositionRef.current = handlePosition; }, [handlePosition]);
  useEffect(() => { handleErrorRef.current   = handleError;    }, [handleError]);

  // ── Relancer watchPosition ─────────────────────────────────────────────────

  const restartWatchPosition = useCallback(() => {
    if (!navigator.geolocation || !handlePositionRef.current || !handleErrorRef.current) return;
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionRef.current, handleErrorRef.current,
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }, []);

  // ── Démarrer le trajet ──────────────────────────────────────────────────────

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }
    setError(null);
    setGpsPaused(false);
    lastPointBeforeBgRef.current = null;

    const tripId    = generateId();
    const startTime = Date.now();
    const newTrip: Trip = {
      id: tripId, startTime,
      points: [], citiesVisited: [],
      distanceKm: 0, indemnite: 0, status: 'active',
    };

    tripRef.current = newTrip;
    lastCityCheckRef.current = 0;
    setCurrentTrip(newTrip);
    setIsTracking(true);
    doAcquireWakeLock();

    // Position de départ — stockée immédiatement
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!isMountedRef.current) return;
        const startPoint: GeoPoint = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          timestamp: pos.timestamp, accuracy: pos.coords.accuracy,
        };
        setUserLocation(startPoint);

        if (tripRef.current) {
          const withPoint = { ...tripRef.current, points: [startPoint] };
          tripRef.current = withPoint;
          setCurrentTrip({ ...withPoint });
          saveTrip(withPoint);
        }

        // Ville de départ
        lastCityCheckRef.current = Date.now();
        const cityName = await reverseGeocode(startPoint.lat, startPoint.lng);
        if (cityName && tripRef.current && isMountedRef.current) {
          const withCity = {
            ...tripRef.current,
            citiesVisited: [{ name: cityName, enteredAt: startTime }],
          };
          tripRef.current = withCity;
          setCurrentTrip({ ...withCity });
          setCurrentCity(cityName);
          saveTrip(withCity);
        }
      },
      (err) => handleError(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 0,
    });

    saveTrip(newTrip);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePosition, handleError]);

  // ── Arrêter le trajet ───────────────────────────────────────────────────────

  const stopTracking = useCallback(async (): Promise<Trip | null> => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setGpsPaused(false);
    doReleaseWakeLock();

    if (!tripRef.current) return null;

    const endTime    = Date.now();
    const firstPoint = tripRef.current.points[0];
    let   lastPoint  = tripRef.current.points[tripRef.current.points.length - 1];

    // ── Map matching : coller les points GPS aux routes (OSRM) ─────────────
    let finalPoints = tripRef.current.points;
    if (finalPoints.length >= 2) {
      const snapped = await snapToRoads(finalPoints);
      if (snapped && snapped.length >= 2) {
        finalPoints = snapped;
        lastPoint   = snapped[snapped.length - 1];
      }
    }
    const finalDistanceKm = calculateTotalDistance(finalPoints);
    const finalIndemnite  = calculateIndemnite(finalDistanceKm);

    // ── Villes ────────────────────────────────────────────────────────────
    let cities = tripRef.current.citiesVisited.map((city, idx, arr) =>
      idx === arr.length - 1 && !city.exitedAt ? { ...city, exitedAt: endTime } : city
    );

    // Garantir la ville d'arrivée
    if (lastPoint) {
      const endCity = await reverseGeocode(lastPoint.lat, lastPoint.lng);
      if (endCity) {
        if (cities.length === 0) {
          cities = [{ name: endCity, enteredAt: tripRef.current.startTime, exitedAt: endTime }];
        } else {
          const last = cities[cities.length - 1];
          if (last.name !== endCity) {
            cities[cities.length - 1] = { ...last, exitedAt: endTime };
            cities.push({ name: endCity, enteredAt: last.exitedAt ?? endTime, exitedAt: endTime });
          }
        }
      }
    }

    // ── Adresses ──────────────────────────────────────────────────────────
    const [startAddress, endAddress] = await Promise.all([
      firstPoint ? getAddress(firstPoint.lat, firstPoint.lng) : Promise.resolve(null),
      lastPoint  ? getAddress(lastPoint.lat,  lastPoint.lng)  : Promise.resolve(null),
    ]);

    const completedTrip: Trip = {
      ...tripRef.current,
      points:       finalPoints,
      distanceKm:   finalDistanceKm,
      indemnite:    finalIndemnite,
      endTime,
      durationMs:   endTime - tripRef.current.startTime,
      citiesVisited: cities,
      status:       'completed',
      startAddress: startAddress ?? undefined,
      endAddress:   endAddress   ?? undefined,
    };

    tripRef.current = completedTrip;
    setCurrentTrip(completedTrip);
    saveTrip(completedTrip);
    setCurrentCity(null);
    return completedTrip;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isTracking, currentTrip, currentCity, userLocation,
    error, hasWakeLock, gpsPaused,
    startTracking, stopTracking, requestLocation,
  };
}
