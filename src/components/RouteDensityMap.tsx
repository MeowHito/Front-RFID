'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { pointAtKm, sliceByKm, densityColor, resolveCpKm } from '@/lib/routeGeometry';

export interface RouteMapSegment {
    /** Checkpoint the stretch starts at. */
    from: string;
    /** Checkpoint the stretch ends at. */
    to: string;
    /** Runners currently on this stretch. */
    count: number;
}

export interface RouteMapProps {
    /** [[lat, lng, cumulativeKm], ...] from the uploaded GPX. */
    coords: number[][];
    /** Total course length in km (last cumulative value). */
    distanceKm: number;
    /** Ordered checkpoint names for this category. */
    cpNames: string[];
    /** One entry per stretch between consecutive checkpoints (cpNames.length - 1). */
    segments: RouteMapSegment[];
    /** Admin-set km position of each checkpoint. Missing names fall back to an even spread. */
    checkpointMarks?: { name: string; km: number }[];
    th: boolean;
    height?: number;
    /** Fired with the index of the clicked stretch. */
    onPickSegment?: (index: number) => void;
}

export default function RouteDensityMap({
    coords, distanceKm, cpNames, segments, checkpointMarks, th, height = 380, onPickSegment,
}: RouteMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const layerRef = useRef<LayerGroup | null>(null);
    const [ready, setReady] = useState(false);
    // Latest props read by the draw effect, so the effect can depend on a cheap
    // content signature instead of array identities that change every render.
    const pickRef = useRef(onPickSegment);
    pickRef.current = onPickSegment;
    const dataRef = useRef({ coords, distanceKm, cpNames, segments, checkpointMarks, th });
    dataRef.current = { coords, distanceKm, cpNames, segments, checkpointMarks, th };

    // The page silently refreshes every 15s; redraw only when something really changed.
    const dataSig = JSON.stringify([
        coords.length, coords[0], coords[coords.length - 1], distanceKm,
        cpNames, segments, checkpointMarks, th,
    ]);

    // ── Create the map once ──
    useEffect(() => {
        let cancelled = false;
        let resizeObserver: ResizeObserver | null = null;

        (async () => {
            const L = (await import('leaflet')).default;
            if (cancelled || !containerRef.current || mapRef.current) return;

            const map = L.map(containerRef.current, {
                zoomControl: true,
                attributionControl: true,
                scrollWheelZoom: false, // don't hijack page scrolling
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap',
            }).addTo(map);
            map.setView([13.7563, 100.5018], 10); // placeholder until fitBounds runs

            mapRef.current = map;
            layerRef.current = L.layerGroup().addTo(map);
            setReady(true);

            // Leaflet mis-sizes itself if the container was still laying out.
            setTimeout(() => map.invalidateSize(), 60);
            if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
                resizeObserver = new ResizeObserver(() => map.invalidateSize());
                resizeObserver.observe(containerRef.current);
            }
        })();

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            mapRef.current?.remove();
            mapRef.current = null;
            layerRef.current = null;
        };
    }, []);

    // ── Redraw the course whenever the data changes ──
    useEffect(() => {
        if (!ready) return;
        let cancelled = false;

        (async () => {
            const L = (await import('leaflet')).default;
            const map = mapRef.current;
            const layer = layerRef.current;
            if (cancelled || !map || !layer) return;

            const { coords, distanceKm, cpNames, segments, checkpointMarks, th } = dataRef.current;

            layer.clearLayers();
            if (coords.length < 2) return;

            const latlngs = coords.map(c => [c[0], c[1]] as [number, number]);

            // Base line — the whole course, so unreached parts are still visible.
            L.polyline(latlngs, { color: '#94a3b8', weight: 3, opacity: 0.45 }).addTo(layer);

            const cpKm = resolveCpKm(cpNames, distanceKm, checkpointMarks);
            const maxCount = Math.max(...segments.map(s => s.count), 1);

            // Density overlay, one coloured stretch per checkpoint pair.
            segments.forEach((seg, i) => {
                const a = cpKm[i];
                const b = cpKm[i + 1];
                if (a === undefined || b === undefined) return;
                const part = sliceByKm(coords, a, b);
                if (part.length < 2) return;
                const ratio = seg.count / maxCount;
                const line = L.polyline(part, {
                    color: densityColor(seg.count, maxCount),
                    weight: seg.count > 0 ? 5 + Math.round(ratio * 5) : 3,
                    opacity: seg.count > 0 ? 0.95 : 0.5,
                    lineCap: 'round',
                });
                line.bindTooltip(
                    `<b>${seg.from} → ${seg.to}</b><br/>${th ? 'อยู่ในช่วงนี้' : 'On this stretch'}: <b>${seg.count}</b> ` +
                    `${th ? 'คน' : ''}<br/><span style="color:#64748b">${a.toFixed(1)}–${b.toFixed(1)} km</span>`,
                    { sticky: true },
                );
                if (seg.count > 0) {
                    line.on('click', () => pickRef.current?.(i));
                    line.on('mouseover', () => line.setStyle({ weight: 5 + Math.round(ratio * 5) + 4 }));
                    line.on('mouseout', () => line.setStyle({ weight: 5 + Math.round(ratio * 5) }));
                }
                line.addTo(layer);
            });

            // Checkpoint pins.
            cpNames.forEach((name, i) => {
                const km = cpKm[i];
                if (km === undefined) return;
                const [lat, lng] = pointAtKm(coords, km);
                const isEnd = i === 0 || i === cpNames.length - 1;
                L.circleMarker([lat, lng], {
                    radius: isEnd ? 8 : 6,
                    color: '#fff',
                    weight: 2,
                    fillColor: isEnd ? '#7c3aed' : '#0f172a',
                    fillOpacity: 1,
                }).bindTooltip(
                    `<b>${name}</b><br/><span style="color:#64748b">${km.toFixed(1)} km</span>`,
                    { direction: 'top', offset: [0, -6] },
                ).addTo(layer);
            });

            map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
        })();

        return () => { cancelled = true; };
    }, [ready, dataSig]);

    const hasMarks = (checkpointMarks?.length || 0) > 0;

    return (
        <div style={{ position: 'relative' }}>
            <div
                ref={containerRef}
                style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden', background: '#eef2f7', zIndex: 0 }}
            />
            {/* Legend */}
            <div style={{
                position: 'absolute', bottom: 10, left: 10, zIndex: 500,
                background: 'rgba(255,255,255,0.94)', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '7px 10px', fontSize: 10, fontWeight: 700, color: '#475569',
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            }}>
                <span>{th ? 'ความหนาแน่น' : 'Density'}</span>
                {[['#cbd5e1', th ? 'ไม่มี' : 'none'], ['#22c55e', th ? 'น้อย' : 'low'], ['#eab308', th ? 'ปานกลาง' : 'med'], ['#f97316', th ? 'มาก' : 'high'], ['#ef4444', th ? 'สูงสุด' : 'peak']].map(([c, l]) => (
                    <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 14, height: 4, borderRadius: 2, background: c, display: 'inline-block' }} />
                        {l}
                    </span>
                ))}
            </div>
            {!hasMarks && (
                <div style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 500, maxWidth: 260,
                    background: 'rgba(255,251,235,0.96)', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '6px 9px', fontSize: 10.5, color: '#92400e', lineHeight: 1.45,
                }}>
                    {th
                        ? '⚠️ ยังไม่ได้ระบุกิโลเมตรของแต่ละ CP — ระบบกระจายจุดให้เท่าๆ กันบนเส้นทาง ตั้งค่าได้ที่หน้าแก้ไขกิจกรรม'
                        : '⚠️ No km set per checkpoint — points are spread evenly. Set them on the event edit page.'}
                </div>
            )}
        </div>
    );
}
