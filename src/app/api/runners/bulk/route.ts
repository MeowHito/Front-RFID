import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }
        const updateExisting = request.nextUrl.searchParams.get('updateExisting') || '';
        const url = updateExisting === 'true'
            ? `${BACKEND_URL}/runners/bulk?updateExisting=true`
            : `${BACKEND_URL}/runners/bulk`;
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = await res.json();
            } catch {
                const text = await res.text();
                errorBody = { error: text || 'Failed to bulk import runners' };
            }
            return NextResponse.json(errorBody, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error bulk importing runners:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
