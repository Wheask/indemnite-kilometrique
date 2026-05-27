'use client';

import type { Trip } from '@/types/trip';
import {
  formatDuration,
  formatDistance,
  formatIndemnite,
  formatDateTime,
  formatTime,
  INDEMNITE_PAR_KM,
} from '@/lib/tripCalculations';

interface TripReportProps {
  trip: Trip;
  onClose: () => void;
  onNewTrip: () => void;
}

export default function TripReport({ trip, onClose, onNewTrip }: TripReportProps) {
  const duration = trip.durationMs ? formatDuration(trip.durationMs) : '—';
  const distance = formatDistance(trip.distanceKm);
  const indemnite = formatIndemnite(trip.indemnite);
  const startTime = formatDateTime(trip.startTime);
  const endTime = trip.endTime ? formatDateTime(trip.endTime) : '—';

  const handleExportCSV = () => {
    const lines = [
      ['Trajet du', startTime],
      ['Distance', distance],
      ['Durée', duration],
      [`Indemnité (${INDEMNITE_PAR_KM} €/km)`, indemnite],
      [],
      ['Villes traversées', 'Entrée', 'Sortie'],
      ...trip.citiesVisited.map((c) => [
        c.name,
        formatTime(c.enteredAt),
        c.exitedAt ? formatTime(c.exitedAt) : 'Fin du trajet',
      ]),
    ];

    const csv = lines.map((row) => row.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajet_${trip.startTime}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-t-3xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">🎯 Rapport de trajet</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-green-100 text-sm">{startTime}</p>

          {/* Résumé financier */}
          <div className="mt-4 bg-white/20 rounded-2xl p-4 text-center">
            <p className="text-green-100 text-sm mb-1">Indemnité kilométrique</p>
            <p className="text-4xl font-black">{indemnite}</p>
            <p className="text-green-100 text-sm mt-1">
              {trip.distanceKm.toFixed(2)} km × {INDEMNITE_PAR_KM} €
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6 space-y-4">
          {/* Métriques principales */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{distance}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Distance</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{duration}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Durée</p>
            </div>
          </div>

          {/* Horaires */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">🕐 Départ</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{startTime}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">🕐 Arrivée</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{endTime}</span>
            </div>
          </div>

          {/* Adresses de départ/arrivée */}
          {(trip.startAddress || trip.endAddress) && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-2">
              {trip.startAddress && (
                <div className="text-sm">
                  <span className="text-green-600 dark:text-green-400 font-medium">📍 Départ</span>
                  <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 line-clamp-2">
                    {trip.startAddress}
                  </p>
                </div>
              )}
              {trip.startAddress && trip.endAddress && (
                <div className="border-t border-gray-200 dark:border-gray-700" />
              )}
              {trip.endAddress && (
                <div className="text-sm">
                  <span className="text-red-500 dark:text-red-400 font-medium">🏁 Arrivée</span>
                  <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 line-clamp-2">
                    {trip.endAddress}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Villes traversées */}
          {trip.citiesVisited.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2 text-sm flex items-center gap-2">
                🏙️ Villes traversées
                <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs px-2 py-0.5 rounded-full">
                  {trip.citiesVisited.length}
                </span>
              </h3>
              <div className="space-y-2">
                {trip.citiesVisited.map((city, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {idx === 0 ? '🟢' : idx === trip.citiesVisited.length - 1 ? '🔴' : '🔵'}
                      </span>
                      <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                        {city.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                      <div>{formatTime(city.enteredAt)}</div>
                      {city.exitedAt && (
                        <div>→ {formatTime(city.exitedAt)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Points GPS enregistrés */}
          <div className="text-center text-xs text-gray-400 dark:text-gray-600">
            {trip.points.length} points GPS enregistrés
          </div>

          {/* Boutons d'action */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleExportCSV}
              className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-3 px-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              📥 Exporter en CSV
            </button>
            <button
              onClick={onNewTrip}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              🚀 Nouveau trajet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
