import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
) {
    try {
        const { eventId } = await params;
        const res = await fetch(`${API}/timing/event/${eventId}`, { cache: 'no-store' });
        if (!res.ok) return NextResponse.json([], { status: res.status });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json([], { status: 500 });
    }
}
