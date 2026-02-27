import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const res = await fetch(`${BACKEND_URL}/public-api/runner/${id}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json(
                { status: { code: String(res.status), description: 'Runner not found' } },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching runner profile:', error);
        return NextResponse.json(
            { status: { code: '500', description: 'Internal server error' } },
            { status: 500 }
        );
    }
}
