import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Campaign id is required' }, { status: 400 });
        }

        const query = new URLSearchParams({ id });
        const res = await fetch(`${BACKEND_URL}/api/sync/latest-payload?${query.toString()}`, {
            headers: { 'Content-Type': 'application/json' },
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
                { error: data?.message || data?.error || 'Failed to fetch latest payload' },
                { status: res.status },
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching latest payload:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
