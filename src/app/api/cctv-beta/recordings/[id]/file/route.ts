import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../../_helpers';

/**
 * Proxy to the backend that streams the on-disk fmp4 for an in-progress beta clip.
 * Forwards the Range header so the browser can seek into a still-growing file.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const fetchHeaders: Record<string, string> = {};
    const range = request.headers.get('range');
    if (range) fetchHeaders['range'] = range;

    const backendRes = await fetch(`${BACKEND_URL}/cctv-beta/recordings/${id}/file`, {
        cache: 'no-store',
        headers: fetchHeaders,
    });

    if (backendRes.status >= 400) {
        const text = await backendRes.text();
        return new NextResponse(text || 'Failed to stream', { status: backendRes.status });
    }

    const resHeaders: Record<string, string> = {
        'Content-Type': backendRes.headers.get('Content-Type') || 'video/mp4',
        'Cache-Control': 'no-store',
    };
    const cl = backendRes.headers.get('Content-Length');
    if (cl) resHeaders['Content-Length'] = cl;
    const ar = backendRes.headers.get('Accept-Ranges');
    if (ar) resHeaders['Accept-Ranges'] = ar;
    const cr = backendRes.headers.get('Content-Range');
    if (cr) resHeaders['Content-Range'] = cr;

    return new NextResponse(backendRes.body, {
        status: backendRes.status,
        headers: resHeaders,
    });
}
