import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    try {
        const res = await fetch(
            `${BACKEND_URL}/public-api/campaign/getPassTimeByEvent?id=${id}`,
            { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' },
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch pass time data' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
            },
        });
    } catch (error) {
        console.error('Error fetching pass time:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
