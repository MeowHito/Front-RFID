import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-recordings/clip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: err || 'Failed to save clip' }, { status: res.status });
        }
        return NextResponse.json(await res.json(), { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
    }
}
