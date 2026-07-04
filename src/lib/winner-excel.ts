/** Excel builder for winner result exports — landscape A4, male/female side-by-side */

export interface ExcelRunner {
    bib: string;
    firstName: string;
    lastName: string;
    gunTimeStr?: string;
    netTimeStr?: string;
    gunTime?: number;
    netTime?: number;
}

export interface ExcelSection {
    label?: string;
    maleRunners: ExcelRunner[];
    femaleRunners: ExcelRunner[];
}

function fmtMs(ms: number | undefined | null): string {
    if (!ms || ms <= 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ARGB color helpers
function argb(hex: string) { return hex.startsWith('FF') ? hex : `FF${hex}`; }
function fill(hex: string) {
    return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(hex) } };
}
function thinBorder(hex = 'E2E8F0') {
    return { style: 'thin' as const, color: { argb: argb(hex) } };
}

const CLR = {
    MALE: '2563EB',
    FEMALE: 'DB2777',
    AGE_BAR: '1E3A5F',
    M_COL_HDR: 'DBEAFE',   // blue-100
    F_COL_HDR: 'FCE7F3',   // pink-100
    ROW_GOLD: 'FFFBEB',
    ROW_EVEN: 'F8FAFC',
    WHITE: 'FFFFFF',
    TITLE_BG: 'F0F9FF',
    TXT_DARK: '1E293B',
    TXT_MID: '475569',
    TXT_LIGHT: '94A3B8',
    TXT_EMPTY: 'CBD5E1',
    TXT_WHITE: 'FFFFFF',
};

// ── Sizing constants ────────────────────────────────────────────────────────
// Column widths for "both" layout (A–E Male | F spacer | G–K Female)
const COLS_BOTH = [
    { width: 7 },   // A  POS male
    { width: 11 },  // B  BIB male
    { width: 32 },  // C  NAME male
    { width: 14 },  // D  GUN male
    { width: 14 },  // E  NET male
    { width: 2 },   // F  spacer
    { width: 7 },   // G  POS female
    { width: 11 },  // H  BIB female
    { width: 32 },  // I  NAME female
    { width: 14 },  // J  GUN female
    { width: 14 },  // K  NET female
];

// Column widths for single-gender layout (A–E only)
const COLS_SINGLE = [
    { width: 8 },
    { width: 13 },
    { width: 44 },
    { width: 16 },
    { width: 16 },
];

// Compact sizing — age group + gender share a single header row and rows are
// shorter so several age groups fit on one A4 page.
const ROW_H = {
    TITLE: 28,
    SUBTITLE: 18,
    AGE_BAR: 22,
    GENDER_HDR: 22,
    COL_HDR: 15,
    DATA: 18,
    FOOTER_SIG: 22,
    FOOTER_LBL: 18,
};

const FONT_SZ = {
    TITLE: 17,
    SUBTITLE: 12,
    AGE_BAR: 11,
    GENDER_HDR: 12,
    COL_HDR: 9,
    DATA: 11,
    FOOTER: 10,
};

export async function buildWinnersExcel(
    title: string,
    subtitle: string,
    sections: ExcelSection[],
    showGender: 'male' | 'female' | 'both' = 'both',
    opts?: { combinedLabel?: string; barColor?: string },
): Promise<Blob | null> {
    const ExcelJS = (await import('exceljs')).default;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'RFID Timing';
    wb.created = new Date();

    const ws = wb.addWorksheet('Winners');

    // ── Page setup: landscape A4 ──────────────────────────────────────────────
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.paperSize = 9;          // A4
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;        // unlimited pages tall
    ws.pageSetup.horizontalCentered = true;

    ws.pageSetup.margins = {
        left: 0.4, right: 0.4,
        top: 0.5, bottom: 0.7,          // extra bottom for footer
        header: 0.2, footer: 0.3,
    };

    const isBoth = showGender === 'both';
    const totalCols = isBoth ? 11 : 5;

    ws.columns = isBoth ? COLS_BOTH : COLS_SINGLE;

    let row = 1;

    // ── Title / subtitle banners ──────────────────────────────────────────────
    const addBanner = (text: string, isTitle: boolean) => {
        ws.mergeCells(row, 1, row, totalCols);
        const c = ws.getCell(row, 1);
        c.value = text;
        c.font = {
            bold: true,
            size: isTitle ? FONT_SZ.TITLE : FONT_SZ.SUBTITLE,
            color: { argb: argb(isTitle ? CLR.TXT_DARK : CLR.TXT_MID) },
            name: 'Calibri',
        };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = fill(isTitle ? CLR.TITLE_BG : CLR.WHITE);
        ws.getRow(row).height = isTitle ? ROW_H.TITLE : ROW_H.SUBTITLE;
        row++;
    };

    if (title) addBanner(title, true);
    if (subtitle) addBanner(subtitle, false);
    row++; // blank gap

    // ── Helper: gender header bar ─────────────────────────────────────────────
    const addGenderBar = (label: string, color: string, c1: number, c2: number) => {
        ws.mergeCells(row, c1, row, c2);
        const c = ws.getCell(row, c1);
        c.value = label;
        c.fill = fill(color);
        c.font = { bold: true, size: FONT_SZ.GENDER_HDR, color: { argb: argb(CLR.TXT_WHITE) }, name: 'Calibri' };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(row).height = ROW_H.GENDER_HDR;
    };

    // ── Helper: column header row ─────────────────────────────────────────────
    const addColHdr = (startCol: number, bgColor: string) => {
        const labels = ['POS', 'BIB', 'NAME', 'GUN TIME', 'NET TIME'];
        const aligns: ('center' | 'left' | 'right')[] = ['center', 'center', 'left', 'right', 'right'];
        for (let i = 0; i < 5; i++) {
            const c = ws.getCell(row, startCol + i);
            c.value = labels[i];
            c.fill = fill(bgColor);
            c.font = { bold: true, size: FONT_SZ.COL_HDR, color: { argb: argb(CLR.TXT_MID) }, name: 'Calibri' };
            c.alignment = { horizontal: aligns[i], vertical: 'middle' };
            c.border = { bottom: thinBorder() };
        }
        ws.getRow(row).height = ROW_H.COL_HDR;
    };

    // ── Helper: data row ──────────────────────────────────────────────────────
    const addDataRow = (runner: ExcelRunner | null, idx: number, startCol: number) => {
        const bg = idx === 0 ? CLR.ROW_GOLD : idx % 2 === 0 ? CLR.ROW_EVEN : CLR.WHITE;
        const aligns: ('center' | 'left' | 'right')[] = ['center', 'center', 'left', 'right', 'right'];

        const vals = runner
            ? [
                idx + 1,
                runner.bib,
                `${runner.firstName} ${runner.lastName}`.toUpperCase(),
                runner.gunTimeStr || fmtMs(runner.gunTime),
                runner.netTimeStr || fmtMs(runner.netTime),
            ]
            : [idx + 1, '', '—', '', ''];

        for (let i = 0; i < 5; i++) {
            const c = ws.getCell(row, startCol + i);
            c.value = vals[i];
            c.fill = fill(bg);
            c.font = {
                bold: runner ? (i === 0 || i >= 3) : false,
                size: FONT_SZ.DATA,
                color: { argb: argb(runner ? CLR.TXT_DARK : CLR.TXT_EMPTY) },
                italic: !runner && i === 2,
                name: i >= 3 ? 'Courier New' : 'Calibri',
            };
            c.alignment = { horizontal: aligns[i], vertical: 'middle' };
            c.border = { bottom: thinBorder('F1F5F9') };
        }
        ws.getRow(row).height = ROW_H.DATA;
    };

    // ── Helper: fill spacer column cells ─────────────────────────────────────
    const clearSpacer = () => {
        const c = ws.getCell(row, 6);
        c.fill = fill(CLR.WHITE);
        c.border = {};
    };

    // ── Render sections ───────────────────────────────────────────────────────
    // Age group label is folded into the gender bar so each group costs one fewer
    // row — e.g. "กลุ่มอายุ 18-29   ♂ MALE WINNERS".
    for (const sec of sections) {
        const agePrefix = sec.label ? `กลุ่มอายุ ${sec.label}   ` : '';

        if (isBoth) {
            addGenderBar(`${agePrefix}♂  MALE WINNERS`, CLR.MALE, 1, 5);
            addGenderBar(`${agePrefix}♀  FEMALE WINNERS`, CLR.FEMALE, 7, 11);
            clearSpacer();
            row++;

            addColHdr(1, CLR.M_COL_HDR);
            addColHdr(7, CLR.F_COL_HDR);
            clearSpacer();
            row++;

            const maxR = Math.max(sec.maleRunners.length, sec.femaleRunners.length, 1);
            for (let i = 0; i < maxR; i++) {
                addDataRow(sec.maleRunners[i] ?? null, i, 1);
                addDataRow(sec.femaleRunners[i] ?? null, i, 7);
                clearSpacer();
                row++;
            }
        } else if (showGender === 'male') {
            const barLabel = opts?.combinedLabel ? `${agePrefix}${opts.combinedLabel}` : `${agePrefix}♂  MALE WINNERS`;
            addGenderBar(barLabel, opts?.barColor || CLR.MALE, 1, 5);
            row++;
            addColHdr(1, CLR.M_COL_HDR);
            row++;
            const runners = sec.maleRunners;
            for (let i = 0; i < Math.max(runners.length, 1); i++) {
                addDataRow(runners[i] ?? null, i, 1);
                row++;
            }
        } else {
            addGenderBar(`${agePrefix}♀  FEMALE WINNERS`, CLR.FEMALE, 1, 5);
            row++;
            addColHdr(1, CLR.F_COL_HDR);
            row++;
            const runners = sec.femaleRunners;
            for (let i = 0; i < Math.max(runners.length, 1); i++) {
                addDataRow(runners[i] ?? null, i, 1);
                row++;
            }
        }

        row++; // blank gap between sections
    }

    // ── Footer row: Action.in.th (left) | ผู้จัดงาน + sign line (right) ───────
    row++; // extra blank before footer

    // Determine right-side columns for the footer
    const sigStartCol = isBoth ? 9 : 3;   // I or C
    const sigEndCol   = isBoth ? 11 : 5;  // K or E

    // Signature line row
    ws.mergeCells(row, 1, row, isBoth ? 4 : 2);
    const leftBrand = ws.getCell(row, 1);
    leftBrand.value = 'Action.in.th';
    leftBrand.font = { bold: true, size: FONT_SZ.FOOTER + 1, color: { argb: argb(CLR.TXT_MID) }, name: 'Calibri' };
    leftBrand.alignment = { horizontal: 'left', vertical: 'bottom' };

    ws.mergeCells(row, sigStartCol, row, sigEndCol);
    const sigLine = ws.getCell(row, sigStartCol);
    sigLine.value = '';
    sigLine.border = { bottom: { style: 'medium', color: { argb: argb('475569') } } };
    ws.getRow(row).height = ROW_H.FOOTER_SIG;
    row++;

    // "ผู้จัดงาน" label row
    ws.mergeCells(row, sigStartCol, row, sigEndCol);
    const sigLabel = ws.getCell(row, sigStartCol);
    sigLabel.value = 'ผู้จัดงาน';
    sigLabel.font = { size: FONT_SZ.FOOTER, color: { argb: argb(CLR.TXT_LIGHT) }, name: 'Calibri' };
    sigLabel.alignment = { horizontal: 'center', vertical: 'top' };
    ws.getRow(row).height = ROW_H.FOOTER_LBL;

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

export function triggerExcelDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
