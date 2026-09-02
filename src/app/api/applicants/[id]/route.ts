import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../../_helpers';

// Update one applicant row (inline edit from the admin table)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/applicants/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Delete one applicant row
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const res = await fetch(`${BACKEND_URL}/applicants/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
