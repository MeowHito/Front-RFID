import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const qs = new URLSearchParams();
        const campaignId = searchParams.get('campaignId');
        if (campaignId) qs.set('campaignId', campaignId);
        const url = `${BACKEND_URL}/cctv-beta/cameras${qs.toString() ? `?${qs}` : ''}`;
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
        if (!res.ok) return NextResponse.json({ error: 'Failed to fetch beta cameras' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch (e) {
        console.error('cctv-beta cameras GET error', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-beta/cameras`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch (e) {
        console.error('cctv-beta cameras POST error', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
