import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const bib = searchParams.get('bib') || '';
    const campaignId = searchParams.get('campaignId') || '';
    if (!bib || !campaignId) return NextResponse.json([], { status: 200 });

    const url = `${BACKEND_URL}/cctv-beta/recordings/runner-lookup?bib=${encodeURIComponent(bib)}&campaignId=${encodeURIComponent(campaignId)}`;
    const res = await fetch(url, { cache: 'no-store', headers: proxyHeaders(request) });
    if (!res.ok) return NextResponse.json([], { status: res.status });
    return NextResponse.json(await res.json());
}
