'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GeoPoint, CityVisited, Trip } from '@/types/trip';
import {
  calculateTotalDistance,
  calculateIndemnite,
  generateId,
  saveTrip,
} from '@/lib/tripCalculations';
import { reverseGeocode, getAddress } from '@/lib/geocoding';
import { haversineDistance } from '@/lib/tripCalculations';

const MIN_ACCURACY = 50; // metres — ignore les points trop imprécis
const MIN_DISTANCE_FOR_POINT = 0.01; // km — 10m minimum entre deux points
const CITY_CHECK_INTERVAL = 15000; // ms — vérifier la ville toutes les 15s
const CITY_CHANGE_THRESHOLD = 2; // km — distance pour considérer un changement de ville

interface UseGeoTrackingReturn {
  isTracking: boolean;
  currentTrip: Trip | null;
  currentCity: string | null;
  error: string | null;
  startTracking: () => void;
  stopTracking: () => Promise<Trip | null>;
}

export function useGeoTracking(): UseGeoTrackingReturn {
  const [isTracking, setIsTracking] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const tripRef = useRef<Trip | null>(null);
  const lastCityCheckRef = useRef<number>(0);
  const lastCityPositionRef = useRef<GeoPoint | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateCityIfNeeded = useCallback(async (point: GeoPoint) => {
    const now = Date.now();
    if (now - lastCityCheckRef.current < CITY_CHECK_INTERVAL) return;

    // Vérifie si on s'est suffisamment éloigné du dernier check
    if (lastCityPositionRef.current) {
      const dist = haversineDistance(lastCityPositionRef.current, point);
      if (dist < CITY_CHANGE_THRESHOLD) return;
    }

    lastCityCheckRef.current = now;
    lastCityPositionRef.current = point;

    const cityName = await reverseGeocode(point.lat, point.lng);
    if (!cityName || !isMountedRef.current) return;

    setCurrentCity(cityName);

    // Met à jour les villes visitées dans le trajet
    if (!tripRef.current) return;
    const cities = [...tripRef.current.citiesVisited];
    const lastCity = cities[cities.length - 1];

    if (!lastCity || lastCity.name !== cityName) {
      // Ferme la ville précédente
      if (lastCity && !lastCity.exitedAt) {
        cities[cities.length - 1] = { ...lastCity, exitedAt: now };
      }
      // Ouvre la nouvelle ville
      cities.push({ name: cityName, enteredAt: now });

      const updatedTrip = { ...tripRef.current, citiesVisited: cities };
      tripRef.current = updatedTrip;
      setCurrentTrip({ ...updatedTrip });
      saveTrip(updatedTrip);
    }
  }, []);

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      if (!tripRef.current) return;

      const { latitude, longitude, accuracy } = position.coords;

      // Ignore les positions trop imprécises
      if (accuracy && accuracy > MIN_ACCURACY) return;

      const newPoint: GeoPoint = {
        lat: latitude,
        lng: longitude,
        timestamp: position.timestamp,
        accuracy,
      };

      const points = tripRef.current.points;
      const lastPoint = points[points.length - 1];

      // Vérifie qu'on s'est suffisamment déplacé
      if (lastPoint) {
        const dist = haversineDistance(lastPoint, newPoint);
        if (dist < MIN_DISTANCE_FOR_POINT) return;
      }

      const newPoints = [...points, newPoint];
      const distanceKm = calculateTotalDistance(newPoints);
      const indemnite = calculateIndemnite(distanceKm);

      const updatedTrip: Trip = {
        ...tripRef.current,
        points: newPoints,
        distanceKm,
        indemnite,
      };

      tripRef.current = updatedTrip;
      setCurrentTrip({ ...updatedTrip });
      saveTrip(updatedTrip);

      // Vérification asynchrone de la ville
      updateCityIfNeeded(newPoint);
    },
    [updateCityIfNeeded]
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setError('Permission GPS refusée. Veuillez autoriser la géolocalisation.');
        break;
      case err.POSITION_UNAVAILABLE:
        setError('Position GPS indisponible. Vérifiez que le GPS est activé.');
        break;
      case err.TIMEOUT:
        setError('Délai GPS dépassé. Nouvelle tentative en cours...');
        break;
      default:
        setError('Erreur GPS inconnue.');
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }

    setError(null);
    const tripId = generateId();
    const startTime = Date.now();

    const newTrip: Trip = {
      id: tripId,
      startTime,
      points: [],
      citiesVisited: [],
      distanceKm: 0,
      indemnite: 0,
      status: 'active',
    };

    tripRef.current = newTrip;
    setCurrentTrip(newTrip);
    setIsTracking(true);
    lastCityCheckRef.current = 0;
    lastCityPositionRef.current = null;

    // Démarrage initial : récupère la ville de départ
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const startPoint: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
        };

        const cityName = await reverseGeocode(startPoint.lat, startPoint.lng);
        if (cityName && tripRef.current) {
          const updatedTrip: Trip = {
            ...tripRef.current,
            points: [startPoint],
            citiesVisited: [{ name: cityName, enteredAt: startTime }],
          };
          tripRef.current = updatedTrip;
          setCurrentTrip({ ...updatedTrip });
          setCurrentCity(cityName);
          saveTrip(updatedTrip);
          lastCityCheckRef.current = Date.now();
          lastCityPositionRef.current = startPoint;
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Suivi continu
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000,
    });

    saveTrip(newTrip);
  }, [handlePosition, handleError]);

  const stopTracking = useCallback(async (): Promise<Trip | null> => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);

    if (!tripRef.current) return null;

    const endTime = Date.now();
    const lastPoint = tripRef.current.points[tripRef.current.points.length - 1];

    // Ferme la dernière ville visitée
    const cities = tripRef.current.citiesVisited.map((city, idx, arr) => {
      if (idx === arr.length - 1 && !city.exitedAt) {
        return { ...city, exitedAt: endTime };
      }
      return city;
    });

    // Récupère l'adresse de fin si possible
    let endAddress: string | undefined;
    if (lastPoint) {
      endAddress = (await getAddress(lastPoint.lat, lastPoint.lng)) ?? undefined;
    }

    // Récupère l'adresse de départ si possible
    const firstPoint = tripRef.current.points[0];
    let startAddress: string | undefined;
    if (firstPoint) {
      startAddress = (await getAddress(firstPoint.lat, firstPoint.lng)) ?? undefined;
    }

    const completedTrip: Trip = {
      ...tripRef.current,
      endTime,
      durationMs: endTime - tripRef.current.startTime,
      citiesVisited: cities,
      status: 'completed',
      // Stocke les adresses dans le trajet via des champs étendus
      ...(startAddress && { startAddress } as unknown as Partial<Trip>),
      ...(endAddress && { endAddress } as unknown as Partial<Trip>),
    };

    tripRef.current = completedTrip;
    setCurrentTrip(completedTrip);
    saveTrip(completedTrip);
    setCurrentCity(null);

    return completedTrip;
  }, []);

  return {
    isTracking,
    currentTrip,
    currentCity,
    error,
    startTracking,
    stopTracking,
  };
}
