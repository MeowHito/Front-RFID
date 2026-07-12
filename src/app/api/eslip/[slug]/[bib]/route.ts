import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string; bib: string }> }
) {
    const { slug, bib } = await params;
    try {
        const res = await fetch(
            `${BACKEND_URL}/public-api/eslip/${encodeURIComponent(slug)}/${encodeURIComponent(bib)}`,
            {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            return NextResponse.json(
                { status: { code: String(res.status), description: 'Runner not found' } },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, max-age=3, stale-while-revalidate=5',
            },
        });
    } catch (error) {
        console.error('Error resolving e-slip by bib:', error);
        return NextResponse.json(
            { status: { code: '500', description: 'Internal server error' } },
            { status: 500 }
        );
    }
}
