import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ uuid: string }> }
) {
    const { uuid } = await params;

    try {
        const formData = await request.formData();
        const file = formData.get('avatar') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Forward the file to backend
        const backendFormData = new FormData();
        backendFormData.append('avatar', file);

        const res = await fetch(`${BACKEND_URL}/users/avatar/${uuid}`, {
            method: 'POST',
            body: backendFormData,
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: errorData || 'Failed to upload avatar' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error uploading avatar:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
