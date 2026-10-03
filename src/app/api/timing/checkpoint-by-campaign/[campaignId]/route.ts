import { NextRequest, NextResponse } from 'next/server';

const API = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
    const { campaignId } = await params;
    const cp = req.nextUrl.searchParams.get('cp') || '';
    const strict = req.nextUrl.searchParams.get('strict') === '1' ? '&strict=1' : '';
    try {
        const res = await fetch(`${API}/timing/checkpoint-by-campaign/${campaignId}?cp=${encodeURIComponent(cp)}${strict}`, { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json([], { status: 500 });
    }
}
