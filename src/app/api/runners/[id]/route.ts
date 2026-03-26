import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const res = await fetch(`${BACKEND_URL}/runners/${id}`);
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching runner:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/runners/${id}`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating runner:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const res = await fetch(`${BACKEND_URL}/runners/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });

        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error deleting runner:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
