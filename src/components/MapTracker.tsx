'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@/types/trip';

interface MapTrackerProps {
  points: GeoPoint[];
  userLocation: GeoPoint | null; // Position GPS courante (hors trajet aussi)
  isTracking: boolean;
}

export default function MapTracker({ points, userLocation, isTracking }: MapTrackerProps) {
  const mapRef          = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startMarkerRef  = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialiser la carte une seule fois ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      if (!mapRef.current) return;

      // Fix icônes Leaflet avec Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: [43.4832, -1.5586], // Centre par défaut (Pays Basque)
        zoom: 13,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Afficher la position GPS courante (avec ou sans trajet actif) ────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !userLocation) return;

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current;
      const latlng: [number, number] = [userLocation.lat, userLocation.lng];

      const icon = L.divIcon({
        html: `
          <div style="position:relative;width:24px;height:24px;">
            ${isTracking ? `
            <div style="
              position:absolute;inset:-8px;
              border-radius:50%;
              background:rgba(59,130,246,0.2);
              animation:gps-ring 1.5s ease-out infinite;
            "></div>` : ''}
            <div style="
              width:24px;height:24px;
              background:${isTracking ? '#3B82F6' : '#64748b'};
              border:3px solid white;
              border-radius:50%;
              box-shadow:0 2px 8px rgba(0,0,0,0.35);
            "></div>
          </div>
          <style>
            @keyframes gps-ring {
              0%   { transform:scale(0.5); opacity:1; }
              100% { transform:scale(2.2); opacity:0; }
            }
          </style>
        `,
        iconSize:   [24, 24],
        iconAnchor: [12, 12],
        className:  '',
      });

      if (currentMarkerRef.current) {
        currentMarkerRef.current.setLatLng(latlng);
        currentMarkerRef.current.setIcon(icon);
      } else {
        currentMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
      }

      // Centre sur la position uniquement s'il n'y a pas encore de points de trajet
      if (points.length === 0) {
        map.setView(latlng, Math.max(map.getZoom(), 15));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, mapReady, isTracking]);

  // ── Mettre à jour la polyline du trajet ──────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || points.length === 0) return;

    import('leaflet').then((L) => {
      const map    = mapInstanceRef.current;
      const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);

      // Polyline
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latLngs);
      } else {
        polylineRef.current = L.polyline(latLngs, {
          color: '#3B82F6', weight: 5, opacity: 0.85, lineJoin: 'round',
        }).addTo(map);
      }

      // Marqueur de départ (vert)
      if (!startMarkerRef.current) {
        const startIcon = L.divIcon({
          html: `<div style="
            width:14px;height:14px;
            background:#22c55e;border:3px solid white;
            border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7], className: '',
        });
        startMarkerRef.current = L.marker(latLngs[0], { icon: startIcon })
          .addTo(map)
          .bindPopup('🟢 Départ');
      }

      // Centre sur le dernier point
      const lastLatLng = latLngs[latLngs.length - 1];
      map.setView(lastLatLng, Math.max(map.getZoom(), 15));
    });
  }, [points, mapReady]);

  // ── Nettoyer le tracé quand le trajet se termine ─────────────────────────────
  useEffect(() => {
    if (isTracking || points.length > 0) return;
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
  }, [isTracking, points]);

  return (
    <div ref={mapRef} className="w-full h-full" />
  );
}
