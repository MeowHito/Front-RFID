import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const runnerId = searchParams.get('runnerId');

        if (!runnerId) {
            return NextResponse.json({ error: 'Runner id is required' }, { status: 400 });
        }

        const query = new URLSearchParams({ runnerId });
        const res = await fetch(`${BACKEND_URL}/api/sync/runner?${query.toString()}`, {
            method: 'POST',
            headers: proxyHeaders(request),
            cache: 'no-store',
        });

        const text = await res.text();
        let data: any = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { message: text };
        }

        if (!res.ok) {
            return NextResponse.json(
                { error: data?.message || data?.error || 'Failed to sync runner' },
                { status: res.status },
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error syncing runner:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
