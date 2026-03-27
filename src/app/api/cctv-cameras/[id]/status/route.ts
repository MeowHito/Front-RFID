import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../_helpers';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/cctv-cameras/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to update status' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating camera status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
