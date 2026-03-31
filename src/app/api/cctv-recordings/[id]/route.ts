import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND_URL}/cctv-recordings/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });
        if (!res.ok) return NextResponse.json({ error: 'Failed to delete' }, { status: res.status });
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
