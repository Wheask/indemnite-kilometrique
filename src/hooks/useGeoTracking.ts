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

const MIN_DISTANCE_FOR_POINT = 0.01; // km — 10m entre deux points
const CITY_CHECK_INTERVAL = 15000;   // ms — vérifier la ville toutes les 15s
const CITY_CHANGE_THRESHOLD = 2;     // km — distance pour changer de ville

// Types pour Wake Lock (non inclus dans tous les DOM lib TypeScript)
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
  userLocation: GeoPoint | null;   // Position GPS courante (même hors trajet)
  error: string | null;
  hasWakeLock: boolean;
  startTracking: () => void;
  stopTracking: () => Promise<Trip | null>;
  requestLocation: () => void;     // Demander permission GPS sans démarrer
}

export function useGeoTracking(): UseGeoTrackingReturn {
  const [isTracking, setIsTracking]       = useState(false);
  const [currentTrip, setCurrentTrip]     = useState<Trip | null>(null);
  const [currentCity, setCurrentCity]     = useState<string | null>(null);
  const [userLocation, setUserLocation]   = useState<GeoPoint | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [hasWakeLock, setHasWakeLock]     = useState(false);

  const watchIdRef             = useRef<number | null>(null);
  const tripRef                = useRef<Trip | null>(null);
  const lastCityCheckRef       = useRef<number>(0);
  const lastCityPositionRef    = useRef<GeoPoint | null>(null);
  const isMountedRef           = useRef(true);
  const wakeLockRef            = useRef<WakeLockSentinel | null>(null);
  const isTrackingRef          = useRef(false);  // Ref pour closure dans visibilitychange

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    // Pré-demande la permission GPS dès le chargement de la page
    requestLocationSilently();
    return () => {
      isMountedRef.current = false;
      doReleaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Réacquiert le Wake Lock si la page redevient visible (ex: retour depuis autre app)
  useEffect(() => {
    isTrackingRef.current = isTracking;
    const onVisibility = async () => {
      if (document.visibilityState === 'visible' && isTrackingRef.current) {
        await doAcquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isTracking]);

  // ── Wake Lock ───────────────────────────────────────────────────────────────

  const doAcquireWakeLock = async () => {
    const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
    if (!nav.wakeLock) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        if (isMountedRef.current) setHasWakeLock(false);
      });
      if (isMountedRef.current) setHasWakeLock(true);
    } catch {
      // Wake Lock non disponible (iOS < 16.4, page en arrière-plan, etc.)
    }
  };

  const doReleaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
    if (isMountedRef.current) setHasWakeLock(false);
  };

  // ── GPS ────────────────────────────────────────────────────────────────────

  const formatGeoError = (err: GeolocationPositionError): string => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return 'Permission GPS refusée. Activez la géolocalisation dans les réglages de votre navigateur.';
      case err.POSITION_UNAVAILABLE:
        return 'Position GPS indisponible. Vérifiez que le GPS est activé.';
      case err.TIMEOUT:
        return 'Délai GPS dépassé — relance en cours...';
      default:
        return 'Erreur GPS inconnue.';
    }
  };

  /** Demande la position GPS sans démarrer de trajet (pré-chauffe permission + affiche position sur carte) */
  const requestLocationSilently = () => {
    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
        });
        setError(null);
      },
      (err) => {
        if (!isMountedRef.current) return;
        // PERMISSION_DENIED uniquement → afficher l'erreur
        if (err.code === err.PERMISSION_DENIED) {
          setError(formatGeoError(err));
        }
        // Les autres erreurs (indisponible, timeout) sont ignorées au pré-chargement
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  /** Version publique — déclenchée depuis le bouton ou manuellement */
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (!isMountedRef.current) return;
        setError(formatGeoError(err));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  // ── Détection des villes ────────────────────────────────────────────────────

  const updateCityIfNeeded = useCallback(async (point: GeoPoint) => {
    const now = Date.now();
    if (now - lastCityCheckRef.current < CITY_CHECK_INTERVAL) return;
    if (lastCityPositionRef.current) {
      const dist = haversineDistance(lastCityPositionRef.current, point);
      if (dist < CITY_CHANGE_THRESHOLD) return;
    }
    lastCityCheckRef.current = now;
    lastCityPositionRef.current = point;

    const cityName = await reverseGeocode(point.lat, point.lng);
    if (!cityName || !isMountedRef.current) return;

    setCurrentCity(cityName);
    if (!tripRef.current) return;

    const cities = [...tripRef.current.citiesVisited];
    const lastCity = cities[cities.length - 1];
    if (!lastCity || lastCity.name !== cityName) {
      if (lastCity && !lastCity.exitedAt) {
        cities[cities.length - 1] = { ...lastCity, exitedAt: now };
      }
      cities.push({ name: cityName, enteredAt: now });
      const updatedTrip = { ...tripRef.current, citiesVisited: cities };
      tripRef.current = updatedTrip;
      setCurrentTrip({ ...updatedTrip });
      saveTrip(updatedTrip);
    }
  }, []);

  // ── Callback watchPosition ──────────────────────────────────────────────────

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;

      const newPoint: GeoPoint = {
        lat: latitude,
        lng: longitude,
        timestamp: position.timestamp,
        accuracy,
      };

      // Toujours mettre à jour la position visible sur la carte
      if (isMountedRef.current) setUserLocation(newPoint);

      if (!tripRef.current) return;

      const points   = tripRef.current.points;
      const lastPoint = points[points.length - 1];

      // Filtre anti-doublon : minimum 10 m entre deux points
      if (lastPoint && haversineDistance(lastPoint, newPoint) < MIN_DISTANCE_FOR_POINT) return;

      const newPoints  = [...points, newPoint];
      const distanceKm = calculateTotalDistance(newPoints);
      const indemnite  = calculateIndemnite(distanceKm);

      const updatedTrip: Trip = {
        ...tripRef.current,
        points: newPoints,
        distanceKm,
        indemnite,
      };

      tripRef.current = updatedTrip;
      setCurrentTrip({ ...updatedTrip });
      saveTrip(updatedTrip);
      updateCityIfNeeded(newPoint);
    },
    [updateCityIfNeeded]
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (!isMountedRef.current) return;
    // Ne pas afficher les timeouts (non bloquants pour watchPosition)
    if (err.code === err.TIMEOUT) return;
    setError(formatGeoError(err));
  }, []);

  // ── Démarrer le trajet ──────────────────────────────────────────────────────

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }
    setError(null);

    const tripId    = generateId();
    const startTime = Date.now();
    const newTrip: Trip = {
      id: tripId, startTime,
      points: [], citiesVisited: [],
      distanceKm: 0, indemnite: 0, status: 'active',
    };

    tripRef.current = newTrip;
    setCurrentTrip(newTrip);
    setIsTracking(true);
    lastCityCheckRef.current    = 0;
    lastCityPositionRef.current = null;

    // Wake Lock — empêche l'écran de s'éteindre (sans toucher à l'audio)
    doAcquireWakeLock();

    // Position de départ (stockée IMMÉDIATEMENT, pas conditionnée à la ville)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!isMountedRef.current) return;
        const startPoint: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
        };
        setUserLocation(startPoint);

        // Stocker le point de départ sans attendre la ville
        if (tripRef.current) {
          const withPoint: Trip = { ...tripRef.current, points: [startPoint] };
          tripRef.current = withPoint;
          setCurrentTrip({ ...withPoint });
          saveTrip(withPoint);
        }

        // Chercher la ville en parallèle (ne bloque pas l'affichage)
        const cityName = await reverseGeocode(startPoint.lat, startPoint.lng);
        if (cityName && tripRef.current && isMountedRef.current) {
          const withCity: Trip = {
            ...tripRef.current,
            citiesVisited: [{ name: cityName, enteredAt: startTime }],
          };
          tripRef.current = withCity;
          setCurrentTrip({ ...withCity });
          setCurrentCity(cityName);
          saveTrip(withCity);
          lastCityCheckRef.current    = Date.now();
          lastCityPositionRef.current = startPoint;
        }
      },
      (err) => handleError(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    // Suivi continu
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
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
    doReleaseWakeLock();

    if (!tripRef.current) return null;

    const endTime   = Date.now();
    const firstPoint = tripRef.current.points[0];
    const lastPoint  = tripRef.current.points[tripRef.current.points.length - 1];

    const cities = tripRef.current.citiesVisited.map((city, idx, arr) =>
      idx === arr.length - 1 && !city.exitedAt ? { ...city, exitedAt: endTime } : city
    );

    // Adresses de départ / arrivée en parallèle
    const [startAddress, endAddress] = await Promise.all([
      firstPoint ? getAddress(firstPoint.lat, firstPoint.lng) : Promise.resolve(null),
      lastPoint  ? getAddress(lastPoint.lat, lastPoint.lng)   : Promise.resolve(null),
    ]);

    const completedTrip: Trip = {
      ...tripRef.current,
      endTime,
      durationMs: endTime - tripRef.current.startTime,
      citiesVisited: cities,
      status: 'completed',
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

  return { isTracking, currentTrip, currentCity, userLocation, error, hasWakeLock, startTracking, stopTracking, requestLocation };
}
