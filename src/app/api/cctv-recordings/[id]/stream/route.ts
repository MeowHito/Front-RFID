import { NextRequest } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    // Build headers for backend request
    const headers: Record<string, string> = {};

    // Forward auth: prefer Authorization header, fall back to ?token= query param
    // (video elements use src= attribute and can't send custom headers)
    const authHeader = request.headers.get('authorization');
    const tokenParam = request.nextUrl.searchParams.get('token');
    if (authHeader) {
        headers['Authorization'] = authHeader;
    } else if (tokenParam) {
        headers['Authorization'] = `Bearer ${tokenParam}`;
    }

    // Forward Range header for video seeking
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
        headers['Range'] = rangeHeader;
    }

    const backendRes = await fetch(`${BACKEND_URL}/cctv-recordings/${id}/stream`, {
        headers,
    });

    // Forward all relevant headers from backend
    const responseHeaders: Record<string, string> = {
        'Content-Type': backendRes.headers.get('Content-Type') || 'video/webm',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
    };

    const contentLength = backendRes.headers.get('Content-Length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    const contentRange = backendRes.headers.get('Content-Range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    const contentDuration = backendRes.headers.get('X-Content-Duration');
    if (contentDuration) responseHeaders['X-Content-Duration'] = contentDuration;

    const contentDisposition = backendRes.headers.get('Content-Disposition');
    if (contentDisposition) responseHeaders['Content-Disposition'] = contentDisposition;

    return new Response(backendRes.body, {
        status: backendRes.status,
        headers: responseHeaders,
    });
}
