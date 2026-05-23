import { NextRequest } from 'next/server';

export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/** Parse JSON from a fetch Response, returning fallback if the body is empty. */
export async function safeJson<T = unknown>(res: Response, fallback: T = {} as T): Promise<T> {
    const text = await res.text();
    if (!text.trim()) return fallback;
    return JSON.parse(text) as T;
}

/**
 * Build headers for proxying to the backend, forwarding the Authorization header if present.
 */
export function proxyHeaders(request: NextRequest, extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extra,
    };
    const auth = request.headers.get('authorization');
    if (auth) {
        headers['Authorization'] = auth;
    }
    return headers;
}
