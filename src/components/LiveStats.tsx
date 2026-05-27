'use client';

import type { Trip } from '@/types/trip';
import { formatDistance, formatIndemnite, formatDuration } from '@/lib/tripCalculations';

interface LiveStatsProps {
  trip: Trip;
  currentCity: string | null;
}

export default function LiveStats({ trip, currentCity }: LiveStatsProps) {
  const elapsed = Date.now() - trip.startTime;

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/25">
      {/* Ville actuelle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0" />
        <span className="text-sm font-medium truncate">
          {currentCity ? `📍 ${currentCity}` : '📡 Acquisition GPS...'}
        </span>
      </div>

      {/* Métriques en temps réel */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/15 rounded-xl p-3 text-center">
          <p className="text-2xl font-black leading-none">
            {formatDistance(trip.distanceKm)}
          </p>
          <p className="text-xs opacity-75 mt-1">Distance</p>
        </div>
        <div className="bg-white/15 rounded-xl p-3 text-center">
          <p className="text-2xl font-black leading-none">
            {formatDuration(elapsed)}
          </p>
          <p className="text-xs opacity-75 mt-1">Durée</p>
        </div>
        <div className="bg-white/15 rounded-xl p-3 text-center">
          <p className="text-2xl font-black leading-none text-green-300">
            {formatIndemnite(trip.indemnite)}
          </p>
          <p className="text-xs opacity-75 mt-1">Indemnité</p>
        </div>
      </div>

      {/* Villes traversées */}
      {trip.citiesVisited.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/20">
          <p className="text-xs opacity-75 mb-1">Trajet</p>
          <p className="text-sm font-medium truncate">
            {trip.citiesVisited.map((c) => c.name).join(' → ')}
          </p>
        </div>
      )}
    </div>
  );
}
