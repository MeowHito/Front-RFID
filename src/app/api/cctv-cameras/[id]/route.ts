import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/${id}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Camera not found' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching camera:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/${id}`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to update camera' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating camera:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to delete camera' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error deleting camera:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
