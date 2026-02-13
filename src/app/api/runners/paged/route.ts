import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get('eventId');

    if (!eventId) {
        return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    try {
        const params = new URLSearchParams({ eventId });
        const category = searchParams.get('category');
        const gender = searchParams.get('gender');
        const ageGroup = searchParams.get('ageGroup');
        const status = searchParams.get('status');
        const chipStatus = searchParams.get('chipStatus');
        const runnerStatus = searchParams.get('runnerStatus');
        const search = searchParams.get('search');
        const page = searchParams.get('page') || '1';
        const limit = searchParams.get('limit') || '50';

        if (category) params.append('category', category);
        if (gender) params.append('gender', gender);
        if (ageGroup) params.append('ageGroup', ageGroup);
        if (status) params.append('status', status);
        if (chipStatus) params.append('chipStatus', chipStatus);
        if (runnerStatus) params.append('runnerStatus', runnerStatus);
        if (search) params.append('search', search);
        params.append('page', page);
        params.append('limit', limit);

        const res = await fetch(`${BACKEND_URL}/runners/paged?${params.toString()}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch runners' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching paged runners:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
