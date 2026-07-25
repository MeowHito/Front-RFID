'use client';

/**
 * 2D course profile: distance on X, elevation on Y, with the runners who are
 * currently out there drawn as little figures on the line (blue = male,
 * pink = female). Plain SVG rather than a chart library — the markers need exact
 * placement on the profile and de-overlapping, which is fiddly to bolt onto a
 * generic chart.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { elevationAtKm, elevationRange } from '@/lib/routeGeometry';

/** One figure on the profile: a leader, or a whole group of runners. */
export interface ProfileMarker {
    key: string;
    km: number;
    /** Drives the colour: male, female, or a mixed group. */
    gender: 'M' | 'F' | 'MIX';
    /** Rank number ("1") or group range ("1–10"), drawn next to the figure. */
    label: string;
    /** Runner name or "10 คน", drawn under the label. */
    sublabel?: string;
    tooltip?: string;
    onClick?: () => void;
}

interface Props {
    /** [[lat, lng, cumKm, ele?], ...] */
    coords: number[][];
    distanceKm: number;
    /** Checkpoint names with their km along the track, already resolved. */
    checkpoints: { name: string; km: number }[];
    markers: ProfileMarker[];
    th: boolean;
    height?: number;
}

const COLORS = {
    M: { fill: '#3b82f6', dark: '#1d4ed8', soft: '#dbeafe' },
    F: { fill: '#ec4899', dark: '#be185d', soft: '#fce7f3' },
    MIX: { fill: '#8b5cf6', dark: '#6d28d9', soft: '#ede9fe' },
};

const PAD = { top: 26, right: 18, bottom: 34, left: 46 };
/** Vertical step between two figures stacked on the same spot. */
const FIGURE_LIFT = 34;
/** Markers closer than this on X are stacked upwards instead of overlapping. */
const STACK_GAP_PX = 26;

/** A small stick figure — head plus body — centred on (0, 0) at its feet. */
function Figure({ color, dark }: { color: string; dark: string }) {
    return (
        <g>
            <circle cx={0} cy={-15.5} r={3.6} fill={color} stroke={dark} strokeWidth={0.8} />
            <path
                d="M0 -11.6 L0 -5 M0 -11.6 L-4 -8.4 M0 -11.6 L4 -8.4 M0 -5 L-3.4 0 M0 -5 L3.4 0"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
                fill="none"
            />
        </g>
    );
}

/** Round tick step (1, 2, 5, 10, …) giving roughly `target` ticks over `span`. */
function niceStep(span: number, target: number): number {
    if (span <= 0) return 1;
    const raw = span / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
}

export default function ElevationProfile2D({
    coords, distanceKm, checkpoints, markers, th, height = 340,
}: Props) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(900);
    const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

    // Track the container so the profile fills whatever space the card gives it.
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const measure = () => setWidth(Math.max(320, el.clientWidth));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const total = distanceKm > 0 ? distanceKm : (coords[coords.length - 1]?.[2] ?? 1);
    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const innerH = Math.max(1, height - PAD.top - PAD.bottom);

    const ele = elevationRange(coords);
    const hasEle = !!ele && ele.max > ele.min;
    // Pad the elevation band so the line never hugs the frame.
    const loRaw = hasEle ? ele!.min : 0;
    const hiRaw = hasEle ? ele!.max : 1;
    const padEle = Math.max(5, (hiRaw - loRaw) * 0.15);
    const lo = hasEle ? loRaw - padEle : 0;
    const hi = hasEle ? hiRaw + padEle : 1;

    const x = (km: number) => PAD.left + (Math.max(0, Math.min(total, km)) / (total || 1)) * innerW;
    const y = (m: number) => PAD.top + innerH - ((m - lo) / (hi - lo || 1)) * innerH;
    // Without elevation the profile degrades to a flat baseline, so the runner
    // figures are still usable.
    const yAt = (km: number) => {
        const e = hasEle ? elevationAtKm(coords, km) : null;
        return e === null ? PAD.top + innerH * 0.72 : y(e);
    };

    // ── Profile path ──
    const line: string[] = [];
    let lastPx = -Infinity;
    for (const c of coords) {
        const px = x(c[2]);
        // One point per pixel is plenty; keeps the path short on 2500-point tracks.
        if (px - lastPx < 1) continue;
        lastPx = px;
        const e = typeof c[3] === 'number' ? c[3] : null;
        line.push(`${line.length ? 'L' : 'M'}${px.toFixed(1)} ${(e === null ? PAD.top + innerH * 0.72 : y(e)).toFixed(1)}`);
    }
    if (line.length < 2) {
        const yFlat = (PAD.top + innerH * 0.72).toFixed(1);
        line.length = 0;
        line.push(`M${x(0).toFixed(1)} ${yFlat}`, `L${x(total).toFixed(1)} ${yFlat}`);
    }
    const linePath = line.join(' ');
    const areaPath = `${linePath} L${x(total).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

    // ── Axis ticks ──
    const kmStep = niceStep(total, Math.max(4, Math.floor(innerW / 110)));
    const kmTicks: number[] = [];
    for (let v = 0; v <= total + 1e-6; v += kmStep) kmTicks.push(+v.toFixed(3));
    if (kmTicks[kmTicks.length - 1] < total - kmStep * 0.35) kmTicks.push(+total.toFixed(1));

    const eleStep = niceStep(hi - lo, 4);
    const eleTicks: number[] = [];
    if (hasEle) {
        for (let v = Math.ceil(lo / eleStep) * eleStep; v <= hi; v += eleStep) eleTicks.push(Math.round(v));
    }

    // ── Place the figures ──
    // Runner positions come from checkpoints, so many markers land on the exact
    // same km. Group them into columns and stack upwards; whatever no longer fits
    // inside the frame collapses into a "+n" chip on top of its column.
    const columns = new Map<number, ProfileMarker[]>();
    for (const m of markers.slice().sort((a, b) => a.km - b.km)) {
        const key = Math.round(x(m.km) / STACK_GAP_PX);
        const col = columns.get(key);
        if (col) col.push(m); else columns.set(key, [m]);
    }
    const drawn: { marker: ProfileMarker; px: number; py: number; lift: number }[] = [];
    const overflow: { px: number; py: number; lift: number; count: number }[] = [];
    for (const col of columns.values()) {
        const py = yAt(col[0].km);
        const capacity = Math.max(1, Math.floor((py - PAD.top - 10) / FIGURE_LIFT) + 1);
        const shown = col.length > capacity ? col.slice(0, Math.max(1, capacity - 1)) : col;
        shown.forEach((marker, i) => drawn.push({ marker, px: x(marker.km), py, lift: i }));
        if (col.length > shown.length) {
            overflow.push({ px: x(col[0].km), py, lift: shown.length, count: col.length - shown.length });
        }
    }

    return (
        <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
            <svg
                width={width}
                height={height}
                style={{ display: 'block', overflow: 'visible' }}
                // The page refreshes every 15s and can swap the marker under the
                // cursor; dropping the tooltip on leave keeps it from sticking.
                onMouseLeave={() => setHover(null)}
            >
                <defs>
                    <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                    </linearGradient>
                </defs>

                {/* Horizontal grid + elevation axis */}
                {(hasEle ? eleTicks : []).map(t => (
                    <g key={`e${t}`}>
                        <line x1={PAD.left} y1={y(t)} x2={PAD.left + innerW} y2={y(t)} stroke="#f1f5f9" strokeWidth={1} />
                        <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{t}</text>
                    </g>
                ))}
                <text
                    x={PAD.left - 8}
                    y={PAD.top - 12}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={700}
                    fill="#cbd5e1"
                >
                    {hasEle ? (th ? 'ม.' : 'm') : ''}
                </text>

                {/* Profile */}
                <path d={areaPath} fill="url(#profileFill)" />
                <path d={linePath} fill="none" stroke="#7c3aed" strokeWidth={2} strokeLinejoin="round" />

                {/* Checkpoints */}
                {checkpoints.map((cp, i) => (
                    <g key={`${cp.name}-${i}`}>
                        <line
                            x1={x(cp.km)} y1={PAD.top - 6}
                            x2={x(cp.km)} y2={PAD.top + innerH}
                            stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 4"
                        />
                        <circle cx={x(cp.km)} cy={yAt(cp.km)} r={3.2} fill="#fff" stroke="#7c3aed" strokeWidth={2} />
                        <text
                            x={x(cp.km)}
                            y={PAD.top - 12}
                            textAnchor="middle"
                            fontSize={9.5}
                            fontWeight={800}
                            fill="#64748b"
                        >
                            {cp.name}
                        </text>
                    </g>
                ))}

                {/* Distance axis */}
                <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#e2e8f0" />
                {kmTicks.map(t => (
                    <g key={`k${t}`}>
                        <line x1={x(t)} y1={PAD.top + innerH} x2={x(t)} y2={PAD.top + innerH + 4} stroke="#cbd5e1" />
                        <text x={x(t)} y={PAD.top + innerH + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                            {t % 1 === 0 ? t : t.toFixed(1)}
                        </text>
                    </g>
                ))}
                <text
                    x={PAD.left + innerW}
                    y={PAD.top + innerH + 30}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={700}
                    fill="#cbd5e1"
                >
                    {th ? 'ระยะทาง (กม.)' : 'Distance (km)'}
                </text>

                {/* Runners */}
                {drawn.map(({ marker, px, py, lift }) => {
                    const c = COLORS[marker.gender];
                    const top = py - lift * FIGURE_LIFT;
                    const chipW = Math.max(16, marker.label.length * 6.6 + 8);
                    // Near the finish there is no room on the right, so the badge
                    // flips to the other side of the figure.
                    const chipX = px + chipW + 12 > width ? -(chipW + 7) : 7;
                    return (
                        <g
                            key={marker.key}
                            transform={`translate(${px}, ${top})`}
                            style={{ cursor: marker.onClick ? 'pointer' : 'default' }}
                            onClick={marker.onClick}
                            onMouseEnter={() => marker.tooltip && setHover({ x: px, y: top, text: marker.tooltip })}
                            onMouseLeave={() => setHover(null)}
                        >
                            {lift > 0 && (
                                <line x1={0} y1={0} x2={0} y2={lift * FIGURE_LIFT} stroke={c.fill} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
                            )}
                            <circle cx={0} cy={0} r={2.6} fill={c.dark} />
                            <Figure color={c.fill} dark={c.dark} />
                            <g transform={`translate(${chipX}, -20)`}>
                                <rect x={0} y={-8} width={chipW} height={13} rx={6.5} fill={c.fill} />
                                <text x={chipW / 2} y={1.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
                                    {marker.label}
                                </text>
                            </g>
                            {marker.sublabel && (
                                <text x={0} y={11} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={c.dark}>
                                    {marker.sublabel}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Whatever did not fit in a column */}
                {overflow.map((o, i) => (
                    <g key={`ov${i}`} transform={`translate(${o.px}, ${o.py - o.lift * FIGURE_LIFT})`}>
                        <rect x={-15} y={-12} width={30} height={14} rx={7} fill="#475569" />
                        <text x={0} y={-1.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
                            +{o.count}
                        </text>
                    </g>
                ))}
            </svg>

            {hover && (
                <div
                    style={{
                        position: 'absolute',
                        left: Math.min(Math.max(hover.x - 70, 0), Math.max(0, width - 150)),
                        top: Math.max(0, hover.y - 62),
                        width: 150,
                        background: '#0f172a',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '7px 10px',
                        fontSize: 11,
                        lineHeight: 1.5,
                        pointerEvents: 'none',
                        whiteSpace: 'pre-line',
                        boxShadow: '0 6px 20px rgba(15,23,42,0.25)',
                        zIndex: 5,
                    }}
                >
                    {hover.text}
                </div>
            )}
        </div>
    );
}
