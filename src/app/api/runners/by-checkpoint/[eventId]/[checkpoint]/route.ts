import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ eventId: string; checkpoint: string }> }
) {
    try {
        const { eventId, checkpoint } = await params;
        const { searchParams } = new URL(req.url);
        const gender = searchParams.get('gender') || '';
        const ageGroup = searchParams.get('ageGroup') || '';
        let url = `${BACKEND_URL}/runners/by-checkpoint/${eventId}/${encodeURIComponent(checkpoint)}`;
        const qp = new URLSearchParams();
        if (gender) qp.append('gender', gender);
        if (ageGroup) qp.append('ageGroup', ageGroup);
        if (qp.toString()) url += `?${qp.toString()}`;

        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
