import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const bib = searchParams.get('bib') || '';
        const campaignId = searchParams.get('campaignId') || '';
        const res = await fetch(
            `${BACKEND_URL}/cctv-recordings/runner-lookup?bib=${encodeURIComponent(bib)}&campaignId=${encodeURIComponent(campaignId)}`,
            { headers: proxyHeaders(request), cache: 'no-store' },
        );
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    }
}
