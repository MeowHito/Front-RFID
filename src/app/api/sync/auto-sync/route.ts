import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const enabled = searchParams.get('enabled');

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const res = await fetch(`${backendUrl}/api/sync/auto-sync?id=${id}&enabled=${enabled}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
