import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const cid = searchParams.get('campaignId') || '';
    const at = searchParams.get('at') || '';
    if (!cid || !at) return NextResponse.json({ covering: [], nearestBefore: null, nearestAfter: null });
    const url = `${BACKEND_URL}/cctv-beta/recordings/by-time?campaignId=${encodeURIComponent(cid)}&at=${encodeURIComponent(at)}`;
    const res = await fetch(url, { cache: 'no-store', headers: proxyHeaders(request) });
    if (!res.ok) return NextResponse.json({ covering: [], nearestBefore: null, nearestAfter: null }, { status: res.status });
    return NextResponse.json(await res.json());
}
