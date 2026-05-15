import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const qs = new URLSearchParams();
    const campaignId = searchParams.get('campaignId');
    const cameraId = searchParams.get('cameraId');
    if (campaignId) qs.set('campaignId', campaignId);
    if (cameraId) qs.set('cameraId', cameraId);
    const url = `${BACKEND_URL}/cctv-beta/recordings${qs.toString() ? `?${qs}` : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Failed' }, { status: res.status });
    return NextResponse.json(await res.json());
}
