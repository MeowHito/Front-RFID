import { NextRequest, NextResponse } from 'next/server';

type Orientation = 'portrait' | 'landscape';

const orientationByCampaign = new Map<string, { orientation: Orientation; updatedAt: number }>();

function normalizeOrientation(value: unknown): Orientation {
    return value === 'portrait' ? 'portrait' : 'landscape';
}

export async function GET(request: NextRequest) {
    const campaign = request.nextUrl.searchParams.get('campaign') || 'default';
    const current = orientationByCampaign.get(campaign);

    return NextResponse.json({
        campaign,
        orientation: current?.orientation || 'landscape',
        updatedAt: current?.updatedAt || 0,
    }, {
        headers: { 'Cache-Control': 'no-store' },
    });
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const campaign = typeof body.campaign === 'string' && body.campaign.trim() ? body.campaign.trim() : 'default';
    const orientation = normalizeOrientation(body.orientation);
    const updatedAt = Date.now();

    orientationByCampaign.set(campaign, { orientation, updatedAt });

    return NextResponse.json({ campaign, orientation, updatedAt }, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
