import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let body: unknown = {};
    try { body = await request.json(); } catch { /* empty body is fine — restore everything */ }

    try {
        const res = await fetch(`${BACKEND_URL}/runners/${id}/restore-edits`, {
            method: 'POST',
            headers: { ...proxyHeaders(request), 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
            cache: 'no-store',
        });
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try { errorBody = await res.json(); } catch { /* ignore */ }
            return NextResponse.json(errorBody, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch (error) {
        console.error('Error restoring runner edits:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
