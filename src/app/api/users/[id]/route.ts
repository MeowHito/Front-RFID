import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../_helpers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND_URL}/users/${id}`, {
            headers: proxyHeaders(req),
            cache: 'no-store',
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const res = await fetch(`${BACKEND_URL}/users/${id}`, {
            method: 'PUT',
            headers: proxyHeaders(req),
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND_URL}/users/${id}`, {
            method: 'DELETE',
            headers: proxyHeaders(req),
        });
        if (!res.ok) {
            const text = await res.text();
            let errData: any = { error: 'Delete failed' };
            try { errData = JSON.parse(text); } catch { errData = { error: text || 'Delete failed' }; }
            return NextResponse.json(errData, { status: res.status });
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : { success: true };
        return NextResponse.json(data, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
