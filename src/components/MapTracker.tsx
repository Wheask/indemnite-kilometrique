'use client';

import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/types/trip';

interface MapTrackerProps {
  points: GeoPoint[];
  isTracking: boolean;
}

export default function MapTracker({ points, isTracking }: MapTrackerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startMarkerRef = useRef<any>(null);

  // Initialiser la carte
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Import dynamique de Leaflet (évite les erreurs SSR)
    import('leaflet').then((L) => {
      // Fix icônes Leaflet avec Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const defaultCenter: [number, number] = [43.4832, -1.5586]; // Pays Basque
      const map = L.map(mapRef.current!, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mettre à jour la polyline et le marqueur de position
  useEffect(() => {
    if (!mapInstanceRef.current || points.length === 0) return;

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current;
      const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      const lastPoint = latLngs[latLngs.length - 1];

      // Polyline du trajet
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latLngs);
      } else {
        polylineRef.current = L.polyline(latLngs, {
          color: '#3B82F6',
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(map);
      }

      // Marqueur de départ (vert)
      if (!startMarkerRef.current && latLngs.length > 0) {
        const startIcon = L.divIcon({
          html: `<div style="
            width: 16px; height: 16px;
            background: #22c55e;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          className: '',
        });
        startMarkerRef.current = L.marker(latLngs[0], { icon: startIcon })
          .addTo(map)
          .bindPopup('Départ');
      }

      // Marqueur de position actuelle (bleu pulsé)
      const currentIcon = L.divIcon({
        html: `<div style="
          width: 20px; height: 20px;
          background: #3B82F6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59,130,246,0.6);
          ${isTracking ? 'animation: pulse 1.5s infinite;' : ''}
        "></div>
        <style>
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.7); }
            70% { box-shadow: 0 0 0 10px rgba(59,130,246,0); }
            100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
          }
        </style>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: '',
      });

      if (markerRef.current) {
        markerRef.current.setLatLng(lastPoint);
        markerRef.current.setIcon(currentIcon);
      } else {
        markerRef.current = L.marker(lastPoint, { icon: currentIcon }).addTo(map);
      }

      // Centre la carte sur la position actuelle
      map.setView(lastPoint, Math.max(map.getZoom(), 15));
    });
  }, [points, isTracking]);

  // Nettoyer les marqueurs quand le tracking s'arrête
  useEffect(() => {
    if (!isTracking && points.length === 0 && mapInstanceRef.current) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
    }
  }, [isTracking, points]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-2xl overflow-hidden shadow-lg"
      style={{ minHeight: '300px' }}
    />
  );
}
