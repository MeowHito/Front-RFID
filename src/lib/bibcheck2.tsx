'use client';

/**
 * Check BIB 2 — shared layout model + renderer.
 *
 * The admin designer (/admin/bib-check-2) and the live scanning display
 * (/scanning-custom/[slug]) both render layouts through this module so the
 * editor is truly WYSIWYG: same element box maths, same field resolution.
 *
 * A design stores TWO canvases (landscape + portrait) so the live page keeps
 * the orientation toggle that /scanning already has.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BibField =
    | 'eventName' | 'eventSubtitle'
    | 'bib' | 'nameTh' | 'nameEn' | 'firstName' | 'lastName'
    | 'category' | 'gender' | 'ageGroup' | 'age'
    | 'nationality' | 'flag'
    | 'team' | 'shirtSize' | 'wave'
    | 'chipCode' | 'printingCode' | 'rfidTag'
    | 'medical' | 'status'
    | 'static';

export type BibElementType = 'text' | 'image' | 'photo' | 'qr' | 'shape';

export type Orientation = 'landscape' | 'portrait';

export interface BibCheck2Element {
    id: string;
    type: BibElementType;
    field: BibField;
    staticText: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: string;
    color: string;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    prefix: string;
    suffix: string;
    backgroundColor: string;
    borderRadius: number;
    opacity: number;
    zIndex: number;
    italic: boolean;
    uppercase: boolean;
    letterSpacing: number;
    fontFamily?: string;
    lineHeight?: number;
    padding?: number;
    borderWidth?: number;
    borderColor?: string;
    /** Shrink font-size until the text fits the box width (single line). */
    autoFit?: boolean;
    /** Hide the whole element when the resolved value is empty (e.g. Medical). */
    hideIfEmpty?: boolean;
    /** Image elements */
    imageData?: string;
    objectFit?: 'cover' | 'contain' | 'fill';
    /** Photo elements — placeholder silhouette when the runner has no photo */
    showPlaceholder?: boolean;
    /** QR elements — hide once the runner photo has been uploaded */
    hideWhenPhoto?: boolean;
    qrBgColor?: string;
    qrFgColor?: string;
}

export interface BibCheck2Canvas {
    canvasWidth: number;
    canvasHeight: number;
    background: {
        type: 'color' | 'image';
        color: string;
        imageData: string;
        imageOpacity?: number;
    };
    elements: BibCheck2Element[];
}

export interface BibCheck2Layout {
    version: 1;
    /** Page backdrop behind the letterboxed canvas on the live display. */
    stageColor?: string;
    landscape: BibCheck2Canvas;
    portrait: BibCheck2Canvas;
}

export interface BibRunner {
    _id?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    category?: string;
    ageGroup?: string;
    age?: number;
    nationality?: string;
    status?: string;
    chipCode?: string;
    printingCode?: string;
    rfidTag?: string;
    team?: string;
    teamName?: string;
    shirtSize?: string;
    wave?: string;
    medical?: string;
    photoUrl?: string;
}

export interface BibCampaign {
    _id?: string;
    name?: string;
    slug?: string;
    subtitle?: string;
}

// ─── Field palette ────────────────────────────────────────────────────────────

export const BIB_FIELD_PALETTE: { field: BibField; label: string; sample: string }[] = [
    { field: 'eventName', label: 'ชื่องาน', sample: 'ACTION MARATHON 2026' },
    { field: 'eventSubtitle', label: 'คำโปรยงาน', sample: 'OFFICIAL RACE CHECK-IN' },
    { field: 'bib', label: 'BIB', sample: '5024' },
    { field: 'nameEn', label: 'ชื่อ (อังกฤษ)', sample: 'Somchai Rakkanwing' },
    { field: 'nameTh', label: 'ชื่อ (ไทย)', sample: 'สมชาย รักการวิ่ง' },
    { field: 'firstName', label: 'ชื่อจริง', sample: 'Somchai' },
    { field: 'lastName', label: 'นามสกุล', sample: 'Rakkanwing' },
    { field: 'category', label: 'ระยะ/ประเภท', sample: '21 KM' },
    { field: 'gender', label: 'เพศ', sample: 'Male' },
    { field: 'ageGroup', label: 'กลุ่มอายุ', sample: '30-39' },
    { field: 'age', label: 'อายุ', sample: '34' },
    { field: 'nationality', label: 'สัญชาติ', sample: 'THA' },
    { field: 'flag', label: 'ธงชาติ', sample: '🇹🇭' },
    { field: 'team', label: 'ทีม', sample: 'Action Running Club' },
    { field: 'shirtSize', label: 'ไซส์เสื้อ', sample: 'XL' },
    { field: 'wave', label: 'Wave', sample: 'A · 05:00' },
    { field: 'chipCode', label: 'Chip Code', sample: 'CHIP-88213' },
    { field: 'printingCode', label: 'Printing Code', sample: 'P-5024' },
    { field: 'rfidTag', label: 'RFID Tag', sample: 'E28011700000021' },
    { field: 'medical', label: '⚕ ข้อมูลการแพทย์', sample: 'แพ้อาหารทะเล' },
    { field: 'status', label: 'สถานะ', sample: 'registered' },
    { field: 'static', label: 'ข้อความ Static', sample: 'ยืนยันข้อมูล' },
];

export const BIB_MOCK: Record<BibField, string> = BIB_FIELD_PALETTE.reduce((acc, p) => {
    acc[p.field] = p.field === 'static' ? '' : p.sample;
    return acc;
}, {} as Record<BibField, string>);

export const BIB_FONTS = ['Prompt', 'Lexend', 'Inter', 'Roboto Slab'] as const;

/** Google-fonts + FontAwesome link tags used by both the editor and live page. */
export const BIB_FONT_HREF =
    'https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700;800;900&family=Lexend:wght@300;400;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&family=Roboto+Slab:wght@400;600;700;800;900&display=swap';

// ─── Nationality → flag emoji ─────────────────────────────────────────────────

const ALPHA3: Record<string, string> = {
    THA: 'TH', USA: 'US', GBR: 'GB', JPN: 'JP', KOR: 'KR', CHN: 'CN', TWN: 'TW', HKG: 'HK', SGP: 'SG', MYS: 'MY',
    IDN: 'ID', PHL: 'PH', VNM: 'VN', MMR: 'MM', LAO: 'LA', KHM: 'KH', IND: 'IN', AUS: 'AU', NZL: 'NZ', CAN: 'CA',
    DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', CHE: 'CH', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI',
    RUS: 'RU', BRA: 'BR', MEX: 'MX', KEN: 'KE', ETH: 'ET', ZAF: 'ZA', TUR: 'TR', POL: 'PL', ARE: 'AE', SAU: 'SA',
    ISR: 'IL', EGY: 'EG', NGA: 'NG', ARG: 'AR', COL: 'CO', BEL: 'BE', AUT: 'AT', PRT: 'PT', IRL: 'IE', GRC: 'GR',
    UKR: 'UA', CZE: 'CZ', HUN: 'HU', ROU: 'RO', NPL: 'NP', LKA: 'LK', PAK: 'PK', BGD: 'BD', BRN: 'BN', MAC: 'MO',
};

export function toFlagEmoji(code?: string | null): string {
    if (!code) return '';
    const u = code.trim().toUpperCase();
    const a2 = u.length === 2 ? u : ALPHA3[u];
    if (!a2 || a2.length !== 2) return '';
    return String.fromCodePoint(0x1f1e6 + a2.charCodeAt(0) - 65, 0x1f1e6 + a2.charCodeAt(1) - 65);
}

// ─── Field resolution ─────────────────────────────────────────────────────────

/** Medical values that mean "nothing to flag" — treated as empty. */
function medicalText(raw?: string): string {
    const v = (raw || '').trim();
    if (!v || v === 'ไม่มี' || v === '-' || v.toLowerCase() === 'none') return '';
    return v;
}

export function resolveBibField(
    field: BibField,
    staticText: string,
    runner: BibRunner | null,
    campaign: BibCampaign | null,
): string {
    if (field === 'static') return staticText;
    if (field === 'eventName') return campaign?.name || '';
    if (field === 'eventSubtitle') return campaign?.subtitle || '';
    if (!runner) return '';

    switch (field) {
        case 'bib': return runner.bib || '';
        case 'nameEn': return `${runner.firstName || ''} ${runner.lastName || ''}`.trim();
        case 'nameTh': return `${runner.firstNameTh || ''} ${runner.lastNameTh || ''}`.trim();
        case 'firstName': return runner.firstName || '';
        case 'lastName': return runner.lastName || '';
        case 'category': return runner.category || '';
        case 'gender':
            return runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : (runner.gender || '');
        case 'ageGroup': return runner.ageGroup || '';
        case 'age': return runner.age != null ? String(runner.age) : '';
        case 'nationality': return runner.nationality || '';
        case 'flag': return toFlagEmoji(runner.nationality);
        case 'team': return runner.team || runner.teamName || '';
        case 'shirtSize': return runner.shirtSize || '';
        case 'wave': return runner.wave || '';
        case 'chipCode': return runner.chipCode || '';
        case 'printingCode': return runner.printingCode || '';
        case 'rfidTag': return runner.rfidTag || '';
        case 'medical': return medicalText(runner.medical);
        case 'status': return runner.status || '';
        default: return '';
    }
}

// ─── Element factory ──────────────────────────────────────────────────────────

function uid(prefix = 'el'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const ELEMENT_BASE: Omit<BibCheck2Element, 'id' | 'type' | 'field'> = {
    staticText: '',
    x: 60, y: 60, width: 400, height: 80,
    fontSize: 40, fontWeight: '700', color: '#0f172a',
    align: 'left', verticalAlign: 'middle',
    prefix: '', suffix: '',
    backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
    italic: false, uppercase: false, letterSpacing: 0,
    fontFamily: 'Prompt', lineHeight: 1.15, padding: 0,
    borderWidth: 0, borderColor: '#cbd5e1',
    autoFit: false, hideIfEmpty: false,
};

function el(patch: Partial<BibCheck2Element> & { type: BibElementType; field: BibField }): BibCheck2Element {
    return { ...ELEMENT_BASE, id: uid(), ...patch };
}

export function makeTextElement(field: BibField, staticText: string, canvas: BibCheck2Canvas): BibCheck2Element {
    const width = Math.min(600, canvas.canvasWidth - 120);
    return el({
        type: 'text', field, staticText,
        x: Math.round((canvas.canvasWidth - width) / 2),
        y: Math.round(canvas.canvasHeight / 2 - 40),
        width, height: 80,
        fontSize: Math.max(24, Math.round(canvas.canvasWidth / 34)),
        align: 'center',
        autoFit: true,
        hideIfEmpty: field === 'medical',
        zIndex: 10,
    });
}

export function makeShapeElement(canvas: BibCheck2Canvas): BibCheck2Element {
    return el({
        type: 'shape', field: 'static',
        x: Math.round(canvas.canvasWidth * 0.2), y: Math.round(canvas.canvasHeight / 2),
        width: Math.round(canvas.canvasWidth * 0.6), height: 6,
        backgroundColor: '#16a34a', zIndex: 2,
    });
}

export function makePhotoElement(canvas: BibCheck2Canvas): BibCheck2Element {
    const size = Math.round(Math.min(canvas.canvasWidth, canvas.canvasHeight) * 0.4);
    return el({
        type: 'photo', field: 'static',
        x: Math.round((canvas.canvasWidth - size) / 2),
        y: Math.round((canvas.canvasHeight - size) / 2),
        width: size, height: size,
        backgroundColor: '#f1f5f9', borderRadius: 8,
        borderWidth: 2, borderColor: '#cbd5e1',
        objectFit: 'cover', showPlaceholder: true, zIndex: 5,
    });
}

export function makeQrElement(canvas: BibCheck2Canvas): BibCheck2Element {
    const size = Math.round(Math.min(canvas.canvasWidth, canvas.canvasHeight) * 0.12);
    return el({
        type: 'qr', field: 'static',
        x: Math.round((canvas.canvasWidth - size) / 2),
        y: Math.round(canvas.canvasHeight * 0.7),
        width: size, height: size,
        backgroundColor: '#ffffff', borderRadius: 6, padding: 8,
        hideWhenPhoto: true, qrBgColor: '#ffffff', qrFgColor: '#0f172a',
        zIndex: 20,
    });
}

export function makeImageElement(imageData: string, canvas: BibCheck2Canvas): BibCheck2Element {
    const size = Math.round(Math.min(canvas.canvasWidth, canvas.canvasHeight) * 0.25);
    return el({
        type: 'image', field: 'static',
        x: Math.round((canvas.canvasWidth - size) / 2),
        y: Math.round((canvas.canvasHeight - size) / 2),
        width: size, height: size,
        imageData, objectFit: 'contain', zIndex: 6,
    });
}

// ─── Default design ───────────────────────────────────────────────────────────

function defaultLandscape(): BibCheck2Canvas {
    return {
        canvasWidth: 1920,
        canvasHeight: 1080,
        background: { type: 'color', color: '#ffffff', imageData: '', imageOpacity: 0.25 },
        elements: [
            el({ type: 'text', field: 'eventName', x: 80, y: 48, width: 1760, height: 96, fontSize: 62, fontWeight: '800', align: 'center', autoFit: true, zIndex: 10 }),
            el({ type: 'shape', field: 'static', x: 80, y: 162, width: 1760, height: 2, backgroundColor: '#cbd5e1', zIndex: 1 }),

            el({ type: 'photo', field: 'static', x: 130, y: 226, width: 560, height: 560, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', objectFit: 'cover', showPlaceholder: true, zIndex: 5 }),
            el({ type: 'qr', field: 'static', x: 596, y: 692, width: 156, height: 156, backgroundColor: '#ffffff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#cbd5e1', hideWhenPhoto: true, qrBgColor: '#ffffff', qrFgColor: '#0f172a', zIndex: 20 }),

            el({ type: 'text', field: 'static', staticText: '✓ ยืนยันข้อมูล', x: 780, y: 232, width: 1040, height: 54, fontSize: 30, fontWeight: '600', color: '#16a34a', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'nameEn', x: 780, y: 292, width: 1040, height: 124, fontSize: 92, fontWeight: '800', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'nameTh', x: 780, y: 420, width: 1040, height: 76, fontSize: 44, fontWeight: '400', color: '#64748b', autoFit: true, hideIfEmpty: true, zIndex: 10 }),

            el({ type: 'shape', field: 'static', x: 780, y: 540, width: 8, height: 172, backgroundColor: '#16a34a', zIndex: 2 }),
            el({ type: 'text', field: 'static', staticText: 'BIB', x: 812, y: 548, width: 200, height: 46, fontSize: 28, fontWeight: '700', color: '#94a3b8', letterSpacing: 6, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'bib', x: 812, y: 588, width: 400, height: 130, fontSize: 118, fontWeight: '700', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'category', x: 1246, y: 600, width: 574, height: 108, fontSize: 76, fontWeight: '800', color: '#ef4444', uppercase: true, autoFit: true, zIndex: 10 }),

            el({ type: 'text', field: 'medical', prefix: '⚕  ', x: 780, y: 742, width: 1040, height: 84, fontSize: 32, fontWeight: '600', color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 2, borderColor: '#fca5a5', padding: 18, autoFit: true, hideIfEmpty: true, zIndex: 12 }),

            el({ type: 'shape', field: 'static', x: 80, y: 886, width: 1760, height: 2, backgroundColor: '#cbd5e1', zIndex: 1 }),
            el({ type: 'text', field: 'static', staticText: 'Gender', x: 100, y: 908, width: 500, height: 44, fontSize: 26, fontWeight: '600', color: '#94a3b8', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'gender', x: 100, y: 954, width: 500, height: 92, fontSize: 62, fontWeight: '800', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'static', staticText: 'Age Group', x: 1020, y: 908, width: 500, height: 44, fontSize: 26, fontWeight: '600', color: '#16a34a', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'ageGroup', x: 1020, y: 954, width: 500, height: 92, fontSize: 62, fontWeight: '800', color: '#16a34a', autoFit: true, zIndex: 10 }),
        ],
    };
}

function defaultPortrait(): BibCheck2Canvas {
    return {
        canvasWidth: 1080,
        canvasHeight: 1920,
        background: { type: 'color', color: '#ffffff', imageData: '', imageOpacity: 0.25 },
        elements: [
            el({ type: 'text', field: 'eventName', x: 60, y: 72, width: 960, height: 100, fontSize: 54, fontWeight: '800', align: 'center', autoFit: true, zIndex: 10 }),
            el({ type: 'shape', field: 'static', x: 60, y: 194, width: 960, height: 2, backgroundColor: '#cbd5e1', zIndex: 1 }),

            el({ type: 'photo', field: 'static', x: 290, y: 246, width: 500, height: 500, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', objectFit: 'cover', showPlaceholder: true, zIndex: 5 }),
            el({ type: 'qr', field: 'static', x: 700, y: 656, width: 140, height: 140, backgroundColor: '#ffffff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#cbd5e1', hideWhenPhoto: true, qrBgColor: '#ffffff', qrFgColor: '#0f172a', zIndex: 20 }),

            el({ type: 'text', field: 'static', staticText: '✓ ยืนยันข้อมูล', x: 60, y: 828, width: 960, height: 54, fontSize: 30, fontWeight: '600', color: '#16a34a', align: 'center', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'nameEn', x: 60, y: 890, width: 960, height: 112, fontSize: 76, fontWeight: '800', align: 'center', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'nameTh', x: 60, y: 1008, width: 960, height: 72, fontSize: 40, fontWeight: '400', color: '#64748b', align: 'center', autoFit: true, hideIfEmpty: true, zIndex: 10 }),

            el({ type: 'shape', field: 'static', x: 300, y: 1116, width: 480, height: 6, backgroundColor: '#16a34a', zIndex: 2 }),
            el({ type: 'text', field: 'static', staticText: 'BIB', x: 60, y: 1140, width: 960, height: 46, fontSize: 28, fontWeight: '700', color: '#94a3b8', align: 'center', letterSpacing: 6, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'bib', x: 60, y: 1186, width: 960, height: 150, fontSize: 130, fontWeight: '700', align: 'center', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'category', x: 60, y: 1352, width: 960, height: 104, fontSize: 70, fontWeight: '800', color: '#ef4444', align: 'center', uppercase: true, autoFit: true, zIndex: 10 }),

            el({ type: 'text', field: 'medical', prefix: '⚕  ', x: 60, y: 1478, width: 960, height: 88, fontSize: 30, fontWeight: '600', color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 2, borderColor: '#fca5a5', align: 'center', padding: 16, autoFit: true, hideIfEmpty: true, zIndex: 12 }),

            el({ type: 'shape', field: 'static', x: 60, y: 1604, width: 960, height: 2, backgroundColor: '#cbd5e1', zIndex: 1 }),
            el({ type: 'text', field: 'static', staticText: 'Gender', x: 60, y: 1628, width: 460, height: 44, fontSize: 26, fontWeight: '600', color: '#94a3b8', align: 'center', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'gender', x: 60, y: 1674, width: 460, height: 96, fontSize: 60, fontWeight: '800', align: 'center', autoFit: true, zIndex: 10 }),
            el({ type: 'text', field: 'static', staticText: 'Age Group', x: 560, y: 1628, width: 460, height: 44, fontSize: 26, fontWeight: '600', color: '#16a34a', align: 'center', letterSpacing: 4, uppercase: true, zIndex: 10 }),
            el({ type: 'text', field: 'ageGroup', x: 560, y: 1674, width: 460, height: 96, fontSize: 60, fontWeight: '800', color: '#16a34a', align: 'center', autoFit: true, zIndex: 10 }),
        ],
    };
}

export function defaultBibCheck2Layout(): BibCheck2Layout {
    return {
        version: 1,
        stageColor: '#0f172a',
        landscape: defaultLandscape(),
        portrait: defaultPortrait(),
    };
}

type RawRecord = Record<string, unknown>;

function asRecord(v: unknown): RawRecord | null {
    return v && typeof v === 'object' ? (v as RawRecord) : null;
}

/** Fill in anything a stored layout is missing (older saves, hand-edited JSON). */
export function normalizeLayout(input: unknown): BibCheck2Layout {
    const base = defaultBibCheck2Layout();
    const raw = asRecord(input);
    if (!raw) return base;

    const canvas = (value: unknown, fallback: BibCheck2Canvas): BibCheck2Canvas => {
        const c = asRecord(value);
        if (!c || !Array.isArray(c.elements)) return fallback;
        const bg = asRecord(c.background) ?? {};
        return {
            canvasWidth: Number(c.canvasWidth) || fallback.canvasWidth,
            canvasHeight: Number(c.canvasHeight) || fallback.canvasHeight,
            background: {
                type: bg.type === 'image' ? 'image' : 'color',
                color: (bg.color as string) || '#ffffff',
                imageData: (bg.imageData as string) || '',
                imageOpacity: (bg.imageOpacity as number) ?? 1,
            },
            elements: (c.elements as RawRecord[]).map((e, i) => ({
                ...ELEMENT_BASE,
                ...e,
                id: (e.id as string) || `el-restored-${i}`,
                type: ((e.type as BibElementType) || 'text'),
                field: ((e.field as BibField) || 'static'),
            })),
        };
    };

    return {
        version: 1,
        stageColor: (raw.stageColor as string) || base.stageColor,
        landscape: canvas(raw.landscape, base.landscape),
        portrait: canvas(raw.portrait, base.portrait),
    };
}

// ─── Auto-fit text ────────────────────────────────────────────────────────────

/**
 * Renders text on one line, shrinking font-size until it fits the box width.
 * Runs on every value/size change so both the editor and the live display
 * behave identically.
 */
function AutoFitText({
    text, baseSize, minSize, style,
}: { text: string; baseSize: number; minSize: number; style: React.CSSProperties }) {
    const ref = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const node = ref.current;
        const box = node?.parentElement;
        if (!node || !box) return;
        let size = baseSize;
        node.style.fontSize = `${size}px`;
        const limit = box.clientWidth;
        if (limit <= 0) return;
        let guard = 200;
        while (node.scrollWidth > limit && size > minSize && guard-- > 0) {
            size -= Math.max(1, baseSize * 0.02);
            node.style.fontSize = `${size}px`;
        }
    }, [text, baseSize, minSize, style.letterSpacing, style.fontWeight, style.fontFamily]);

    return <span ref={ref} style={{ ...style, whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }}>{text}</span>;
}

// ─── Element renderer ─────────────────────────────────────────────────────────

export interface RenderContext {
    runner: BibRunner | null;
    campaign: BibCampaign | null;
    /** URL encoded into QR elements. Empty → grey placeholder. */
    qrValue: string;
    /** True once a photo exists — QR elements with hideWhenPhoto disappear. */
    photoUploaded: boolean;
    /** Editor mode: show sample data + keep empty boxes visible so they stay grabbable. */
    editor: boolean;
}

/** Text (or empty string for non-text types) an element resolves to right now. */
export function elementText(el: BibCheck2Element, ctx: RenderContext): string {
    if (el.type !== 'text') return '';
    const raw = ctx.editor && el.field !== 'static'
        ? (BIB_MOCK[el.field] ?? '')
        : resolveBibField(el.field, el.staticText, ctx.runner, ctx.campaign);
    if (!raw && el.field !== 'static') return '';
    return `${el.prefix}${raw}${el.suffix}`;
}

/** Should this element be skipped entirely for the current data? */
export function isElementHidden(el: BibCheck2Element, ctx: RenderContext): boolean {
    if (el.type === 'qr' && el.hideWhenPhoto && ctx.photoUploaded) return true;
    if (el.type !== 'text') return false;
    if (!el.hideIfEmpty) return false;
    const raw = ctx.editor && el.field !== 'static'
        ? (BIB_MOCK[el.field] ?? '')
        : resolveBibField(el.field, el.staticText, ctx.runner, ctx.campaign);
    return !raw.trim();
}

/** Absolute box style shared by editor and live renderer. */
export function elementBoxStyle(el: BibCheck2Element): React.CSSProperties {
    const justify = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
    const alignItems = el.verticalAlign === 'top' ? 'flex-start' : el.verticalAlign === 'bottom' ? 'flex-end' : 'center';
    return {
        position: 'absolute',
        left: el.x, top: el.y, width: el.width, height: el.height,
        backgroundColor: el.backgroundColor || 'transparent',
        borderRadius: el.borderRadius,
        opacity: el.opacity,
        zIndex: el.zIndex,
        border: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor || '#cbd5e1'}` : 'none',
        padding: el.padding || 0,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems,
        justifyContent: justify,
        overflow: 'hidden',
    };
}

function PhotoPlaceholder() {
    return (
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '72%', height: '72%', opacity: 0.25 }}>
            <circle cx="60" cy="38" r="22" fill="#475569" />
            <path d="M10 110 C10 78 30 65 60 65 C90 65 110 78 110 110 Z" fill="#475569" />
        </svg>
    );
}

/** Inner content of an element — no positioning, that lives in elementBoxStyle. */
export function ElementContent({ el, ctx }: { el: BibCheck2Element; ctx: RenderContext }) {
    if (el.type === 'shape') return null;

    if (el.type === 'image') {
        if (!el.imageData) {
            return <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'Prompt', sans-serif" }}>รูปภาพ</span>;
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={el.imageData} alt="" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: el.objectFit || 'contain', pointerEvents: 'none', userSelect: 'none' }} />;
    }

    if (el.type === 'photo') {
        const src = ctx.runner?.photoUrl;
        if (src) {
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={src} alt="runner" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: el.objectFit || 'cover', pointerEvents: 'none', userSelect: 'none' }} />;
        }
        return el.showPlaceholder === false ? null : <PhotoPlaceholder />;
    }

    if (el.type === 'qr') {
        const inner = Math.max(24, Math.min(el.width, el.height) - (el.padding || 0) * 2 - (el.borderWidth || 0) * 2);
        if (!ctx.qrValue) {
            return (
                <div style={{
                    width: inner, height: inner, background: '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#0f172a', fontWeight: 800, fontSize: Math.max(10, inner / 5),
                    fontFamily: "'Prompt', sans-serif",
                }}>QR</div>
            );
        }
        return (
            <QRCodeSVG
                value={ctx.qrValue}
                size={inner}
                bgColor={el.qrBgColor || '#ffffff'}
                fgColor={el.qrFgColor || '#0f172a'}
                level="H"
            />
        );
    }

    // text
    const text = elementText(el, ctx);
    const textStyle: React.CSSProperties = {
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        color: el.color,
        fontStyle: el.italic ? 'italic' : 'normal',
        textTransform: el.uppercase ? 'uppercase' : 'none',
        letterSpacing: el.letterSpacing,
        lineHeight: el.lineHeight ?? 1.15,
        fontFamily: `'${el.fontFamily || 'Prompt'}', sans-serif`,
        textAlign: el.align,
    };

    if (el.autoFit) {
        return <AutoFitText text={text} baseSize={el.fontSize} minSize={Math.max(8, el.fontSize * 0.25)} style={textStyle} />;
    }
    return <span style={{ ...textStyle, width: '100%', wordBreak: 'break-word' }}>{text}</span>;
}

/** Background layer for a canvas (color + optional image at chosen opacity). */
export function CanvasBackground({ canvas }: { canvas: BibCheck2Canvas }) {
    const hasImage = canvas.background.type === 'image' && !!canvas.background.imageData;
    if (!hasImage) return null;
    return (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: `url(${canvas.background.imageData})`,
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
            opacity: canvas.background.imageOpacity ?? 1,
            pointerEvents: 'none',
        }} />
    );
}

/**
 * Non-interactive render of a whole canvas at its native pixel size.
 * Callers scale it with a CSS transform.
 */
export function BibCanvasView({ canvas, ctx }: { canvas: BibCheck2Canvas; ctx: RenderContext }) {
    return (
        <div style={{
            position: 'relative',
            width: canvas.canvasWidth,
            height: canvas.canvasHeight,
            background: canvas.background.color || '#ffffff',
            overflow: 'hidden',
        }}>
            <CanvasBackground canvas={canvas} />
            {canvas.elements.map(e => {
                if (isElementHidden(e, ctx)) return null;
                return (
                    <div key={e.id} style={elementBoxStyle(e)}>
                        <ElementContent el={e} ctx={ctx} />
                    </div>
                );
            })}
        </div>
    );
}
