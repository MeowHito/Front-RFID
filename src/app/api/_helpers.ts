import { NextRequest } from 'next/server';

export const BACKEND_URL = process.env.BACKEND_URL || 'http://3.26.160.149:3001';

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
