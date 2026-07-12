'use client';

import { useParams } from 'next/navigation';
import ESlipView from '@/components/eslip/ESlipView';

/**
 * Pretty public e-slip URL: /<eventSlug>/<bib>
 * e.g. live.action.in.th/buriram-10-thunder-speed-2026/1234
 * Resolves the campaign slug + runner BIB to the e-slip via /api/eslip/:slug/:bib.
 */
export default function EslipBySlugBibPage() {
    const params = useParams();
    const eventSlug = params.eventSlug as string;
    const bib = params.bib as string;
    return <ESlipView apiUrl={`/api/eslip/${encodeURIComponent(eventSlug)}/${encodeURIComponent(bib)}`} />;
}
