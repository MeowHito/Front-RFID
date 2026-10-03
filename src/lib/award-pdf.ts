// PDF export of one admin-built award (the "Download PDF" button on /Award-Results/[slug]).
//
// The pages are laid out as real DOM (A4 at 96 dpi), split row-by-row by measuring, then
// snapshotted with html-to-image and placed into jsPDF as images. jsPDF's own text
// renderer has no Thai shaping (vowels / tone marks float or overlap), so letting the
// browser draw the text is the only way Thai names come out right.

import {
    PERSONAL_FIELDS,
    personalFieldValue,
    type CustomAward,
    type CustomAwardGroup,
} from '@/lib/custom-awards';

const A4_SHORT = 794;
const A4_LONG = 1123;
const PAD = 36;
const FOOTER_H = 24;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.style.cssText = style;
    if (text != null) node.textContent = text;
    return node;
}

function safeFileName(s: string): string {
    return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'award';
}

export async function downloadCustomAwardPdf(opts: {
    award: CustomAward;
    groups: CustomAwardGroup[];
    language: 'th' | 'en';
    eventName: string;
    /** Category heading as shown on the page, e.g. "Mini Marathon (10 KM)". */
    categoryTitle: string;
    eventDate?: string;
}): Promise<void> {
    const [{ jsPDF }, { toJpeg, getFontEmbedCSS }] = await Promise.all([import('jspdf'), import('html-to-image')]);
    const { award, groups, language, eventName, categoryTitle, eventDate } = opts;
    const th = language === 'th';
    const cols = PERSONAL_FIELDS.filter(f => award.personalFields.includes(f.key));
    const landscape = cols.length > 5;
    const W = landscape ? A4_LONG : A4_SHORT;
    const H = landscape ? A4_SHORT : A4_LONG;
    const contentMax = H - PAD * 2 - FOOTER_H;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const showGroupLabel = award.type !== 'overall';
    const visibleGroups = groups.filter(g => !(g.runners.length === 0 && award.type === 'ageGroup'));

    // Same column weights as CustomAwardResults so the PDF reads like the page.
    const colWeight = (key: string) => (key === 'name' ? 3 : 1);
    const totalWeight = cols.reduce((sum, c) => sum + colWeight(c.key), 0);
    const placeW = 64;

    const dateText = eventDate
        ? new Date(eventDate).toLocaleDateString(th ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
    const printedAt = new Date().toLocaleString(th ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    // Off-screen host: laid out (so heights can be measured) but never visible.
    const host = el('div', `position:fixed;left:-${W * 3}px;top:0;width:${W}px;pointer-events:none;`);
    document.body.appendChild(host);

    const pages: HTMLDivElement[] = [];
    let content!: HTMLDivElement;

    const newPage = () => {
        const page = el('div', `position:relative;box-sizing:border-box;width:${W}px;height:${H}px;padding:${PAD}px;background:#fff;color:#0f172a;font-family:${fontFamily};overflow:hidden;`);
        content = el('div', 'display:flex;flex-direction:column;gap:14px;');
        page.appendChild(content);
        if (pages.length === 0) {
            const head = el('div', 'background:#0f172a;border-radius:10px;padding:16px 20px;color:#fff;');
            if (eventName) head.appendChild(el('div', 'font-size:13px;color:#cbd5e1;margin-bottom:4px;', [eventName, dateText].filter(Boolean).join(' · ')));
            const title = el('div', 'display:flex;flex-wrap:wrap;align-items:baseline;column-gap:12px;font-size:22px;font-weight:800;line-height:1.35;');
            title.appendChild(el('span', 'color:#fcd34d;', categoryTitle));
            title.appendChild(el('span', '', award.name));
            head.appendChild(title);
            content.appendChild(head);
        } else {
            content.appendChild(el('div', 'font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;',
                `${categoryTitle} · ${award.name}${eventName ? ` — ${eventName}` : ''}`));
        }
        page.appendChild(el('div', `position:absolute;left:${PAD}px;right:${PAD}px;bottom:${PAD - 8}px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;`));
        host.appendChild(page);
        pages.push(page);
    };

    const fits = () => content.offsetHeight <= contentMax;

    /** Group label + table head; returns the tbody to fill. */
    const startBlock = (g: CustomAwardGroup, continued: boolean) => {
        const block = el('div', '');
        if (showGroupLabel) {
            const label = el('div', 'display:flex;align-items:center;gap:8px;margin-bottom:6px;');
            label.appendChild(el('span', 'background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;', th ? g.labelTh : g.label));
            label.appendChild(el('span', 'font-size:11px;color:#94a3b8;',
                `${g.runners.length} ${th ? 'คน' : 'runners'}${continued ? (th ? ' (ต่อ)' : ' (cont.)') : ''}`));
            block.appendChild(label);
        }
        const table = el('table', 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;border:1px solid #e5e7eb;');
        const colgroup = el('colgroup', '');
        colgroup.appendChild(el('col', `width:${placeW}px;`));
        cols.forEach(c => colgroup.appendChild(el('col', `width:${(colWeight(c.key) / Math.max(totalWeight, 1)) * 100}%;`)));
        table.appendChild(colgroup);
        const thead = el('thead', 'background:#f8fafc;');
        const hr = el('tr', '');
        const thStyle = 'padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;';
        hr.appendChild(el('th', thStyle + 'text-align:center;', th ? 'อันดับ' : 'Place'));
        cols.forEach(c => hr.appendChild(el('th', thStyle, c.label)));
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = el('tbody', '');
        table.appendChild(tbody);
        block.appendChild(table);
        content.appendChild(block);
        return { block, tbody };
    };

    const makeRow = (cells: { text: string; style?: string }[]) => {
        const tr = el('tr', '');
        cells.forEach(c => tr.appendChild(el('td', `padding:7px 10px;border-top:1px solid #f1f5f9;word-break:break-word;vertical-align:top;${c.style || ''}`, c.text)));
        return tr;
    };

    try {
        newPage();

        if (visibleGroups.every(g => g.runners.length === 0)) {
            content.appendChild(el('div', 'padding:40px 0;text-align:center;font-size:14px;color:#94a3b8;',
                th ? 'ยังไม่มีผู้เข้าเส้นชัยในระยะนี้' : 'No finishers in this distance yet'));
        }

        for (const g of visibleGroups) {
            const rows = g.runners.length === 0
                ? [makeRow([{ text: th ? 'ไม่มีผู้เข้าเส้นชัย' : 'No finishers', style: 'text-align:center;color:#94a3b8;font-size:12px;' }])]
                : g.runners.map(row => makeRow([
                    { text: String(row.place), style: 'text-align:center;font-weight:700;' },
                    ...cols.map(c => {
                        const v = personalFieldValue(c.key, row, language);
                        return { text: v === '' || v == null ? '-' : String(v) };
                    }),
                ]));
            if (g.runners.length === 0) rows[0].firstElementChild?.setAttribute('colspan', String(1 + cols.length));

            let { block, tbody } = startBlock(g, false);
            // Keep the group heading with at least its first row.
            tbody.appendChild(rows[0]);
            if (!fits() && content.childElementCount > 1) {
                block.remove();
                newPage();
                ({ block, tbody } = startBlock(g, false));
                tbody.appendChild(rows[0]);
            }
            for (let i = 1; i < rows.length; i++) {
                tbody.appendChild(rows[i]);
                if (fits()) continue;
                rows[i].remove();
                newPage();
                ({ block, tbody } = startBlock(g, true));
                tbody.appendChild(rows[i]);
            }
        }

        pages.forEach((page, i) => {
            const footer = page.lastElementChild as HTMLElement;
            footer.appendChild(el('span', '', `${th ? 'พิมพ์เมื่อ' : 'Printed'} ${printedAt}`));
            footer.appendChild(el('span', '', `${th ? 'หน้า' : 'Page'} ${i + 1} / ${pages.length}`));
        });

        if (document.fonts?.ready) await document.fonts.ready;
        const fontEmbedCSS = await getFontEmbedCSS(pages[0]).catch(() => undefined);
        const shotOpts = { width: W, height: H, pixelRatio: 2, quality: 0.92, backgroundColor: '#ffffff', fontEmbedCSS };
        // Safari/iOS: the first snapshot can come out without fonts — prime once (same trick as ESlipView).
        await toJpeg(pages[0], shotOpts).catch(() => {});

        const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        for (let i = 0; i < pages.length; i++) {
            const img = await toJpeg(pages[i], shotOpts);
            if (i > 0) pdf.addPage();
            pdf.addImage(img, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
        }

        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeFileName(`${categoryTitle} ${award.name}`)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
        host.remove();
    }
}
