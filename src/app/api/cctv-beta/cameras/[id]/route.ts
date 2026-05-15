import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const res = await fetch(`${BACKEND_URL}/cctv-beta/cameras/${id}`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: res.status });
    return NextResponse.json(await res.json());
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/cctv-beta/cameras/${id}`, {
        method: 'PUT',
        headers: proxyHeaders(request),
        body: JSON.stringify(body),
    });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
    return NextResponse.json(await res.json());
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const res = await fetch(`${BACKEND_URL}/cctv-beta/cameras/${id}`, {
        method: 'DELETE',
        headers: proxyHeaders(request),
    });
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
    return NextResponse.json({ ok: true });
}
