import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Records that a runner's e-slip was downloaded/saved (bumps a per-runner counter).
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const res = await fetch(`${BACKEND_URL}/public-api/runner/${id}/eslip-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    } catch (error) {
        console.error('Error recording e-slip download:', error);
        return NextResponse.json(
            { status: { code: '500', description: 'Internal server error' } },
            { status: 500 }
        );
    }
}
