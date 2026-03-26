import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../_helpers';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const res = await fetch(`${BACKEND_URL}/users`, {
            method: 'POST',
            headers: proxyHeaders(req),
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = searchParams.get('page') || '1';
        const limit = searchParams.get('limit') || '100';

        const res = await fetch(`${BACKEND_URL}/users?page=${page}&limit=${limit}`, {
            headers: proxyHeaders(req),
            cache: 'no-store',
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
