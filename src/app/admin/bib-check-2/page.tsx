'use client';

import BibLayoutDesigner, { type BibDesignerConfig } from '@/components/bib-designer/BibLayoutDesigner';
import { defaultBibCheck2Layout } from '@/lib/bibcheck2';

const CONFIG: BibDesignerConfig = {
    layoutField: 'bibCheck2Layout',
    templatesKey: 'bibcheck2_templates',
    liveBase: '/scanning-custom',
    title: '🎨 เช็คบิบ2 — Check BIB 2',
    breadcrumb: [{ label: 'เช็คบิบ2', labelEn: 'Check BIB 2' }],
    defaultLayout: defaultBibCheck2Layout,
};

export default function BibCheck2Page() {
    return <BibLayoutDesigner config={CONFIG} />;
}
