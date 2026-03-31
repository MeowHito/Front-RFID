import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: err || 'Failed to register camera' }, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/register/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: err || 'Failed to update camera' }, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
