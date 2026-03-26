import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const enabled = searchParams.get('enabled');

    const res = await fetch(`${BACKEND_URL}/api/sync/auto-sync?id=${id}&enabled=${enabled}`, {
        method: 'POST',
        headers: proxyHeaders(request),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
