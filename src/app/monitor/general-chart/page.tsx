'use client';

/**
 * Public single-panel screen for a monitor at race HQ.
 *
 * Deliberately outside /admin: a display hung on a wall should not have to log
 * in. It renders the very same charts as the statistics page — the panel, the
 * category and the campaign all come from the query string, which the "ขึ้นจอ"
 * buttons on /admin/general-chart build.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GeneralChartView, type MonitorPanel } from '../../admin/general-chart/page';

const PANELS: MonitorPanel[] = ['passed', 'current', 'course'];

function MonitorContent() {
    const sp = useSearchParams();
    const panelParam = sp.get('panel') as MonitorPanel | null;
    const panel: MonitorPanel = panelParam && PANELS.includes(panelParam) ? panelParam : 'course';
    const cat = sp.get('cat') || '';
    const view = sp.get('view');

    if (!cat) {
        return (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'sans-serif' }}>
                ต้องระบุระยะในลิงก์ เช่น ?panel=course&amp;cat=42K — เปิดหน้านี้จากปุ่ม &quot;ขึ้นจอ&quot; ในหน้ากราฟสถิติ
            </div>
        );
    }

    return (
        <GeneralChartView
            monitor={{
                panel,
                cat,
                campaignId: sp.get('campaign') || undefined,
                view: view === '2d' || view === 'map' || view === 'graph' ? view : undefined,
            }}
        />
    );
}

export default function MonitorPage() {
    return (
        <Suspense fallback={null}>
            <MonitorContent />
        </Suspense>
    );
}
