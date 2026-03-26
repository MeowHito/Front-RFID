import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../_helpers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const gender = searchParams.get('gender') || '';
    const ageGroup = searchParams.get('ageGroup') || '';

    if (!id) {
        return NextResponse.json(
            { error: 'Event ID is required' },
            { status: 400 }
        );
    }

    try {
        const params = new URLSearchParams({ id });
        if (gender) params.append('gender', gender);
        if (ageGroup) params.append('ageGroup', ageGroup);

        const res = await fetch(
            `${BACKEND_URL}/public-api/campaign/getAllParticipantByEvent?${params.toString()}`,
            {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch runners' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching runners:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/runners`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
            return NextResponse.json(errData, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating runner:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
