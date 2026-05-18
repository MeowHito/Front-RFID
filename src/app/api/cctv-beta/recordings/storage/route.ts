import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const qs = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
    const res = await fetch(`${BACKEND_URL}/cctv-beta/recordings/storage${qs}`, {
        cache: 'no-store',
        headers: proxyHeaders(request),
    });
    if (!res.ok) return NextResponse.json({ totalSize: 0, count: 0 }, { status: res.status });
    return NextResponse.json(await res.json());
}
