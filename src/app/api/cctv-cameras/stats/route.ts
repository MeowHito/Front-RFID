import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const campaignId = searchParams.get('campaignId');
        const url = campaignId
            ? `${BACKEND_URL}/cctv-cameras/stats/${campaignId}`
            : `${BACKEND_URL}/cctv-cameras/stats`;
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch stats' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching camera stats:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
