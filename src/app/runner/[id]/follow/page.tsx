'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function RunnerFollowPage() {
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;

    useEffect(() => {
        if (!runnerId) return;
        router.replace(`/runner/${runnerId}`);
    }, [runnerId, router]);

    return null;
}
