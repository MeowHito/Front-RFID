import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../_helpers';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ uuid: string }> }
) {
    const { uuid } = await params;

    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND_URL}/users/profile/${uuid}`, {
            method: 'PUT',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        const text = await res.text();
        let data: any = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { error: text || 'Failed to update profile' };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uuid: string }> }
) {
    const { uuid } = await params;

    try {
        const res = await fetch(`${BACKEND_URL}/users/uuid/${uuid}`, {
            headers: proxyHeaders(request),
            cache: 'no-store',
        });

        const text = await res.text();
        let data: any = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { error: text || 'User not found' };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
