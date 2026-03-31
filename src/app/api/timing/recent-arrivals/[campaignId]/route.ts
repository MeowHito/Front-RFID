import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    try {
        const { campaignId } = await params;
        const { searchParams } = new URL(request.url);
        const withinSeconds = searchParams.get('withinSeconds') || '60';
        const res = await fetch(
            `${BACKEND_URL}/timing/recent-arrivals/${campaignId}?withinSeconds=${withinSeconds}`,
            { cache: 'no-store' },
        );
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch arrivals' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching recent arrivals:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
