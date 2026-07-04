import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const campaignId = searchParams.get('campaignId');
    const category = searchParams.get('category');

    if (!campaignId) {
        return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    try {
        const params = new URLSearchParams({ campaignId });
        if (category) params.append('category', category);
        const res = await fetch(`${BACKEND_URL}/runners/nationality-counts?${params.toString()}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch nationality counts' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching nationality counts:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
