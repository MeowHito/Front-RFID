'use client';

import { useParams } from 'next/navigation';
import ESlipView from '@/components/eslip/ESlipView';

export default function ESlipPage() {
    const params = useParams();
    const runnerId = params.id as string;
    return <ESlipView apiUrl={`/api/runner/${runnerId}`} />;
}
