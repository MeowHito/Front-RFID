import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, safeJson } from '../../_helpers';

// Public search — no auth. Resolves campaign by slug/uuid/id on the backend.
export async function GET(request: NextRequest) {
    const campaign = request.nextUrl.searchParams.get('campaign') || '';
    const q = request.nextUrl.searchParams.get('q') || '';
    const qs = new URLSearchParams({ campaign, q });
    try {
        const res = await fetch(`${BACKEND_URL}/applicants/search?${qs.toString()}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
