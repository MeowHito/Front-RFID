/**
 * GPX parsing — runs in the browser (uses DOMParser), so only import this from
 * client components.
 *
 * A trail GPX can carry 50k+ points; we downsample to a few thousand before
 * sending to the backend. That is far more resolution than a map at screen size
 * can show, and keeps the stored document small.
 */

export interface RouteCoord extends Array<number> {
    0: number; // lat
    1: number; // lng
    2: number; // cumulative km from start
}

export interface ParsedRoute {
    coords: number[][];        // [[lat, lng, cumKm], ...]
    distanceKm: number;
    elevationGainM: number;
    pointCount: number;        // after downsampling
    rawPointCount: number;     // as found in the file
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
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

function readPoints(doc: Document): RawPoint[] {
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
        if (pts.length >= 2) return pts;
    }
    return [];
}

export class GpxParseError extends Error { }

export function parseGpx(text: string, maxPoints = MAX_POINTS): ParsedRoute {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new GpxParseError('ไฟล์ GPX เสียหรืออ่านไม่ได้ (invalid XML)');
    }

    const pts = readPoints(doc);
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
    // line still starts and ends where the race does.
    const stride = Math.max(1, Math.ceil(pts.length / maxPoints));
    const coords: number[][] = [];
    for (let i = 0; i < pts.length; i += stride) {
        coords.push([pts[i].lat, pts[i].lng, +cum[i].toFixed(4)]);
    }
    const lastIdx = pts.length - 1;
    if (lastIdx % stride !== 0) {
        coords.push([pts[lastIdx].lat, pts[lastIdx].lng, +cum[lastIdx].toFixed(4)]);
    }

    const lats = coords.map(c => c[0]);
    const lngs = coords.map(c => c[1]);

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
    };
}
