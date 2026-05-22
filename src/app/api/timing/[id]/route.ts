import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/timing/${id}`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Failed to update timing record' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating timing record:', error);
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
        const res = await fetch(`${BACKEND_URL}/timing/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Failed to delete timing record' },
                { status: res.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting timing record:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
