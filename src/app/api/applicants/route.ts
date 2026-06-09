import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../_helpers';

// List applicants for a campaign (admin)
export async function GET(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    const limit = request.nextUrl.searchParams.get('limit') || '';
    const qs = new URLSearchParams({ campaignId });
    if (limit) qs.set('limit', limit);
    try {
        const res = await fetch(`${BACKEND_URL}/applicants?${qs.toString()}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Clear all applicants for a campaign (admin)
export async function DELETE(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    try {
        const res = await fetch(`${BACKEND_URL}/applicants?campaignId=${encodeURIComponent(campaignId)}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
