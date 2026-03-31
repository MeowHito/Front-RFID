import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(request: NextRequest) {
    try {
        const campaignId = request.nextUrl.searchParams.get('campaignId');
        const qs = campaignId ? `?campaignId=${campaignId}` : '';
        const res = await fetch(`${BACKEND_URL}/cctv-recordings/storage${qs}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to fetch storage info' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
