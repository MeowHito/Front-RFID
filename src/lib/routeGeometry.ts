/**
 * Pure geometry helpers for placing checkpoints and course stretches onto an
 * uploaded GPX line. Kept free of Leaflet/React so they can be reasoned about
 * (and tested) on their own.
 *
 * `coords` is always [[lat, lng, cumulativeKm], ...] with a non-decreasing km.
 */

/** Interpolate the lat/lng sitting exactly `km` along the track. */
export function pointAtKm(coords: number[][], km: number): [number, number] {
    if (coords.length === 0) return [0, 0];
    if (km <= coords[0][2]) return [coords[0][0], coords[0][1]];
    const last = coords[coords.length - 1];
    if (km >= last[2]) return [last[0], last[1]];
    // Linear scan is fine: coords is capped at a few thousand points.
    for (let i = 1; i < coords.length; i++) {
        if (coords[i][2] >= km) {
            const a = coords[i - 1];
            const b = coords[i];
            const span = b[2] - a[2];
            const t = span > 0 ? (km - a[2]) / span : 0;
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
    }
    return [last[0], last[1]];
}

/** The piece of the track between two km marks, with exact interpolated ends. */
export function sliceByKm(coords: number[][], fromKm: number, toKm: number): [number, number][] {
    if (coords.length === 0 || !(toKm > fromKm)) return [];
    const out: [number, number][] = [pointAtKm(coords, fromKm)];
    for (const c of coords) {
        if (c[2] > fromKm && c[2] < toKm) out.push([c[0], c[1]]);
    }
    out.push(pointAtKm(coords, toKm));
    return out;
}

/** Heat colour for a stretch, relative to the busiest stretch on the course. */
export function densityColor(count: number, max: number): string {
    if (count <= 0) return '#cbd5e1';
    const ratio = max > 0 ? count / max : 0;
    if (ratio <= 0.25) return '#22c55e';
    if (ratio <= 0.5) return '#eab308';
    if (ratio <= 0.75) return '#f97316';
    return '#ef4444';
}

/**
 * Resolve where each checkpoint sits along the track, in km.
 * Uses the admin's markers where given, spreads the rest evenly, and forces the
 * result to be non-decreasing so stretches never run backwards.
 */
export function resolveCpKm(
    cpNames: string[],
    distanceKm: number,
    marks?: { name: string; km: number }[],
): number[] {
    const n = cpNames.length;
    if (n === 0) return [];
    const safeDistance = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
    const byName = new Map<string, number>();
    for (const m of marks || []) {
        if (m && typeof m.km === 'number' && Number.isFinite(m.km)) {
            byName.set(m.name, Math.max(0, Math.min(safeDistance, m.km)));
        }
    }
    const km = cpNames.map((name, i) => {
        const v = byName.get(name);
        if (v !== undefined) return v;
        return n === 1 ? 0 : (i / (n - 1)) * safeDistance;
    });
    for (let i = 1; i < km.length; i++) {
        if (km[i] < km[i - 1]) km[i] = km[i - 1];
    }
    return km;
}
