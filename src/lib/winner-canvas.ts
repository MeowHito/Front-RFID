/** A4 canvas builder for winner result images */

const A4_W = 1240;
const PAD = 48;
const HDR_H = 108;
const FTR_H = 220;
const GAP = 10;
const CW = A4_W - 2 * PAD;

function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Builds an A4-sized PNG canvas from one or more DOM elements stacked vertically.
 * Adds a title header and a footer with configured left/right images + signature line.
 */
export async function buildA4Canvas(
    elements: HTMLElement[],
    title: string,
    subtitle: string,
    accentColor: string
): Promise<HTMLCanvasElement | null> {
    const { toPng } = await import('html-to-image');

    // Capture each section
    const sectionImgs: HTMLImageElement[] = [];
    for (const el of elements) {
        const dataUrl = await toPng(el, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            filter: (node: Element) => !node.hasAttribute?.('data-no-capture'),
        });
        await new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => { sectionImgs.push(img); res(); };
            img.src = dataUrl;
        });
    }
    if (!sectionImgs.length) return null;

    // Scale sections to content width
    const scaled = sectionImgs.map(img => ({
        img,
        w: CW,
        h: Math.round(img.height * (CW / img.width)),
    }));

    const contentH = scaled.reduce((s, si) => s + si.h, 0) + Math.max(0, scaled.length - 1) * GAP;
    const canvasH = Math.max(1754, PAD + HDR_H + GAP + contentH + FTR_H);

    const canvas = document.createElement('canvas');
    canvas.width = A4_W;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, canvasH);

    // Header
    let y = PAD;
    ctx.textAlign = 'center';
    if (title) {
        ctx.font = 'bold 26px Prompt, Sarabun, Arial, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(title, A4_W / 2, y + 30);
    }
    if (subtitle) {
        ctx.font = '18px Prompt, Sarabun, Arial, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(subtitle, A4_W / 2, y + 62);
    }
    // Accent line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y + HDR_H - 8);
    ctx.lineTo(A4_W - PAD, y + HDR_H - 8);
    ctx.stroke();
    y += HDR_H + GAP;

    // Sections
    for (const si of scaled) {
        ctx.drawImage(si.img, PAD, y, si.w, si.h);
        y += si.h + GAP;
    }

    // Footer divider line
    const fY = canvasH - FTR_H;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, fY);
    ctx.lineTo(A4_W - PAD, fY);
    ctx.stroke();

    // Footer images from localStorage
    const fLeft = typeof window !== 'undefined' ? localStorage.getItem('winner_dl_footer_left') : null;
    const fRight = typeof window !== 'undefined' ? localStorage.getItem('winner_dl_footer_right') : null;
    const maxImgH = FTR_H - 65;
    const imgTop = fY + 18;

    // Right side constants (declared early so left logo can reference lineY)
    const signW = 240;
    const signX = A4_W - PAD - signW;
    const lineY = canvasH - 55;

    if (fLeft) {
        try {
            const li = await loadImg(fLeft);
            const maxLeftH = 60;
            const maxLeftW = 200;
            const s = Math.min(1, maxLeftH / li.height, maxLeftW / li.width);
            const liW = li.width * s;
            const liH = li.height * s;
            // Align vertically with "ผู้จัดงาน" text at lineY + 26
            const logoY = lineY + 13 - liH / 2;
            ctx.drawImage(li, PAD, logoY, liW, liH);
        } catch { /* image load failed, skip */ }
    }

    if (fRight) {
        try {
            const ri = await loadImg(fRight);
            const s = Math.min(1, maxImgH / ri.height, signW / ri.width);
            const riW = ri.width * s;
            const riH = ri.height * s;
            ctx.drawImage(ri, signX + (signW - riW) / 2, imgTop, riW, riH);
        } catch { /* image load failed, skip */ }
    }

    // Signature line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(signX, lineY);
    ctx.lineTo(signX + signW, lineY);
    ctx.stroke();

    ctx.font = '16px Prompt, Sarabun, Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('ผู้จัดงาน', signX + signW / 2, lineY + 26);

    return canvas;
}

export function triggerDownload(canvas: HTMLCanvasElement, filename: string) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ─── Landscape table canvas ───────────────────────────────────────────────────

const L_W = 1754;
const L_PAD = 72;
const L_HDR_H = 140;
const L_SEC_HDR_H = 58;
const L_COL_HDR_H = 42;
const L_ROW_H = 52;
const L_SEC_GAP = 32;
const L_AG_HDR_H = 50;
const L_FTR_H = 160;
const L_TABLE_W = L_W - 2 * L_PAD;
const L_POS_W = 70;
const L_BIB_W = 100;
const L_GUN_W = 185;
const L_NET_W = 185;
const L_NAME_W = L_TABLE_W - L_POS_W - L_BIB_W - L_GUN_W - L_NET_W;

function fmtMs(ms: number | undefined | null): string {
    if (!ms || ms <= 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

export interface LandscapeRunner {
    bib: string;
    firstName: string;
    lastName: string;
    gunTimeStr?: string;
    netTimeStr?: string;
    gunTime?: number;
    netTime?: number;
}

export interface LandscapeSection {
    label?: string;
    maleRunners: LandscapeRunner[];
    femaleRunners: LandscapeRunner[];
    maleColor?: string;
    femaleColor?: string;
}

function calcLandscapeH(sections: LandscapeSection[]): number {
    let h = L_PAD + L_HDR_H;
    for (const sec of sections) {
        if (sec.label) h += L_AG_HDR_H;
        h += L_SEC_HDR_H + L_COL_HDR_H + sec.maleRunners.length * L_ROW_H;
        h += L_SEC_HDR_H + L_COL_HDR_H + sec.femaleRunners.length * L_ROW_H;
        h += L_SEC_GAP;
    }
    h += L_FTR_H + L_PAD;
    return Math.max(900, h);
}

export async function buildLandscapeTableCanvas(
    title: string,
    subtitle: string,
    sections: LandscapeSection[],
    defaultMaleColor = '#2563eb',
    defaultFemaleColor = '#db2777',
): Promise<HTMLCanvasElement | null> {
    if (!sections.length) return null;

    const H = calcLandscapeH(sections);
    const canvas = document.createElement('canvas');
    canvas.width = L_W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const RANK_BG = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const RANK_FG = ['#000', '#fff', '#fff', '#475569', '#475569'];

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, L_W, H);

    // Header
    let y = L_PAD;
    ctx.textAlign = 'center';
    if (title) {
        ctx.font = 'bold 42px Prompt, Sarabun, Arial, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(title, L_W / 2, y + 46);
    }
    if (subtitle) {
        ctx.font = 'bold 30px Prompt, Sarabun, Arial, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(subtitle, L_W / 2, y + 90);
    }
    ctx.strokeStyle = defaultMaleColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(L_PAD, y + L_HDR_H - 8);
    ctx.lineTo(L_W - L_PAD, y + L_HDR_H - 8);
    ctx.stroke();
    y += L_HDR_H;

    const drawGenderTable = (
        runners: LandscapeRunner[],
        secTitle: string,
        secColor: string,
    ) => {
        // Section header bar
        ctx.fillStyle = secColor;
        ctx.fillRect(L_PAD, y, L_TABLE_W, L_SEC_HDR_H);
        ctx.font = 'bold 26px Prompt, Sarabun, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(secTitle, L_PAD + 22, y + L_SEC_HDR_H / 2 + 9);
        y += L_SEC_HDR_H;

        // Column header row
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(L_PAD, y, L_TABLE_W, L_COL_HDR_H);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(L_PAD, y, L_TABLE_W, L_COL_HDR_H);

        const drawHdr = (label: string, x: number, w: number, align: 'left' | 'center' | 'right') => {
            ctx.font = 'bold 15px Prompt, Sarabun, Arial, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = align;
            const tx = align === 'right' ? x + w - 12 : align === 'center' ? x + w / 2 : x + 12;
            ctx.fillText(label, tx, y + L_COL_HDR_H / 2 + 5);
        };
        let cx = L_PAD;
        drawHdr('POS.', cx, L_POS_W, 'center'); cx += L_POS_W;
        drawHdr('BIB', cx, L_BIB_W, 'center'); cx += L_BIB_W;
        drawHdr('NAME', cx, L_NAME_W, 'left'); cx += L_NAME_W;
        drawHdr('GUN TIME', cx, L_GUN_W, 'right'); cx += L_GUN_W;
        drawHdr('NET TIME', cx, L_NET_W, 'right');
        y += L_COL_HDR_H;

        for (let i = 0; i < runners.length; i++) {
            const r = runners[i];
            ctx.fillStyle = i === 0 ? '#fffbeb' : i % 2 === 0 ? '#f8fafc' : '#ffffff';
            ctx.fillRect(L_PAD, y, L_TABLE_W, L_ROW_H);
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(L_PAD, y + L_ROW_H);
            ctx.lineTo(L_PAD + L_TABLE_W, y + L_ROW_H);
            ctx.stroke();

            cx = L_PAD;
            // Rank badge
            const bg = RANK_BG[i] || '#e2e8f0';
            const fg = RANK_FG[i] || '#475569';
            const bsz = 36;
            const bx = cx + (L_POS_W - bsz) / 2;
            const by = y + (L_ROW_H - bsz) / 2;
            ctx.fillStyle = bg;
            rrect(ctx, bx, by, bsz, bsz, 6);
            ctx.fill();
            ctx.font = 'bold 16px Prompt, Sarabun, Arial, sans-serif';
            ctx.fillStyle = fg;
            ctx.textAlign = 'center';
            ctx.fillText(String(i + 1), bx + bsz / 2, by + bsz / 2 + 6);
            cx += L_POS_W;

            // BIB
            ctx.font = 'bold 17px Prompt, Sarabun, Arial, sans-serif';
            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'center';
            ctx.fillText(r.bib, cx + L_BIB_W / 2, y + L_ROW_H / 2 + 6);
            cx += L_BIB_W;

            // Name (truncate if needed)
            ctx.textAlign = 'left';
            ctx.font = 'bold 18px Prompt, Sarabun, Arial, sans-serif';
            ctx.fillStyle = '#1e293b';
            const full = `${r.firstName} ${r.lastName}`.toUpperCase();
            const maxW = L_NAME_W - 20;
            let display = full;
            if (ctx.measureText(display).width > maxW) {
                while (ctx.measureText(display + '…').width > maxW && display.length > 1) display = display.slice(0, -1);
                display += '…';
            }
            ctx.fillText(display, cx + 12, y + L_ROW_H / 2 + 6);
            cx += L_NAME_W;

            // Times
            ctx.font = '800 18px "Courier New", monospace';
            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'right';
            ctx.fillText(r.gunTimeStr || fmtMs(r.gunTime), cx + L_GUN_W - 12, y + L_ROW_H / 2 + 6);
            cx += L_GUN_W;
            ctx.fillText(r.netTimeStr || fmtMs(r.netTime), cx + L_NET_W - 12, y + L_ROW_H / 2 + 6);

            y += L_ROW_H;
        }
    };

    for (const sec of sections) {
        // Optional age group label bar
        if (sec.label) {
            ctx.fillStyle = '#1e3a5f';
            ctx.fillRect(L_PAD, y, L_TABLE_W, L_AG_HDR_H);
            ctx.font = 'bold 22px Prompt, Sarabun, Arial, sans-serif';
            ctx.fillStyle = '#e2e8f0';
            ctx.textAlign = 'center';
            ctx.fillText(`กลุ่มอายุ ${sec.label}`, L_W / 2, y + L_AG_HDR_H / 2 + 8);
            y += L_AG_HDR_H;
        }

        drawGenderTable(sec.maleRunners, '♂ MALE', sec.maleColor ?? defaultMaleColor);
        drawGenderTable(sec.femaleRunners, '♀ FEMALE', sec.femaleColor ?? defaultFemaleColor);
        y += L_SEC_GAP;
    }

    // Footer
    const fY = H - L_FTR_H;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L_PAD, fY);
    ctx.lineTo(L_W - L_PAD, fY);
    ctx.stroke();

    const fLeft = typeof window !== 'undefined' ? localStorage.getItem('winner_dl_footer_left') : null;
    const fRight = typeof window !== 'undefined' ? localStorage.getItem('winner_dl_footer_right') : null;
    const signW = 240;
    const signX = L_W - L_PAD - signW;
    const lineY = H - 50;
    const imgTop = fY + 15;
    const maxImgH = L_FTR_H - 65;

    if (fLeft) {
        try {
            const li = await loadImg(fLeft);
            const s = Math.min(1, 55 / li.height, 200 / li.width);
            ctx.drawImage(li, L_PAD, lineY + 8 - (li.height * s) / 2, li.width * s, li.height * s);
        } catch { /* skip */ }
    }
    if (fRight) {
        try {
            const ri = await loadImg(fRight);
            const s = Math.min(1, maxImgH / ri.height, signW / ri.width);
            ctx.drawImage(ri, signX + (signW - ri.width * s) / 2, imgTop, ri.width * s, ri.height * s);
        } catch { /* skip */ }
    }

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(signX, lineY);
    ctx.lineTo(signX + signW, lineY);
    ctx.stroke();
    ctx.font = '16px Prompt, Sarabun, Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('ผู้จัดงาน', signX + signW / 2, lineY + 22);

    return canvas;
}
