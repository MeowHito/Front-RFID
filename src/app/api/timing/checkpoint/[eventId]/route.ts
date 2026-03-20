import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId } = await params;
    const cp = req.nextUrl.searchParams.get('cp') || '';
    try {
        const res = await fetch(`${API}/timing/checkpoint/${eventId}?cp=${encodeURIComponent(cp)}`, { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json([], { status: 500 });
    }
}
