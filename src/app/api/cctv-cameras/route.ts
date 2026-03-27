import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../_helpers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = new URLSearchParams();
        const campaignId = searchParams.get('campaignId');
        if (campaignId) query.set('campaignId', campaignId);
        const qs = query.toString();
        const url = `${BACKEND_URL}/cctv-cameras${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch cameras' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching cameras:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-cameras`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json({ error: errorData || 'Failed to create camera' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating camera:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
