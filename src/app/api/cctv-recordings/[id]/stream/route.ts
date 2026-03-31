import { NextRequest } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const backendRes = await fetch(`${BACKEND_URL}/cctv-recordings/${id}/stream`, {
        headers: proxyHeaders(request),
    });
    // Stream the response directly (supports large video files)
    return new Response(backendRes.body, {
        status: backendRes.status,
        headers: {
            'Content-Type': backendRes.headers.get('Content-Type') || 'video/webm',
            'Content-Length': backendRes.headers.get('Content-Length') || '',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
        },
    });
}
