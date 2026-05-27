'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Trip } from '@/types/trip';
import { useGeoTracking } from '@/hooks/useGeoTracking';
import LiveStats from '@/components/LiveStats';
import TripReport from '@/components/TripReport';
import TripHistory from '@/components/TripHistory';

// Chargement dynamique de la carte (no SSR — Leaflet utilise window)
const MapTracker = dynamic(() => import('@/components/MapTracker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
      <div className="text-gray-400 dark:text-gray-500 text-sm">Chargement de la carte...</div>
    </div>
  ),
});

type Tab = 'tracker' | 'history';

export default function Home() {
  const { isTracking, currentTrip, currentCity, userLocation, error, hasWakeLock, startTracking, stopTracking, requestLocation } =
    useGeoTracking();
  const [completedTrip, setCompletedTrip] = useState<Trip | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('tracker');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer pour les stats en temps réel
  useEffect(() => {
    if (isTracking && currentTrip) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - currentTrip.startTime);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsedTime(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTracking, currentTrip]);

  const handleToggleTracking = useCallback(async () => {
    if (isTracking) {
      setIsLoading(true);
      try {
        const trip = await stopTracking();
        if (trip) {
          setCompletedTrip(trip);
          setHistoryRefreshKey((k) => k + 1);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const handleCloseReport = () => setCompletedTrip(null);
  const handleNewTrip = () => { setCompletedTrip(null); setActiveTab('tracker'); };
  const handleSelectTrip = (trip: Trip) => setCompletedTrip(trip);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚗</span>
            <div>
              <h1 className="font-black text-gray-900 dark:text-white text-lg leading-none">
                IndemniteKM
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-none mt-0.5">
                0,45 € / km
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTracking && (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">EN COURS</span>
              </div>
            )}
            {isTracking && (
              <div title={hasWakeLock ? 'Écran maintenu allumé' : 'Gardez l\'écran allumé'}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${
                  hasWakeLock
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-amber-50 dark:bg-amber-900/20'
                }`}>
                {hasWakeLock ? '🔒' : '🔆'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Onglets */}
      <div className="max-w-lg mx-auto w-full px-4 pt-4">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex gap-1">
          {(['tracker', 'history'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'tracker' ? '🧭 Trajet' : '📋 Historique'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 pb-6 pt-4 flex flex-col gap-4">
        {activeTab === 'tracker' ? (
          <>
            {/* Carte — hauteur réduite pour laisser de la place aux contrôles */}
            <div className="h-44 sm:h-56 rounded-2xl overflow-hidden shadow-md">
              <MapTracker
                points={currentTrip?.points ?? []}
                userLocation={userLocation}
                isTracking={isTracking}
              />
            </div>

            {/* Erreur GPS */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-3 flex items-start gap-3">
                <span className="text-red-500 shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
                <button
                  onClick={requestLocation}
                  className="text-xs text-red-600 dark:text-red-400 underline shrink-0"
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Bannière fond de tâche (iOS uniquement quand wake lock indisponible) */}
            {isTracking && !hasWakeLock && (
              <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 flex items-center gap-2">
                <span className="text-lg shrink-0">📱</span>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Gardez l&apos;écran allumé</strong> pendant le trajet — le GPS s&apos;arrête si l&apos;écran s&apos;éteint.
                </p>
              </div>
            )}

            {/* Stats en temps réel */}
            {isTracking && currentTrip && (
              <LiveStats
                trip={{ ...currentTrip, durationMs: elapsedTime }}
                currentCity={currentCity}
              />
            )}

            {/* Bouton démarrer/arrêter */}
            <button
              onClick={handleToggleTracking}
              disabled={isLoading}
              className={`w-full py-5 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${
                isTracking
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/40 hover:from-red-600 hover:to-red-700'
                  : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/40 hover:from-blue-600 hover:to-blue-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Finalisation...
                </span>
              ) : isTracking ? (
                '⏹ Terminer le trajet'
              ) : (
                '▶ Démarrer le trajet'
              )}
            </button>

            {/* Message d'aide */}
            {!isTracking && !currentTrip && (
              <p className="text-center text-gray-400 dark:text-gray-500 text-sm">
                Appuyez sur démarrer pour enregistrer votre trajet<br />
                <span className="text-xs text-gray-300 dark:text-gray-600">⚡ Gardez le GPS activé sur votre téléphone</span>
              </p>
            )}

            {/* Info tarifaire */}
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-lg shrink-0">💡</span>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Taux appliqué : <strong>0,45 € par kilomètre</strong> — barème remboursement frais professionnels
              </p>
            </div>
          </>
        ) : (
          <TripHistory refreshKey={historyRefreshKey} onSelectTrip={handleSelectTrip} />
        )}
      </div>

      {/* Modal rapport de trajet */}
      {completedTrip && (
        <TripReport trip={completedTrip} onClose={handleCloseReport} onNewTrip={handleNewTrip} />
      )}
    </main>
  );
}
