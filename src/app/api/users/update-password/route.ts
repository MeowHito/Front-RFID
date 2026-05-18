import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const res = await fetch(`${BACKEND_URL}/users/update-password`, {
            method: 'POST',
            headers: proxyHeaders(request),
            body: JSON.stringify(body),
        });

        const text = await res.text();
        let data: any = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { error: text || 'Failed to update password' };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error updating password:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
