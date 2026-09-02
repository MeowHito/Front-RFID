import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../../_helpers';

// List applicant edit-log entries for a campaign (powers /admin/edit-history)
export async function GET(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    const limit = request.nextUrl.searchParams.get('limit') || '';
    const qs = new URLSearchParams({ campaignId });
    if (limit) qs.set('limit', limit);
    try {
        const res = await fetch(`${BACKEND_URL}/applicants/edit-logs?${qs.toString()}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Clear the applicant edit log for a campaign (or one entry via logId)
export async function DELETE(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    const logId = request.nextUrl.searchParams.get('logId') || '';
    const qs = new URLSearchParams({ campaignId });
    if (logId) qs.set('logId', logId);
    try {
        const res = await fetch(`${BACKEND_URL}/applicants/edit-logs?${qs.toString()}`, {
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
