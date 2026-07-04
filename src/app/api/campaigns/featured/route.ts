import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
    const full = request.nextUrl.searchParams.get('full');
    const qs = full === 'true' || full === '1' ? '?full=true' : '';
    try {
        // Forward the caller's identity so the backend can return THIS user's selected
        // campaign. Pages fetch featured without an Authorization header, so fall back to
        // the auth_token cookie (set at login). Anonymous → backend returns global featured.
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const authHeader = request.headers.get('authorization');
        const cookieToken = request.cookies.get('auth_token')?.value;
        if (authHeader) headers['Authorization'] = authHeader;
        else if (cookieToken) headers['Authorization'] = `Bearer ${cookieToken}`;

        const res = await fetch(`${BACKEND_URL}/campaigns/featured${qs}`, {
            headers,
            cache: 'no-store',
        });

        if (!res.ok) {
            if (res.status === 404) return NextResponse.json(null);
            return NextResponse.json(
                { error: 'Failed to fetch featured campaign' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching featured campaign:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
