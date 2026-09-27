import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const full = request.nextUrl.searchParams.get('full');
    const qs = full === 'true' || full === '1' ? '?full=true' : '';

    try {
        const res = await fetch(`${BACKEND_URL}/campaigns/${id}${qs}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Campaign not found' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
            },
        });
    } catch (error) {
        console.error('Error fetching campaign:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    // ?light=1 → echo back only the fields that were sent (plus _id). A campaign
    // document can be several MB (base64 images, layouts), so pages that save one
    // small field should not have to download the whole thing on every save.
    const light = request.nextUrl.searchParams.get('light');
    const isLight = light === '1' || light === 'true';

    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/campaigns/${id}`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: errorData || 'Failed to update campaign' },
                { status: res.status }
            );
        }

        const data = await res.json();
        if (isLight && data && typeof data === 'object' && body && typeof body === 'object') {
            const picked: Record<string, unknown> = { _id: (data as Record<string, unknown>)._id };
            for (const k of Object.keys(body as Record<string, unknown>)) picked[k] = (data as Record<string, unknown>)[k];
            return NextResponse.json(picked);
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating campaign:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const res = await fetch(`${BACKEND_URL}/campaigns/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: errorData || 'Failed to delete campaign' },
                { status: res.status }
            );
        }

        // DELETE might return empty body
        const text = await res.text();
        const data = text ? JSON.parse(text) : { success: true };
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error deleting campaign:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
