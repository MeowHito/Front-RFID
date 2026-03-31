import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../_helpers';

export async function GET(request: NextRequest) {
    try {
        const res = await fetch(`${BACKEND_URL}/cctv-recordings`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to fetch recordings' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const res = await fetch(`${BACKEND_URL}/cctv-recordings/all`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to delete recordings' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
