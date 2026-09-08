import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

/**
 * One-shot repair for runners whose Gun/Net froze mid-race behind a staff-typed
 * checkpoint. The split sync re-anchors these as they happen now; this is for the
 * ones that were already broken. Idempotent — a second run repairs nothing.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    try {
        const { campaignId } = await params;
        const res = await fetch(`${BACKEND_URL}/timing/repair-frozen/${campaignId}`, {
            method: 'POST',
            headers: proxyHeaders(request),
            cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error repairing frozen runners:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
