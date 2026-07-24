import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../_helpers';

/** GET /api/routes?campaignId=...&meta=true — GPX course lines for a campaign. */
export async function GET(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId');
    const meta = request.nextUrl.searchParams.get('meta');
    if (!campaignId) {
        return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }
    try {
        const qs = new URLSearchParams({ campaignId });
        if (meta) qs.set('meta', meta);
        const res = await fetch(`${BACKEND_URL}/routes?${qs.toString()}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await safeJson(res, []);
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error fetching routes:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/** POST /api/routes — upload/replace the GPX line for one campaign+category. */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const res = await fetch(`${BACKEND_URL}/routes`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body,
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error saving route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/** PUT /api/routes — update only the checkpoint km markers. */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.text();
        const res = await fetch(`${BACKEND_URL}/routes/marks`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body,
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error updating route marks:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/** DELETE /api/routes?campaignId=...&category=... */
export async function DELETE(request: NextRequest) {
    const campaignId = request.nextUrl.searchParams.get('campaignId');
    const category = request.nextUrl.searchParams.get('category');
    if (!campaignId || !category) {
        return NextResponse.json({ error: 'campaignId and category are required' }, { status: 400 });
    }
    try {
        const qs = new URLSearchParams({ campaignId, category });
        const res = await fetch(`${BACKEND_URL}/routes?${qs.toString()}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error deleting route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
