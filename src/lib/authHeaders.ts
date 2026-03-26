/**
 * Build headers for browser-side fetch calls that need authentication.
 * Reads the JWT token from localStorage and includes it as Authorization header.
 */
export function authHeaders(contentType = 'application/json'): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return headers;
}
