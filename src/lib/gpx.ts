/**
 * GPX parsing — runs in the browser (uses DOMParser), so only import this from
 * client components.
 *
 * A trail GPX can carry 50k+ points; we downsample to a few thousand before
 * sending to the backend. That is far more resolution than a map at screen size
 * can show, and keeps the stored document small.
 */

/** [lat, lng, cumulative km from start, elevation in metres (optional)] */
export type RouteCoord = number[];

/** A named <wpt> from the file, snapped onto the track. */
export interface GpxWaypoint {
    name: string;
    km: number;
    lat: number;
    lng: number;
}

export interface ParsedRoute {
    coords: number[][];        // [[lat, lng, cumKm, ele?], ...]
    distanceKm: number;
    elevationGainM: number;
    pointCount: number;        // after downsampling
    rawPointCount: number;     // as found in the file
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
    /** Named waypoints (CP1, WS, ...) in km order, empty when the file has none. */
    waypoints: GpxWaypoint[];
}

/** Max points kept after downsampling. */
const MAX_POINTS = 2500;

/** Ignore elevation wobble below this many metres when summing climb. */
const ELEV_NOISE_M = 3;

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface RawPoint { lat: number; lng: number; ele: number | null }

function readPoints(doc: Document): { pts: RawPoint[]; tag: string } {
    // Prefer track points; fall back to route points, then waypoints, so that
    // GPX files exported as routes (rte) still work.
    const tagOrder = ['trkpt', 'rtept', 'wpt'];
    for (const tag of tagOrder) {
        const nodes = doc.getElementsByTagName(tag);
        if (nodes.length < 2) continue;
        const pts: RawPoint[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const lat = parseFloat(n.getAttribute('lat') || '');
            const lng = parseFloat(n.getAttribute('lon') || n.getAttribute('lng') || '');
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
            const eleNode = n.getElementsByTagName('ele')[0];
            const ele = eleNode ? parseFloat(eleNode.textContent || '') : NaN;
            pts.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
        }
        if (pts.length >= 2) return { pts, tag };
    }
    return { pts: [], tag: '' };
}

const firstText = (node: Element, tag: string): string =>
    (node.getElementsByTagName(tag)[0]?.textContent || '').trim();

/**
 * Named <wpt> markers — this is where an app like Ji3ng or Garmin stores the
 * checkpoints an organiser dropped on the course, so they are worth reading
 * instead of asking for the km again. Each one is snapped to the nearest point
 * on the track to turn its coordinates into a km along the line.
 *
 * Skipped: the unnamed ones, the "Auto-generated" Begin/End pair every export
 * adds (START/FINISH are already known), repeats of a name already taken — an
 * out-and-back passes the same aid station twice — and a pin dropped twice on
 * the same spot under two names ("CP1" and "CP1 - 1", a few metres apart). Two
 * pins that share a spot but not a km are the two passes of an out-and-back, so
 * both of those are kept.
 */
function readWaypoints(doc: Document, pts: RawPoint[], cum: number[]): GpxWaypoint[] {
    const nodes = doc.getElementsByTagName('wpt');
    const out: GpxWaypoint[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const name = firstText(n, 'name');
        if (!name) continue;
        if (/^auto-generated$/i.test(firstText(n, 'desc'))) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        const lat = parseFloat(n.getAttribute('lat') || '');
        const lng = parseFloat(n.getAttribute('lon') || n.getAttribute('lng') || '');
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        let bestIdx = 0;
        let bestD = Infinity;
        for (let j = 0; j < pts.length; j++) {
            const d = haversineKm(lat, lng, pts[j].lat, pts[j].lng);
            if (d < bestD) { bestD = d; bestIdx = j; }
        }
        // More than a kilometre off the line is not a marker on this course.
        if (bestD > 1) continue;

        const km = +cum[bestIdx].toFixed(3);
        if (out.some(o => Math.abs(o.km - km) < 0.1 && haversineKm(o.lat, o.lng, lat, lng) < 0.05)) continue;

        seen.add(key);
        out.push({ name, km, lat, lng });
    }
    return out.sort((a, b) => a.km - b.km);
}

export class GpxParseError extends Error { }

export function parseGpx(text: string, maxPoints = MAX_POINTS): ParsedRoute {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new GpxParseError('ไฟล์ GPX เสียหรืออ่านไม่ได้ (invalid XML)');
    }

    const { pts, tag } = readPoints(doc);
    if (pts.length < 2) {
        throw new GpxParseError('ไม่พบพิกัดในไฟล์ GPX (ต้องมีอย่างน้อย 2 จุด)');
    }

    // Cumulative distance + elevation gain on the FULL resolution track, so both
    // stay accurate no matter how aggressively we downsample afterwards.
    const cum: number[] = new Array(pts.length);
    cum[0] = 0;
    let gain = 0;
    let lastEle: number | null = pts[0].ele;
    for (let i = 1; i < pts.length; i++) {
        cum[i] = cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
        const e = pts[i].ele;
        if (e !== null && lastEle !== null) {
            const d = e - lastEle;
            if (d > ELEV_NOISE_M) { gain += d; lastEle = e; }
            else if (d < -ELEV_NOISE_M) { lastEle = e; }
        } else if (e !== null) {
            lastEle = e;
        }
    }

    // Even-stride downsample, always keeping the first and last point so the
    // line still starts and ends where the race does. Elevation rides along as a
    // 4th slot so the course profile can be drawn without re-reading the file.
    const stride = Math.max(1, Math.ceil(pts.length / maxPoints));
    const at = (i: number): number[] => {
        const p = [pts[i].lat, pts[i].lng, +cum[i].toFixed(4)];
        if (pts[i].ele !== null) p.push(+(pts[i].ele as number).toFixed(1));
        return p;
    };
    const coords: number[][] = [];
    for (let i = 0; i < pts.length; i += stride) coords.push(at(i));
    const lastIdx = pts.length - 1;
    if (lastIdx % stride !== 0) coords.push(at(lastIdx));

    const lats = coords.map(c => c[0]);
    const lngs = coords.map(c => c[1]);

    // When the <wpt> list *is* the track there are no separate markers to read.
    const waypoints = tag === 'wpt' ? [] : readWaypoints(doc, pts, cum);

    return {
        coords,
        distanceKm: +cum[lastIdx].toFixed(3),
        elevationGainM: Math.round(gain),
        pointCount: coords.length,
        rawPointCount: pts.length,
        bounds: {
            minLat: Math.min(...lats),
            minLng: Math.min(...lngs),
            maxLat: Math.max(...lats),
            maxLng: Math.max(...lngs),
        },
        waypoints,
    };
}
