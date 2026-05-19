import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${BACKEND_URL}/cctv-beta/recordings/bulk-delete`, {
        method: 'POST',
        headers: proxyHeaders(request),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    return NextResponse.json(data, { status: res.status });
}
