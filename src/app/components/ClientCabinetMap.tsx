import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sub?: string;
  color: 'amber' | 'rose' | 'emerald' | 'gray' | 'sky';
  initials?: string;
};

const COLOR_HEX: Record<MapMarker['color'], string> = {
  amber: '#f59e0b',
  rose: '#f43f5e',
  emerald: '#10b981',
  gray: '#111827',
  sky: '#0ea5e9',
};

function makeIcon(m: MapMarker) {
  const hex = COLOR_HEX[m.color];
  const inner = m.initials
    ? `<div style="color:white;font:600 11px/1 system-ui;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${m.initials}</div>`
    : `<div style="width:10px;height:10px;border-radius:50%;background:white"></div>`;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:linear-gradient(135deg, ${hex}, ${hex}dd);
      border:3px solid white;box-shadow:0 4px 14px rgba(0,0,0,.18);
      display:flex;align-items:center;justify-content:center;
      transition:transform .25s;
    ">${inner}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

interface Props {
  height?: number;
  markers: MapMarker[];
  route?: { from: string; to: string };
  center?: [number, number];
  zoom?: number;
}

export function ClientCabinetMap({ height = 280, markers, route, center, zoom = 12 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const fallbackCenter: [number, number] = center || (markers[0] ? [markers[0].lat, markers[0].lng] : [43.238949, 76.889709]);
    const map = L.map(containerRef.current, {
      center: fallbackCenter,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
      polylineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    markers.forEach(m => {
      seen.add(m.id);
      const tooltip = `<div style="font:500 11px system-ui;color:#111">${m.label}</div>${m.sub ? `<div style="font:10px system-ui;color:#6b7280;margin-top:2px">${m.sub}</div>` : ''}`;
      const existing = markersRef.current[m.id];
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        existing.setIcon(makeIcon(m));
        existing.bindTooltip(tooltip, { direction: 'top', offset: [0, -16], opacity: 1 });
      } else {
        const marker = L.marker([m.lat, m.lng], { icon: makeIcon(m) }).addTo(map);
        marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -16], opacity: 1 });
        markersRef.current[m.id] = marker;
      }
    });
    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    if (route) {
      const a = markers.find(m => m.id === route.from);
      const b = markers.find(m => m.id === route.to);
      if (a && b) {
        const latlngs: L.LatLngExpression[] = [[a.lat, a.lng], [b.lat, b.lng]];
        if (polylineRef.current) polylineRef.current.setLatLngs(latlngs);
        else polylineRef.current = L.polyline(latlngs, { color: '#f59e0b', weight: 3, dashArray: '6 6', opacity: 0.85 }).addTo(map);
      }
    } else if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
    }
  }, [markers, route]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-100" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 z-[400] flex items-center gap-1.5 bg-white rounded-lg shadow-sm px-2.5 py-1 text-[10px] text-gray-600 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 2GIS · Алматы · Live
      </div>
    </div>
  );
}
