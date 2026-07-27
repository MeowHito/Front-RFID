import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const campaignId = searchParams.get('campaignId');
    const eventId = searchParams.get('eventId');

    const qs = new URLSearchParams();
    if (campaignId) qs.set('campaignId', campaignId);
    if (eventId) qs.set('eventId', eventId);

    try {
        const res = await fetch(`${BACKEND_URL}/runners/edit-logs?${qs.toString()}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching campaign edit logs:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Clear the audit trail for a campaign/event (or one entry) — admin-triggered only.
export async function DELETE(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const qs = new URLSearchParams();
    for (const key of ['campaignId', 'eventId', 'logId']) {
        const value = searchParams.get(key);
        if (value) qs.set(key, value);
    }

    try {
        const res = await fetch(`${BACKEND_URL}/runners/edit-logs?${qs.toString()}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch (error) {
        console.error('Error deleting edit logs:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
