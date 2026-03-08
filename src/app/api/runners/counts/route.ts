import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
        return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    try {
        const res = await fetch(`${BACKEND_URL}/runners/counts?campaignId=${campaignId}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch counts' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching runner counts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
