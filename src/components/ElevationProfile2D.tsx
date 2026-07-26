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

/** One figure on the profile: a named leader, or a clump of runners. */
export interface ProfileMarker {
    key: string;
    km: number;
    /** Colour: male, female, or the amber used for a bunch of runners. */
    tone: 'M' | 'F' | 'GROUP';
    /** Rank ("#1") or head count ("≈12"), drawn beside the figure. */
    label: string;
    /** Bib, or "คน" under a group count. */
    sublabel?: string;
    /** Second line under the figure — the countdown to the next checkpoint. */
    note?: string;
    /** True while the position is a moving estimate rather than a scan point. */
    moving?: boolean;
    /** Draws a huddle of figures instead of one, for a group marker. */
    cluster?: boolean;
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
    /** Swaps the grid/axis greys for ones that read on a dark card. */
    dark?: boolean;
}

/** Grid, axis and checkpoint greys. The purple profile line works on both. */
const SKIN = {
    light: {
        grid: '#f1f5f9', axisText: '#94a3b8', axisLine: '#e2e8f0', tick: '#cbd5e1',
        unit: '#cbd5e1', cpLine: '#cbd5e1', cpText: '#64748b', cpDot: '#fff',
        overflow: '#475569', tooltipBg: '#0f172a',
    },
    dark: {
        grid: '#243044', axisText: '#8ea0b8', axisLine: '#334155', tick: '#475569',
        unit: '#475569', cpLine: '#475569', cpText: '#cbd5e1', cpDot: '#0f172a',
        overflow: '#94a3b8', tooltipBg: '#020617',
    },
};

const COLORS = {
    M: { fill: '#3b82f6', dark: '#1d4ed8', soft: '#dbeafe' },
    F: { fill: '#ec4899', dark: '#be185d', soft: '#fce7f3' },
    GROUP: { fill: '#f59e0b', dark: '#b45309', soft: '#fef3c7' },
};

const PAD = { top: 26, right: 18, bottom: 34, left: 46 };
/** Vertical step between two figures stacked on the same spot. */
const FIGURE_LIFT = 34;
/** Markers closer than this on X are stacked upwards instead of overlapping. */
const STACK_GAP_PX = 26;

/** Run-cycle timing. Slightly different per figure so a crowd is not in lockstep. */
const STRIDE_S = 0.62;

/**
 * A runner in mid-stride, standing on (0, 0) at the trailing foot: body leaning
 * into the run, one arm driving forward with the opposite knee up. Limbs live in
 * their own groups so `moving` can swing them around the shoulder and the hip —
 * a real run cycle rather than a rocking stick figure.
 */
function RunnerFigure({ color, dark, moving, phase = 0 }: {
    color: string;
    dark: string;
    moving?: boolean;
    /** Seconds to offset the cycle by, so neighbouring figures fall out of step. */
    phase?: number;
}) {
    const begin = `${(-phase).toFixed(2)}s`;
    const limb = {
        stroke: color,
        strokeWidth: 2.3,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        fill: 'none',
    };
    return (
        <g>
            {/* Whole body bobs with each stride */}
            {moving && (
                <animateTransform
                    attributeName="transform" type="translate"
                    values="0 0; 0 -1.3; 0 0; 0 -1.3; 0 0"
                    dur={`${STRIDE_S * 2}s`} begin={begin} repeatCount="indefinite"
                />
            )}
            {/* Head, set forward of the hips — that lean is what reads as "running" */}
            <circle cx={2.4} cy={-16.6} r={3.1} fill={color} stroke={dark} strokeWidth={0.7} />
            {/* Torso */}
            <path d="M2 -13.5 L-1.3 -6.6" {...limb} strokeWidth={2.7} />
            {/* Arms, bent at the elbow, swinging around the shoulder */}
            <g>
                {moving && (
                    <animateTransform
                        attributeName="transform" type="rotate"
                        values="-18 1.2 -12.7; 18 1.2 -12.7; -18 1.2 -12.7"
                        dur={`${STRIDE_S * 2}s`} begin={begin} repeatCount="indefinite"
                    />
                )}
                <path d="M1.2 -12.7 L5.2 -11.4 L6.1 -14.2" {...limb} />
                <path d="M1.2 -12.7 L-3.1 -11.3 L-4.9 -13.7" {...limb} />
            </g>
            {/* Legs, swinging around the hip in opposition to the arms */}
            <g>
                {moving && (
                    <animateTransform
                        attributeName="transform" type="rotate"
                        values="17 -1.3 -6.6; -17 -1.3 -6.6; 17 -1.3 -6.6"
                        dur={`${STRIDE_S * 2}s`} begin={begin} repeatCount="indefinite"
                    />
                )}
                {/* front leg: knee up, shin forward */}
                <path d="M-1.3 -6.6 L3 -4.6 L4.9 -1" {...limb} />
                {/* trailing leg: pushing off, heel kicking up */}
                <path d="M-1.3 -6.6 L-4.6 -3.4 L-6.2 0" {...limb} />
            </g>
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
    coords, distanceKm, checkpoints, markers, th, height = 340, dark = false,
}: Props) {
    const skin = dark ? SKIN.dark : SKIN.light;
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
    // Sweep left to right, opening a new column only once a marker is clear of
    // the one before it — rounding into fixed buckets let neighbours a few pixels
    // apart land in different columns and overlap.
    const columns: ProfileMarker[][] = [];
    let colAnchor = -Infinity;
    for (const m of markers.slice().sort((a, b) => a.km - b.km)) {
        const px = x(m.km);
        if (!columns.length || px - colAnchor > STACK_GAP_PX) {
            columns.push([m]);
            colAnchor = px;
        } else {
            columns[columns.length - 1].push(m);
        }
    }
    const drawn: { marker: ProfileMarker; px: number; py: number; lift: number }[] = [];
    const overflow: { px: number; py: number; lift: number; count: number }[] = [];
    for (const col of columns) {
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
                        <line x1={PAD.left} y1={y(t)} x2={PAD.left + innerW} y2={y(t)} stroke={skin.grid} strokeWidth={1} />
                        <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={skin.axisText}>{t}</text>
                    </g>
                ))}
                <text
                    x={PAD.left - 8}
                    y={PAD.top - 12}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={700}
                    fill={skin.unit}
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
                            stroke={skin.cpLine} strokeWidth={1} strokeDasharray="3 4"
                        />
                        <circle cx={x(cp.km)} cy={yAt(cp.km)} r={3.2} fill={skin.cpDot} stroke="#7c3aed" strokeWidth={2} />
                        <text
                            x={x(cp.km)}
                            y={PAD.top - 12}
                            textAnchor="middle"
                            fontSize={9.5}
                            fontWeight={800}
                            fill={skin.cpText}
                        >
                            {cp.name}
                        </text>
                    </g>
                ))}

                {/* Distance axis */}
                <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke={skin.axisLine} />
                {kmTicks.map(t => (
                    <g key={`k${t}`}>
                        <line x1={x(t)} y1={PAD.top + innerH} x2={x(t)} y2={PAD.top + innerH + 4} stroke={skin.tick} />
                        <text x={x(t)} y={PAD.top + innerH + 16} textAnchor="middle" fontSize={10} fill={skin.axisText}>
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
                    fill={skin.unit}
                >
                    {th ? 'ระยะทาง (กม.)' : 'Distance (km)'}
                </text>

                {/* Runners */}
                {drawn.map(({ marker, px, py, lift }, mi) => {
                    const c = COLORS[marker.tone];
                    const top = py - lift * FIGURE_LIFT;
                    const chipFont = marker.cluster ? 10.5 : 9;
                    const chipW = Math.max(marker.cluster ? 22 : 16, marker.label.length * (chipFont * 0.72) + 10);
                    const chipH = marker.cluster ? 15 : 13;
                    // Near the finish there is no room on the right, so the badge
                    // flips to the other side of the figure.
                    const chipX = px + chipW + 12 > width ? -(chipW + 8) : 8;
                    // Stagger the run cycles so a bunch of figures is not in lockstep.
                    const phase = (mi % 5) * (STRIDE_S / 2.5);
                    return (
                        <g
                            key={marker.key}
                            // Set through CSS rather than the SVG transform attribute:
                            // only the CSS property is reliably transitionable, and the
                            // 1s tween across a 1s tick is what makes the walk smooth
                            // (it also softens the jump when a new scan lands).
                            style={{
                                transform: `translate(${px.toFixed(2)}px, ${top.toFixed(2)}px)`,
                                transition: 'transform 1s linear',
                                cursor: marker.onClick ? 'pointer' : 'default',
                            }}
                            onClick={marker.onClick}
                            onMouseEnter={() => marker.tooltip && setHover({ x: px, y: top, text: marker.tooltip })}
                            onMouseLeave={() => setHover(null)}
                        >
                            {lift > 0 && (
                                <line x1={0} y1={0} x2={0} y2={lift * FIGURE_LIFT} stroke={c.fill} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
                            )}
                            {/* Exact spot on the line, under the runner's feet */}
                            <circle cx={0} cy={0} r={1.9} fill={c.dark} opacity={0.55} />
                            {marker.cluster ? (
                                // A pack: two runners tucked behind the leading one, so
                                // the marker reads as "several people" at a glance.
                                <>
                                    <g transform="translate(-6.5, 0) scale(0.78)" opacity={0.55}>
                                        <RunnerFigure color={c.fill} dark={c.dark} moving={marker.moving} phase={phase + 0.22} />
                                    </g>
                                    <g transform="translate(4.5, 0) scale(0.86)" opacity={0.75}>
                                        <RunnerFigure color={c.fill} dark={c.dark} moving={marker.moving} phase={phase + 0.44} />
                                    </g>
                                    <RunnerFigure color={c.fill} dark={c.dark} moving={marker.moving} phase={phase} />
                                </>
                            ) : (
                                <RunnerFigure color={c.fill} dark={c.dark} moving={marker.moving} phase={phase} />
                            )}
                            {/* A group badge is wide, so it sits centred above the
                                huddle instead of reaching sideways into the next one. */}
                            <g transform={marker.cluster
                                ? `translate(${-chipW / 2}, -25)`
                                : `translate(${chipX}, -20)`}>
                                <rect x={0} y={-chipH / 2 - 1.5} width={chipW} height={chipH} rx={chipH / 2} fill={c.fill}
                                    stroke={marker.cluster ? c.dark : 'none'} strokeWidth={marker.cluster ? 0.9 : 0} />
                                <text x={chipW / 2} y={2} textAnchor="middle" fontSize={chipFont} fontWeight={900} fill="#fff">
                                    {marker.label}
                                </text>
                            </g>
                            {marker.sublabel && (
                                <text x={0} y={11} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={c.dark}>
                                    {marker.sublabel}
                                </text>
                            )}
                            {marker.note && (
                                <text x={0} y={20} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={skin.axisText}>
                                    {marker.note}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Whatever did not fit in a column */}
                {overflow.map((o, i) => (
                    <g key={`ov${i}`} transform={`translate(${o.px}, ${o.py - o.lift * FIGURE_LIFT})`}>
                        <rect x={-15} y={-12} width={30} height={14} rx={7} fill={skin.overflow} />
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
                        background: skin.tooltipBg,
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
