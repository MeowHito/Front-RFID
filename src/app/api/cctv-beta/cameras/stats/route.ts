import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const cid = searchParams.get('campaignId');
    const url = `${BACKEND_URL}/cctv-beta/cameras/stats${cid ? `?campaignId=${encodeURIComponent(cid)}` : ''}`;
    const res = await fetch(url, { cache: 'no-store', headers: proxyHeaders(request) });
    if (!res.ok) return NextResponse.json({ total: 0, online: 0, offline: 0, publishing: 0 }, { status: res.status });
    return NextResponse.json(await res.json());
}
