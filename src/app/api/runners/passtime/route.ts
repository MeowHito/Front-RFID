import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

const _cache = new Map<string, { body: string; expiry: number }>();
const _TTL = 5_000;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const cached = _cache.get(id);
    if (cached && Date.now() < cached.expiry) {
        return new Response(cached.body, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
                'X-Cache': 'HIT',
            },
        });
    }

    try {
        const res = await fetch(
            `${BACKEND_URL}/public-api/campaign/getPassTimeByEvent?id=${id}`,
            { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' },
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch pass time data' }, { status: res.status });
        }

        const body = await res.text();
        _cache.set(id, { body, expiry: Date.now() + _TTL });

        return new Response(body, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
                'X-Cache': 'MISS',
            },
        });
    } catch (error) {
        console.error('Error fetching pass time:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
