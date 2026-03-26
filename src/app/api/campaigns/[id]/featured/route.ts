import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const value = body?.value === true;

        const res = await fetch(`${BACKEND_URL}/campaigns/${id}/featured`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify({ value }),
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: errorData || 'Failed to set featured' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating featured:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
