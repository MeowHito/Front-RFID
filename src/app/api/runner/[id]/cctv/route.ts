import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const backendRes = await fetch(`${BACKEND_URL}/public-api/runner/${id}/cctv`, {
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await backendRes.json();
        return NextResponse.json(data, { status: backendRes.status });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Internal server error' },
            { status: 500 },
        );
    }
}
