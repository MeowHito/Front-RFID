import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../../_helpers';

// Bib-check roster for a campaign (admin) — used by /admin/bib-check
export async function GET(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    try {
        const res = await fetch(`${BACKEND_URL}/runners/checked-in?campaignId=${encodeURIComponent(campaignId)}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await safeJson(res, { data: [], total: 0 });
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
