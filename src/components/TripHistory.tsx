'use client';

import { useState, useEffect } from 'react';
import type { Trip } from '@/types/trip';
import {
  loadTrips,
  deleteTrip,
  formatDistance,
  formatIndemnite,
  formatDateTime,
  formatDuration,
} from '@/lib/tripCalculations';

interface TripHistoryProps {
  refreshKey: number;
  onSelectTrip: (trip: Trip) => void;
}

export default function TripHistory({ refreshKey, onSelectTrip }: TripHistoryProps) {
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    setTrips(loadTrips().filter((t) => t.status === 'completed'));
  }, [refreshKey]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Supprimer ce trajet ?')) {
      deleteTrip(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const totalIndemnite = trips.reduce((sum, t) => sum + t.indemnite, 0);
  const totalDistance = trips.reduce((sum, t) => sum + t.distanceKm, 0);

  if (trips.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🗺️</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Aucun trajet enregistré pour le moment
        </p>
        <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
          Démarrez votre premier trajet ci-dessus
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Récapitulatif global */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
        <h3 className="font-bold text-sm mb-3 opacity-90">📊 Récapitulatif total</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-black">{trips.length}</p>
            <p className="text-xs opacity-75">trajets</p>
          </div>
          <div>
            <p className="text-xl font-black">{formatDistance(totalDistance)}</p>
            <p className="text-xs opacity-75">parcourus</p>
          </div>
          <div>
            <p className="text-xl font-black">{formatIndemnite(totalIndemnite)}</p>
            <p className="text-xs opacity-75">total</p>
          </div>
        </div>
      </div>

      {/* Liste des trajets */}
      <div className="space-y-2">
        {trips.map((trip) => (
          <div
            key={trip.id}
            onClick={() => onSelectTrip(trip)}
            className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                  {formatDateTime(trip.startTime)}
                </p>
                {/* Villes */}
                {trip.citiesVisited.length > 0 && (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {trip.citiesVisited.length === 1
                      ? trip.citiesVisited[0].name
                      : `${trip.citiesVisited[0].name} → ${trip.citiesVisited[trip.citiesVisited.length - 1].name}`}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    📍 {formatDistance(trip.distanceKm)}
                  </span>
                  {trip.durationMs && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      ⏱ {formatDuration(trip.durationMs)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <div className="text-right">
                  <p className="text-lg font-black text-green-600 dark:text-green-400">
                    {formatIndemnite(trip.indemnite)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(trip.id, e)}
                  className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-400 hover:text-red-600 flex items-center justify-center transition-colors text-xs"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
