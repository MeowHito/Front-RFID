import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, proxyHeaders } from '../../../../../_helpers';

// Unlinks one checkpoint from one event. The Checkpoint doc is shared campaign-wide,
// so removing a checkpoint from a single distance must not delete the doc itself.
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ checkpointId: string; eventId: string }> }
) {
    const { checkpointId, eventId } = await params;

    try {
        const res = await fetch(`${BACKEND_URL}/checkpoints/mapping/unlink/${checkpointId}/${eventId}`, {
            method: 'DELETE',
            headers: proxyHeaders(request),
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: errorData || 'Failed to unlink checkpoint' },
                { status: res.status }
            );
        }

        const text = await res.text();
        const data = text ? JSON.parse(text) : { success: true };
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error unlinking checkpoint from event:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
