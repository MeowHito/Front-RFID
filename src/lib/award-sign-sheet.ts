// Award signing sheet (.xlsx) — the per-group download on the award display board
// (/Award-Results/[slug]/display). One A4-portrait sheet per gender: title, event,
// group line, then the winners with empty "sign" / "phone" columns and an organizer
// signature line, so it can be printed and signed at the podium.
//
// Written as raw SpreadsheetML + a store-only zip (no compression) because the
// community `xlsx` build can't write cell styles (borders, fills, fonts).

export interface SignSheetSection {
    /** Worksheet tab name (unique, max 31 chars). */
    sheetName: string;
    title: string;
    subtitle: string;
    groupLine: string;
    rows: { place: number; bib: string; name: string; time: string }[];
}

const xml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

const col = (i: number) => String.fromCharCode(65 + i);

function sheetXml(section: SignSheetSection, timeLabel: string, stamp: string): string {
    const n = section.rows.length;
    const noteRow = 6 + n;
    const lastRow = Math.max(30, noteRow + 3);
    const sigRow = lastRow - 1;
    const values: Record<number, (string | number)[]> = {
        1: [section.title],
        2: [section.subtitle],
        3: [section.groupLine],
        5: ['อันดับ', 'BIB', 'Name / ชื่อ', timeLabel, 'ลงชื่อ', 'เบอร์โทร'],
        [sigRow]: ['Action.in.th', '', '', 'ลงชื่อผู้จัดงาน ................................................'],
        [lastRow]: [`ดาวน์โหลดเมื่อ ${stamp} น.`],
    };
    section.rows.forEach((r, i) => { values[6 + i] = [r.place, r.bib, r.name, r.time || '—', '', '']; });
    if (section.rows.some(r => !r.time)) values[noteRow] = ['— หมายถึงยังไม่มีข้อมูลเวลาประเภทที่เลือก'];

    // Style ids match the cellXfs in STYLES below.
    const styleOf = (row: number) => {
        if (row === 1) return 1;
        if (row === 2 || row === 3) return 2;
        if (row === 5) return 3;
        if (row >= 6 && row < noteRow) return 4;
        if (row === noteRow || row === lastRow) return 5;
        return 6;
    };
    const heightOf = (row: number) => {
        if (row === 1) return 32;
        if (row === 5) return 27;
        if (row >= 6 && row < noteRow) return 30;
        if (row === lastRow) return 20;
        return 22;
    };

    let data = '';
    for (let r = 1; r <= lastRow; r++) {
        const cells = (values[r] || []).map((v, c) =>
            `<c r="${col(c)}${r}" s="${styleOf(r)}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('');
        data += `<row r="${r}" ht="${heightOf(r)}" customHeight="1">${cells}</row>`;
    }
    const merges = ['A1:F1', 'A2:F2', 'A3:F3', `A${noteRow}:F${noteRow}`, `A${sigRow}:C${sigRow}`, `D${sigRow}:F${sigRow}`, `A${lastRow}:C${lastRow}`];
    const widths = [8, 12, 29, 16, 22, 20];
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
        + `<dimension ref="A1:F${lastRow}"/>`
        + '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>'
        + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
        + `<sheetData>${data}</sheetData>`
        + `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
        + '<printOptions horizontalCentered="1"/>'
        + '<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        // Long lists spill onto more pages instead of shrinking to unreadable.
        + `<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="${n > 20 ? 0 : 1}"/>`
        + '</worksheet>';
}

const STYLES = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="20"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECEFF3"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="7">'
    + '<xf fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (const byte of data) {
        c ^= byte;
        for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
}

/** Store-only (uncompressed) zip — enough for a valid .xlsx. */
function zipFiles(files: Record<string, string>): Blob {
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const [path, content] of Object.entries(files)) {
        const name = enc.encode(path);
        const data = enc.encode(content);
        const sum = crc32(data);
        const head = new Uint8Array(30 + name.length);
        const h = new DataView(head.buffer);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint32(14, sum, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        head.set(name, 30);
        chunks.push(head, data);
        const entry = new Uint8Array(46 + name.length);
        const e = new DataView(entry.buffer);
        e.setUint32(0, 0x02014b50, true);
        e.setUint16(4, 20, true);
        e.setUint16(6, 20, true);
        e.setUint32(16, sum, true);
        e.setUint32(20, data.length, true);
        e.setUint32(24, data.length, true);
        e.setUint16(28, name.length, true);
        e.setUint32(42, offset, true);
        entry.set(name, 46);
        central.push(entry);
        offset += head.length + data.length;
    }
    const size = central.reduce((s, x) => s + x.length, 0);
    const end = new Uint8Array(22);
    const d = new DataView(end.buffer);
    d.setUint32(0, 0x06054b50, true);
    d.setUint16(8, central.length, true);
    d.setUint16(10, central.length, true);
    d.setUint32(12, size, true);
    d.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildAwardSignSheet(sections: SignSheetSection[], timeLabel: string): Blob {
    const stamp = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date());
    const files: Record<string, string> = {};
    sections.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s, timeLabel, stamp); });
    files['[Content_Types].xml'] = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sections.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>';
    files['_rels/.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets>${sections.map((s, i) => `<sheet name="${xml(s.sheetName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
        + `<definedNames>${sections.map((s, i) => `<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xml(s.sheetName)}'!$A$1:$F$${Math.max(30, 9 + s.rows.length)}</definedName>`).join('')}</definedNames>`
        + '</workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sections.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files['xl/styles.xml'] = STYLES;
    return zipFiles(files);
}

export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
