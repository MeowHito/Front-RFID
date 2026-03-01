import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/runners/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
        console.error('Error updating runner status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
