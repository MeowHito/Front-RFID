import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    try {
        const { campaignId } = await params;
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/campaign/${campaignId}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch cameras' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching cameras by campaign:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
