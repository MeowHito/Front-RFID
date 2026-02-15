import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Forward client IP to backend for admin logging
        const forwarded = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const clientIp = forwarded?.split(',')[0]?.trim() || realIp || '';

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (clientIp) {
            headers['X-Forwarded-For'] = clientIp;
        }

        const res = await fetch(`${BACKEND_URL}/auth/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in auth login:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
