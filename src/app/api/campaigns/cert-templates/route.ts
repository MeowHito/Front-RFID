import { NextResponse } from 'next/server';
import { BACKEND_URL } from '../../_helpers';

export async function GET() {
    try {
        const res = await fetch(`${BACKEND_URL}/campaigns/cert-templates`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch cert templates' }, { status: res.status });
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching cert templates:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
