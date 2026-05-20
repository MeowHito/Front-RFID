import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function POST(request: NextRequest) {
    try {
        const res = await fetch(`${BACKEND_URL}/cctv-recordings/archive-all`, {
            method: 'POST',
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to archive recordings' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
