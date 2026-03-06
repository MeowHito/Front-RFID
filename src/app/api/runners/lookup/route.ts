import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const code = searchParams.get('code');

    if (!campaignId || !code) {
        return NextResponse.json(
            { found: false, runner: null },
            { status: 400 }
        );
    }

    try {
        const params = new URLSearchParams({ campaignId, code });
        const res = await fetch(
            `${BACKEND_URL}/runners/lookup?${params.toString()}`,
            {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            return NextResponse.json(
                { found: false, runner: null, error: 'Backend error' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error looking up runner:', error);
        return NextResponse.json(
            { found: false, runner: null, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
