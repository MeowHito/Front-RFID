import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const res = await fetch(
            `${BACKEND_URL}/public-api/campaign/image?id=${id}`,
            {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            return NextResponse.json({ pictureUrl: null }, { status: 200 });
        }

        const data = await res.json();
        return NextResponse.json({ pictureUrl: data?.data?.pictureUrl || null });
    } catch (error) {
        return NextResponse.json({ pictureUrl: null }, { status: 200 });
    }
}
