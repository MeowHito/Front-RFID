import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../_helpers';

export async function GET() {
    try {
        const res = await fetch(`${BACKEND_URL}/cctv-settings`, { cache: 'no-store' });
        if (!res.ok) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-settings`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to save settings' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
