'use client';

import BibLayoutDesigner, { type BibDesignerConfig } from '@/components/bib-designer/BibLayoutDesigner';
import { defaultFinishTimeLayout } from '@/lib/bibcheck2';

// Same Canva-style designer as Check BIB 2, saved to its own campaign field and
// shown on /finish-time/[slug]: scan a bib → the BIB and its Gun Time appear on
// the finisher banner.
const CONFIG: BibDesignerConfig = {
    layoutField: 'finishTimeLayout',
    templatesKey: 'finishtime_templates',
    liveBase: '/finish-time',
    title: '⏱ สแกนโชว์เวลา — Finish Time Display',
    breadcrumb: [{ label: 'สแกนโชว์เวลา', labelEn: 'Finish Time Display' }],
    defaultLayout: defaultFinishTimeLayout,
};

export default function FinishTimeDesignerPage() {
    return <BibLayoutDesigner config={CONFIG} />;
}
