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

    if (fLeft) {
        try {
            const li = await loadImg(fLeft);
            const s = Math.min(1, maxImgH / li.height, 200 / li.width);
            ctx.drawImage(li, PAD, imgTop, li.width * s, li.height * s);
        } catch { /* image load failed, skip */ }
    }

    // Right side: optional image + signature line + "ผู้จัดงาน"
    const signW = 240;
    const signX = A4_W - PAD - signW;
    const lineY = canvasH - 55;

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
