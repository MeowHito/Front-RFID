import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Aggregate e-slip download stats for a whole campaign (all distances).
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    try {
        const res = await fetch(
            `${BACKEND_URL}/public-api/eslip-stats/${encodeURIComponent(slug)}`,
            {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            }
        );
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, {
            status: res.ok ? 200 : res.status,
            headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' },
        });
    } catch (error) {
        console.error('Error fetching e-slip stats:', error);
        return NextResponse.json(
            { status: { code: '500', description: 'Internal server error' } },
            { status: 500 }
        );
    }
}
