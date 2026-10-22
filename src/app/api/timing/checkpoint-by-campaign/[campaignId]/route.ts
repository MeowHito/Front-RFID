import { NextRequest, NextResponse } from 'next/server';

const API = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
    const { campaignId } = await params;
    const cp = req.nextUrl.searchParams.get('cp') || '';
    const strict = req.nextUrl.searchParams.get('strict') === '1' ? '&strict=1' : '';
    const slim = req.nextUrl.searchParams.get('slim') === '1' ? '&slim=1' : '';
    // The backend tags each list with an ETag that only changes when the list does, so a
    // poll between syncs can come back as an empty 304 instead of the whole list again.
    const ifNoneMatch = req.headers.get('if-none-match');
    try {
        const res = await fetch(`${API}/timing/checkpoint-by-campaign/${campaignId}?cp=${encodeURIComponent(cp)}${strict}${slim}`, {
            cache: 'no-store',
            // Without an explicit Cache-Control, fetch's no-store mode adds "no-cache", and
            // Express then never answers 304.
            headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch, 'Cache-Control': 'max-age=0' } : undefined,
        });
        const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
        const etag = res.headers.get('etag');
        if (etag) headers.ETag = etag;
        if (res.status === 304) return new NextResponse(null, { status: 304, headers });
        if (!res.ok) return NextResponse.json([], { status: 500 });
        // Passed through as-is: a FINISH list is ~1–2 MB, and parsing then re-serialising it
        // on every viewer's 10 s poll cost CPU for nothing.
        return new NextResponse(await res.text(), { headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch {
        return NextResponse.json([], { status: 500 });
    }
}
