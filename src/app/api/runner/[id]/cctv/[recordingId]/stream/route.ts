import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; recordingId: string }> },
) {
    const { id, recordingId } = await params;

    try {
        const qp = new URLSearchParams();
        if (request.nextUrl.searchParams.get('download') === '1') qp.set('download', '1');
        const ss = request.nextUrl.searchParams.get('ss');
        if (ss) qp.set('ss', ss);
        const t = request.nextUrl.searchParams.get('t');
        if (t) qp.set('t', t);
        const qs = qp.toString() ? `?${qp.toString()}` : '';
        const backendRes = await fetch(`${BACKEND_URL}/public-api/runner/${id}/cctv/${recordingId}/stream${qs}`, {
            cache: 'no-store',
        });

        if (!backendRes.ok) {
            const text = await backendRes.text();
            return new NextResponse(text || 'Failed to stream video', { status: backendRes.status });
        }

        const resHeaders: Record<string, string> = {
            'Content-Type': backendRes.headers.get('Content-Type') || 'video/webm',
            'Content-Disposition': backendRes.headers.get('Content-Disposition') || 'inline',
            'Cache-Control': 'no-store',
        };
        const contentLength = backendRes.headers.get('Content-Length');
        if (contentLength) resHeaders['Content-Length'] = contentLength;
        const acceptRanges = backendRes.headers.get('Accept-Ranges');
        if (acceptRanges) resHeaders['Accept-Ranges'] = acceptRanges;

        return new NextResponse(backendRes.body, {
            status: backendRes.status,
            headers: resHeaders,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Internal server error' },
            { status: 500 },
        );
    }
}
