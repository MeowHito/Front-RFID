import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/runners/bulk`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* */ }
            return NextResponse.json(errorBody, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error bulk deleting runners:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const headers = proxyHeaders(request);
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
