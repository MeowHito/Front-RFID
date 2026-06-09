import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders, safeJson } from '../../_helpers';

// Bulk import applicants from a parsed Excel file (admin)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/applicants/bulk`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const data = await safeJson(res, {});
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
