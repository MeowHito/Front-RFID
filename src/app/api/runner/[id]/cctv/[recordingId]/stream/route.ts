import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../../../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; recordingId: string }> },
) {
    const { id, recordingId } = await params;

    try {
        const download = request.nextUrl.searchParams.get('download') === '1' ? '?download=1' : '';
        const backendRes = await fetch(`${BACKEND_URL}/public-api/runner/${id}/cctv/${recordingId}/stream${download}`, {
            cache: 'no-store',
        });

        if (!backendRes.ok) {
            const text = await backendRes.text();
            return new NextResponse(text || 'Failed to stream video', { status: backendRes.status });
        }

        return new NextResponse(backendRes.body, {
            status: backendRes.status,
            headers: {
                'Content-Type': backendRes.headers.get('Content-Type') || 'video/webm',
                'Content-Length': backendRes.headers.get('Content-Length') || '',
                'Content-Disposition': backendRes.headers.get('Content-Disposition') || 'inline',
                'Accept-Ranges': backendRes.headers.get('Accept-Ranges') || 'bytes',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Internal server error' },
            { status: 500 },
        );
    }
}
