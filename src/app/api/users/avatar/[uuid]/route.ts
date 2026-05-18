import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

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

        const headers: Record<string, string> = {};
        const auth = request.headers.get('authorization');
        if (auth) headers['Authorization'] = auth;

        const res = await fetch(`${BACKEND_URL}/users/avatar/${uuid}`, {
            method: 'POST',
            headers,
            body: backendFormData,
        });

        const text = await res.text();
        let data: any = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { error: text || 'Failed to upload avatar' };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
