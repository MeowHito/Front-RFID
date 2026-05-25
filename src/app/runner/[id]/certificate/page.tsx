'use client';

// IMPORTANT: Types, constants, helpers and renderers below MUST match the editor at
// /admin/certificates/page.tsx. If you add a new field or element type there, mirror
// it here too — otherwise the runner-facing certificate will render `{{token}}` raw
// or drop entire elements.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElementType = 'text' | 'image' | 'shape' | 'flag' | 'table';
type ShapeKind = 'rect' | 'circle' | 'triangle';
type FlagMode = 'flag' | 'name' | 'both';
type TableFieldKey =
    | 'checkpoint' | 'distance' | 'cumulative' | 'sector' | 'pace'
    | 'overall_rank' | 'gender_rank' | 'split_no';

interface TableColumn {
    field: TableFieldKey;
    header: string;
    width: number;
    align: 'left' | 'center' | 'right';
}

interface CertElement {
    id: string;
    type?: ElementType;
    content: string;
    x: number; y: number; width: number; height?: number;
    fontSize: number; fontFamily: string; color: string;
    fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    opacity: number; letterSpacing: number;
    rotation?: number;
    borderRadius?: number;
    brightness?: number; contrast?: number; blur?: number;
    shadowEnabled?: boolean; shadowColor?: string;
    shadowBlur?: number; shadowX?: number; shadowY?: number;
    // image
    src?: string; aspectRatio?: number;
    // shape
    shape?: ShapeKind;
    fillColor?: string; strokeColor?: string; strokeWidth?: number;
    // flag
    flagMode?: FlagMode; flagCode?: string;
    // table
    columns?: TableColumn[];
    headerBg?: string; headerColor?: string;
    rowBg?: string; rowAltBg?: string;
    borderColor?: string; borderWidth?: number;
    showHeader?: boolean; headerFontSize?: number;
}

interface RunnerData {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    category?: string;
    ageGroup?: string;
    age?: number;
    team?: string;
    teamName?: string;
    nationality?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    finishTime?: string;
    netPace?: string;
    gunPace?: string;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
    categoryRank?: number;
    totalFinishers?: number;
    genderFinishers?: number;
}

interface CampaignData {
    _id?: string;
    name: string;
    nameTh?: string | null;
    nameEn?: string | null;
    eventDate?: string;
    location?: string;
    isApproveCertificate?: boolean;
    certLayout?: CertElement[] | null;
    certBackgroundImage?: string | null;
    certPaperSize?: string | null;
    certBgOpacity?: number | null;
    certBgColor?: string | null;
}

interface SplitRecord {
    checkpoint: string;
    splitTime?: number;
    elapsedTime?: number;
    distanceFromStart?: number;
    netPace?: string;
    splitPace?: string;
    splitNo?: number;
    splitDesc?: string;
    overallRank?: number;
    genderRank?: number;
}

// ─── Constants — must match editor ────────────────────────────────────────────

const CANVAS_REF_W = 1200;

function paperRatioWH(paper?: string | null): number {
    switch (paper) {
        case 'a4-portrait': return 210 / 297;
        case 'hd-landscape': return 1920 / 1080;
        case 'hd-portrait': return 1080 / 1920;
        default: return 297 / 210; // a4-landscape
    }
}

const FIELD_PREVIEWS: Record<string, string> = {
    '{{name}}': '-', '{{name_th}}': '-',
    '{{first_name}}': '-', '{{last_name}}': '-',
    '{{bib}}': '-', '{{category}}': '-', '{{distance}}': '-',
    '{{gender}}': '-', '{{age}}': '-', '{{age_group}}': '-',
    '{{team}}': '-', '{{country}}': '-', '{{flag}}': '',
    '{{time}}': '-', '{{gun_time}}': '-',
    '{{pace}}': '-', '{{gun_pace}}': '-',
    '{{rank}}': '-', '{{gender_rank}}': '-', '{{age_rank}}': '-',
    '{{rank_total}}': '-', '{{gender_rank_total}}': '-',
    '{{event_name}}': '-', '{{event_date}}': '-',
};

const NATIONALITY_MAP: Record<string, { code: string; name: string }> = {
    'TH': { code: 'TH', name: 'Thailand' }, 'THA': { code: 'TH', name: 'Thailand' }, 'THAI': { code: 'TH', name: 'Thailand' }, 'THAILAND': { code: 'TH', name: 'Thailand' },
    'US': { code: 'US', name: 'United States' }, 'USA': { code: 'US', name: 'United States' }, 'AMERICAN': { code: 'US', name: 'United States' },
    'GB': { code: 'GB', name: 'United Kingdom' }, 'UK': { code: 'GB', name: 'United Kingdom' }, 'BRITISH': { code: 'GB', name: 'United Kingdom' },
    'JP': { code: 'JP', name: 'Japan' }, 'JPN': { code: 'JP', name: 'Japan' }, 'JAPAN': { code: 'JP', name: 'Japan' },
    'CN': { code: 'CN', name: 'China' }, 'CHN': { code: 'CN', name: 'China' }, 'CHINESE': { code: 'CN', name: 'China' }, 'CHINA': { code: 'CN', name: 'China' },
    'KR': { code: 'KR', name: 'Korea' }, 'KOR': { code: 'KR', name: 'Korea' }, 'KOREA': { code: 'KR', name: 'Korea' },
    'MY': { code: 'MY', name: 'Malaysia' }, 'MYS': { code: 'MY', name: 'Malaysia' }, 'MALAYSIA': { code: 'MY', name: 'Malaysia' },
    'SG': { code: 'SG', name: 'Singapore' }, 'SGP': { code: 'SG', name: 'Singapore' }, 'SINGAPORE': { code: 'SG', name: 'Singapore' },
    'ID': { code: 'ID', name: 'Indonesia' }, 'IDN': { code: 'ID', name: 'Indonesia' }, 'INDONESIA': { code: 'ID', name: 'Indonesia' },
    'PH': { code: 'PH', name: 'Philippines' }, 'PHL': { code: 'PH', name: 'Philippines' }, 'PHILIPPINES': { code: 'PH', name: 'Philippines' },
    'VN': { code: 'VN', name: 'Vietnam' }, 'VNM': { code: 'VN', name: 'Vietnam' }, 'VIETNAM': { code: 'VN', name: 'Vietnam' },
    'AU': { code: 'AU', name: 'Australia' }, 'AUS': { code: 'AU', name: 'Australia' }, 'AUSTRALIA': { code: 'AU', name: 'Australia' },
    'NZ': { code: 'NZ', name: 'New Zealand' }, 'NZL': { code: 'NZ', name: 'New Zealand' },
    'FR': { code: 'FR', name: 'France' }, 'FRA': { code: 'FR', name: 'France' }, 'FRANCE': { code: 'FR', name: 'France' },
    'DE': { code: 'DE', name: 'Germany' }, 'DEU': { code: 'DE', name: 'Germany' }, 'GERMANY': { code: 'DE', name: 'Germany' },
    'CA': { code: 'CA', name: 'Canada' }, 'CAN': { code: 'CA', name: 'Canada' }, 'CANADA': { code: 'CA', name: 'Canada' },
    'IN': { code: 'IN', name: 'India' }, 'IND': { code: 'IN', name: 'India' }, 'INDIA': { code: 'IN', name: 'India' },
    'HK': { code: 'HK', name: 'Hong Kong' }, 'HKG': { code: 'HK', name: 'Hong Kong' }, 'TW': { code: 'TW', name: 'Taiwan' }, 'TWN': { code: 'TW', name: 'Taiwan' },
};

const DEFAULT_COLUMNS: TableColumn[] = [
    { field: 'distance',     header: 'Distance', width: 16, align: 'left'   },
    { field: 'cumulative',   header: 'Time',     width: 16, align: 'center' },
    { field: 'sector',       header: 'Sector',   width: 16, align: 'center' },
    { field: 'pace',         header: 'Pace',     width: 16, align: 'center' },
    { field: 'overall_rank', header: 'Overall',  width: 18, align: 'center' },
    { field: 'gender_rank',  header: 'Gender',   width: 18, align: 'right'  },
];

// Fallback layout when the campaign has no saved cert layout yet — mirrors editor's DEFAULT_ELEMENTS.
const DEFAULT_ELEMENTS: CertElement[] = [
    { id: 'title', type: 'text', content: 'Certificate of Achievement', x: 50, y: 12, width: 80, fontSize: 44, fontFamily: 'Playfair Display, serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 3 },
    { id: 'event', type: 'text', content: '{{event_name}}', x: 50, y: 24, width: 75, fontSize: 20, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.85, letterSpacing: 1 },
    { id: 'presented', type: 'text', content: 'This certificate is presented to', x: 50, y: 34, width: 60, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'italic', textAlign: 'center', opacity: 0.65, letterSpacing: 0 },
    { id: 'name', type: 'text', content: '{{name}}', x: 50, y: 47, width: 70, fontSize: 48, fontFamily: 'Playfair Display, serif', color: '#ffffff', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'details', type: 'text', content: 'BIB: {{bib}}   |   {{category}}   |   {{gender}}', x: 50, y: 59, width: 65, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.8, letterSpacing: 0 },
    { id: 'time', type: 'text', content: '{{time}}', x: 50, y: 70, width: 40, fontSize: 38, fontFamily: 'Sarabun, sans-serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'rank', type: 'text', content: 'Overall #{{rank}}  |  Gender #{{gender_rank}}  |  Age #{{age_rank}}', x: 50, y: 81, width: 70, fontSize: 13, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.6, letterSpacing: 0 },
    { id: 'date', type: 'text', content: '{{event_date}}', x: 15, y: 92, width: 24, fontSize: 12, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.55, letterSpacing: 0 },
];

// ─── Helpers — must match editor ─────────────────────────────────────────────

function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '-';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function categoryToDistance(cat?: string): string {
    if (!cat) return '-';
    const m = cat.match(/(\d+(?:\.\d+)?)\s*K/i);
    return m ? `${m[1]}K` : cat;
}

function countryFlagEmoji(code: string): string {
    if (!code) return '';
    const c = code.trim().toUpperCase();
    if (c.length !== 2) return '';
    const A = 0x1F1E6;
    return String.fromCodePoint(A + (c.charCodeAt(0) - 65)) + String.fromCodePoint(A + (c.charCodeAt(1) - 65));
}

function resolveNationality(raw: string | undefined): { code: string; name: string } {
    if (!raw) return { code: '', name: '-' };
    const key = raw.trim().toUpperCase();
    if (NATIONALITY_MAP[key]) return NATIONALITY_MAP[key];
    if (key.length === 2) return { code: key, name: key };
    return { code: '', name: raw };
}

function substituteFields(content: string, runner: RunnerData | null, campaign: CampaignData | null): string {
    if (!runner) return content.replace(/\{\{[^}]+\}\}/g, m => FIELD_PREVIEWS[m] ?? m);
    const netTime = typeof runner.netTime === 'number' && runner.netTime > 0
        ? formatTime(runner.netTime)
        : (runner.finishTime || '-');
    const gunTime = typeof runner.gunTime === 'number' && runner.gunTime > 0 ? formatTime(runner.gunTime) : '-';
    const nat = resolveNationality(runner.nationality);
    const totFinish = runner.totalFinishers && runner.totalFinishers > 0 ? runner.totalFinishers : null;
    const genFinish = runner.genderFinishers && runner.genderFinishers > 0 ? runner.genderFinishers : null;
    const teamName = runner.team || runner.teamName || '-';
    const fullName = `${runner.firstName || ''} ${runner.lastName || ''}`.trim() || '-';
    const ageRank = runner.ageGroupRank && runner.ageGroupRank > 0
        ? String(runner.ageGroupRank)
        : (runner.categoryRank && runner.categoryRank > 0 ? String(runner.categoryRank) : '-');
    const map: Record<string, string> = {
        '{{name}}': fullName,
        '{{name_th}}': runner.firstNameTh
            ? `${runner.firstNameTh} ${runner.lastNameTh ?? ''}`.trim()
            : fullName,
        '{{first_name}}': runner.firstName ?? '-',
        '{{last_name}}': runner.lastName ?? '-',
        '{{bib}}': runner.bib ?? '-',
        '{{category}}': runner.category ?? '-',
        '{{distance}}': categoryToDistance(runner.category),
        '{{gender}}': runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : (runner.gender || '-'),
        '{{age}}': runner.age ? String(runner.age) : '-',
        '{{age_group}}': runner.ageGroup ?? '-',
        '{{team}}': teamName,
        '{{country}}': nat.name,
        '{{flag}}': nat.code ? countryFlagEmoji(nat.code) : '',
        '{{time}}': netTime,
        '{{gun_time}}': gunTime,
        '{{pace}}': runner.netPace || '-',
        '{{gun_pace}}': runner.gunPace || '-',
        '{{rank}}': runner.overallRank && runner.overallRank > 0 ? String(runner.overallRank) : '-',
        '{{gender_rank}}': runner.genderRank && runner.genderRank > 0 ? String(runner.genderRank) : '-',
        '{{age_rank}}': ageRank,
        '{{rank_total}}': runner.overallRank && runner.overallRank > 0 && totFinish
            ? `${runner.overallRank} / ${totFinish}`
            : (runner.overallRank ? String(runner.overallRank) : '-'),
        '{{gender_rank_total}}': runner.genderRank && runner.genderRank > 0 && genFinish
            ? `${runner.genderRank} / ${genFinish}`
            : (runner.genderRank ? String(runner.genderRank) : '-'),
        '{{event_name}}': campaign?.nameTh ?? campaign?.name ?? '-',
        '{{event_date}}': campaign?.eventDate
            ? new Date(campaign.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-',
    };
    return content.replace(/\{\{[^}]+\}\}/g, m => map[m] ?? m);
}

function getElementHeight(el: CertElement, paperAspect: number): number {
    if (el.type === 'image') {
        return Math.max(4, Math.min(100, el.width * paperAspect / Math.max(0.1, el.aspectRatio || 1)));
    }
    if (el.type === 'shape' || el.type === 'table' || el.type === 'flag') {
        return Math.max(2, Math.min(100, el.height ?? el.width));
    }
    return 0;
}

function splitsCellValue(field: TableFieldKey, row: SplitRecord, rowIdx: number): string {
    switch (field) {
        case 'split_no':    return row.splitNo ? String(row.splitNo) : String(rowIdx + 1);
        case 'checkpoint':  return row.checkpoint || row.splitDesc || '-';
        case 'distance':    return row.distanceFromStart != null ? `${row.distanceFromStart} km` : '-';
        case 'cumulative':  return formatTime(row.elapsedTime);
        case 'sector':      return formatTime(row.splitTime);
        case 'pace':        return row.splitPace || row.netPace || '-';
        case 'overall_rank': return row.overallRank ? String(row.overallRank) : '-';
        case 'gender_rank': return row.genderRank ? String(row.genderRank) : '-';
        default: return '-';
    }
}

// ─── Sub-renderers ───────────────────────────────────────────────────────────

function ShapeRender({ el }: { el: CertElement }) {
    const fill = el.fillColor || '#ffffff';
    const stroke = el.strokeColor || 'transparent';
    const sw = el.strokeWidth ?? 0;
    if (el.shape === 'circle') {
        return (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
                <ellipse cx="50" cy="50" rx={50 - sw / 2} ry={50 - sw / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
            </svg>
        );
    }
    if (el.shape === 'triangle') {
        return (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
                <polygon points="50,2 98,98 2,98" fill={fill} stroke={stroke} strokeWidth={sw} />
            </svg>
        );
    }
    return <div style={{ width: '100%', height: '100%', background: fill, border: sw > 0 ? `${sw}px solid ${stroke}` : 'none', boxSizing: 'border-box' }} />;
}

function FlagRender({ el, runner, fontScale }: { el: CertElement; runner: RunnerData | null; fontScale: number }) {
    const nat = runner
        ? resolveNationality(runner.nationality)
        : { code: el.flagCode || 'TH', name: 'Thailand' };
    const mode = el.flagMode || 'flag';
    const emoji = nat.code ? countryFlagEmoji(nat.code) : '';
    const fs = el.fontSize * fontScale;
    if (mode === 'name') return <div style={{ fontSize: fs, color: el.color, fontWeight: el.fontWeight, textAlign: el.textAlign as 'left' | 'center' | 'right', width: '100%' }}>{nat.name}</div>;
    if (mode === 'flag') return <div style={{ fontSize: fs * 1.4, lineHeight: 1, textAlign: el.textAlign as 'left' | 'center' | 'right', width: '100%' }}>{emoji || '🏳️'}</div>;
    return <div style={{ fontSize: fs, color: el.color, fontWeight: el.fontWeight, textAlign: el.textAlign as 'left' | 'center' | 'right', width: '100%' }}>{emoji} {nat.name}</div>;
}

function TableRender({ el, splits, fontScale }: { el: CertElement; splits: SplitRecord[]; fontScale: number }) {
    const cols = el.columns && el.columns.length > 0 ? el.columns : DEFAULT_COLUMNS;
    const totalW = cols.reduce((s, c) => s + c.width, 0) || 1;
    const headerBg = el.headerBg || 'rgba(0,0,0,0.08)';
    const headerColor = el.headerColor || el.color;
    const rowBg = el.rowBg || 'transparent';
    const rowAltBg = el.rowAltBg || rowBg;
    const borderColor = el.borderColor || 'rgba(0,0,0,0.2)';
    const borderWidth = el.borderWidth ?? 0;
    const showHeader = el.showHeader !== false;
    const fs = el.fontSize * fontScale;
    const hfs = (el.headerFontSize ?? el.fontSize) * fontScale;
    return (
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: el.fontFamily, color: el.color, fontWeight: el.fontWeight, pointerEvents: 'none' }}>
            {showHeader && (
                <thead>
                    <tr style={{ background: headerBg, color: headerColor }}>
                        {cols.map((c, i) => (
                            <th key={i} style={{ width: `${(c.width / totalW) * 100}%`, padding: '4px 6px', textAlign: c.align, fontSize: hfs, fontWeight: 700, border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none' }}>{c.header}</th>
                        ))}
                    </tr>
                </thead>
            )}
            <tbody>
                {splits.length === 0 ? (
                    <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 6, fontSize: fs, opacity: 0.7 }}>No checkpoint data</td></tr>
                ) : splits.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? rowBg : rowAltBg }}>
                        {cols.map((c, j) => (
                            <td key={j} style={{ padding: '3px 6px', textAlign: c.align, fontSize: fs, fontVariantNumeric: 'tabular-nums', border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none' }}>
                                {splitsCellValue(c.field, r, i)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificatePage() {
    const { id: runnerId } = useParams<{ id: string }>();
    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [timingRecords, setTimingRecords] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);
    // Callback-ref via state so the measure effect re-runs when the cert
    // wrapper mounts *after* data loads — the previous useRef + []-deps
    // version measured before mount on mobile and got stuck at the default,
    // making fonts render ~2× too big on narrow screens.
    const [canvasWrapEl, setCanvasWrapEl] = useState<HTMLDivElement | null>(null);
    const certRef = useRef<HTMLDivElement>(null);
    // Full-size offscreen mirror used for download so the captured image
    // is consistent regardless of the visitor's screen width (fixes mobile).
    const certFullRef = useRef<HTMLDivElement>(null);
    const [canvasW, setCanvasW] = useState(800);
    // On mobile we auto-render the cert as a real <img> (data URL) so the
    // native long-press menu ("Save Image" on iOS / "Download image" on
    // Android) works — div compositions can't be long-pressed to save.
    const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
    const [generatingPreview, setGeneratingPreview] = useState(false);
    const isMobile = useMemo(
        () => typeof navigator !== 'undefined'
            && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
        [],
    );

    useEffect(() => {
        if (!runnerId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/runner/${runnerId}`, { cache: 'no-store' });
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json?.data?.runner) {
                    setError('ไม่พบข้อมูลนักวิ่ง');
                    return;
                }
                setRunner(json.data.runner);
                setCampaign(json.data.campaign || null);
                setTimingRecords(Array.isArray(json.data.timingRecords) ? json.data.timingRecords : []);
            } catch {
                if (!cancelled) setError('โหลดข้อมูลไม่สำเร็จ');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [runnerId]);

    // Track rendered canvas width so we can scale font sizes consistently with the editor.
    useEffect(() => {
        if (!canvasWrapEl) return;
        const measure = () => setCanvasW(canvasWrapEl.clientWidth);
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const obs = new ResizeObserver(measure);
            obs.observe(canvasWrapEl);
            return () => obs.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [canvasWrapEl]);

    const splits: SplitRecord[] = useMemo(() => timingRecords.map(r => ({
        checkpoint: (r.splitDesc as string) || (r.checkpoint as string) || '-',
        splitTime: r.splitTime as number,
        elapsedTime: (r.elapsedTime as number) ?? (r.totalNetTime as number) ?? (r.netTime as number),
        distanceFromStart: r.distanceFromStart as number,
        netPace: (r.netPace as string) || (r.splitPace as string),
        splitPace: r.splitPace as string,
        splitNo: r.splitNo as number,
        splitDesc: r.splitDesc as string,
        overallRank: r.overallRank as number,
        genderRank: r.genderRank as number,
    })), [timingRecords]);

    // Render the offscreen mirror to a JPEG data URL. JPEG (quality 0.82,
    // pixelRatio 1.5) keeps the file ~1MB instead of PNG's ~5MB so iOS Safari
    // can actually hold it in memory and save it. Centralised so both the
    // download button and the mobile auto-preview reuse the same Safari/iOS
    // workarounds (wait for img decode, then call the encoder twice).
    const renderCertImage = useCallback(async (): Promise<string | null> => {
        const target = certFullRef.current;
        if (!target) return null;
        const { toJpeg } = await import('html-to-image');
        await document.fonts.ready;
        const imgs = Array.from(target.querySelectorAll('img'));
        await Promise.all(imgs.map(async img => {
            if (!(img.complete && img.naturalWidth > 0)) {
                await new Promise<void>(resolve => {
                    const done = () => resolve();
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    setTimeout(done, 5000);
                });
            }
            if (typeof img.decode === 'function') {
                try { await img.decode(); } catch { /* ignore */ }
            }
        }));
        const opts = {
            pixelRatio: 1.5,
            quality: 0.82,
            cacheBust: true,
            backgroundColor: campaign?.certBgColor || '#1a1a2e',
            skipFonts: true,
        };
        // Safari first call often drops the bg image; second call after a tick
        // reliably renders the full composition.
        await toJpeg(target, opts).catch(() => null);
        await new Promise(r => setTimeout(r, 120));
        return await toJpeg(target, opts);
    }, [campaign]);

    // On mobile, generate the preview image automatically so the user can
    // long-press it to invoke the native "Save Image" menu.
    useEffect(() => {
        if (!isMobile || !runner || !campaign?.isApproveCertificate) return;
        if (previewDataUrl || generatingPreview) return;
        let cancelled = false;
        (async () => {
            setGeneratingPreview(true);
            try {
                // Give the offscreen mirror a frame to mount.
                await new Promise(r => setTimeout(r, 50));
                const url = await renderCertImage();
                if (!cancelled && url) setPreviewDataUrl(url);
            } catch (err) {
                console.error('Preview generation failed', err);
            } finally {
                if (!cancelled) setGeneratingPreview(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isMobile, runner, campaign, previewDataUrl, generatingPreview, renderCertImage]);

    const handleDownload = useCallback(async () => {
        if (!runner) return;
        setDownloading(true);
        try {
            const dataUrl = previewDataUrl || await renderCertImage();
            if (!dataUrl) throw new Error('Render failed');
            const filename = `certificate-${runner.bib || 'runner'}.jpg`;

            // iOS Safari ignores the `download` attribute on <a> for large
            // data URLs and won't save to Photos via that path. Use Web Share
            // with a File when possible — that gives the user "Save Image"
            // / "Save to Files" / AirDrop.
            const isIOS = typeof navigator !== 'undefined'
                && /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS && typeof navigator.share === 'function') {
                try {
                    const blob = await (await fetch(dataUrl)).blob();
                    const file = new File([blob], filename, { type: 'image/jpeg' });
                    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'ใบประกาศ' });
                        return;
                    }
                } catch (shareErr) {
                    // User cancelled or browser blocked — fall through to
                    // opening the image in a new tab so they can long-press.
                    if ((shareErr as Error)?.name === 'AbortError') return;
                }
                // Fallback for iOS when share is unavailable: open the image
                // in a new tab; the user can long-press → Save to Photos.
                const win = window.open();
                if (win) {
                    win.document.write(
                        `<title>ใบประกาศ</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUrl}" alt="certificate" style="max-width:100%;height:auto"/></body>`
                    );
                    win.document.close();
                    return;
                }
            }

            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Download failed', err);
            alert('ดาวน์โหลดไม่สำเร็จ');
        } finally {
            setDownloading(false);
        }
    }, [runner, previewDataUrl, renderCertImage]);

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
            <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading...</p>
        </div>
    );

    if (error || !runner) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600 }}>{error || 'ไม่พบข้อมูลนักวิ่ง'}</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>← กลับ</Link>
        </div>
    );

    if (!campaign?.isApproveCertificate) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#94a3b8', fontSize: 16, fontWeight: 600 }}>กิจกรรมนี้ยังไม่เปิดให้ดาวน์โหลดใบประกาศ</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>← กลับ</Link>
        </div>
    );

    const isFinished = (runner.status || '').toLowerCase() === 'finished';
    if (!isFinished) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#f59e0b', fontSize: 16, fontWeight: 600 }}>ใบประกาศพร้อมเมื่อนักวิ่งจบการแข่งขันแล้วเท่านั้น</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>← กลับ</Link>
        </div>
    );

    const elements: CertElement[] = (Array.isArray(campaign.certLayout) && campaign.certLayout.length > 0)
        ? campaign.certLayout
        : DEFAULT_ELEMENTS;
    const bgImage = campaign.certBackgroundImage || '';
    const bgColor = campaign.certBgColor || '#1a1a2e';
    const bgOpacity = typeof campaign.certBgOpacity === 'number' ? campaign.certBgOpacity : 1;
    const scale = canvasW / CANVAS_REF_W;
    const paper = campaign.certPaperSize || 'a4-landscape';
    const aspectRatio = paper === 'a4-portrait' ? '210/297'
        : paper === 'hd-landscape' ? '1920/1080'
        : paper === 'hd-portrait' ? '1080/1920'
        : '297/210';
    const paperAspect = paperRatioWH(paper);

    // Renders the certificate body. Used twice: visible (responsive scale)
    // and an offscreen mirror at fixed CANVAS_REF_W so the downloaded image
    // is identical regardless of device width.
    const renderCertBody = (renderScale: number) => (
        <>
            {bgImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bgImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: bgOpacity, pointerEvents: 'none', zIndex: 0 }} />
            )}
            {elements.map(el => {
                const isText = !el.type || el.type === 'text';
                const isImage = el.type === 'image';
                const isShape = el.type === 'shape';
                const isFlag = el.type === 'flag';
                const isTable = el.type === 'table';
                const hasHeight = isImage || isShape || isFlag || isTable;
                const heightPct = getElementHeight(el, paperAspect);
                const rot = el.rotation || 0;
                const br = el.borderRadius || 0;
                const filterParts: string[] = [];
                if (isImage) {
                    if (typeof el.brightness === 'number' && el.brightness !== 100) filterParts.push(`brightness(${el.brightness}%)`);
                    if (typeof el.contrast === 'number' && el.contrast !== 100) filterParts.push(`contrast(${el.contrast}%)`);
                    if (typeof el.blur === 'number' && el.blur > 0) filterParts.push(`blur(${el.blur}px)`);
                }
                const filterStr = filterParts.length > 0 ? filterParts.join(' ') : undefined;
                const shadowStr = el.shadowEnabled
                    ? `${el.shadowX || 0}px ${el.shadowY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor || 'rgba(0,0,0,0.5)'}`
                    : undefined;
                const textShadow = isText && shadowStr ? shadowStr : undefined;
                const boxShadow = !isText && !isImage && shadowStr ? shadowStr : undefined;
                const imgDropShadow = isImage && shadowStr ? `drop-shadow(${shadowStr})` : '';
                const combinedImgFilter = [filterStr, imgDropShadow].filter(Boolean).join(' ') || undefined;
                return (
                    <div
                        key={el.id}
                        style={{
                            position: 'absolute',
                            left: `${el.x}%`,
                            top: `${el.y}%`,
                            width: `${el.width}%`,
                            height: hasHeight ? `${heightPct}%` : undefined,
                            transform: `translate(-50%,-50%) rotate(${rot}deg)`,
                            fontSize: `${el.fontSize * renderScale}px`,
                            fontFamily: el.fontFamily,
                            color: el.color,
                            fontWeight: el.fontWeight,
                            fontStyle: el.fontStyle,
                            textAlign: el.textAlign,
                            opacity: el.opacity,
                            letterSpacing: `${el.letterSpacing * renderScale}px`,
                            padding: isText ? '2px 4px' : 0,
                            boxSizing: 'border-box',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.3,
                            display: hasHeight ? 'block' : undefined,
                            borderRadius: (isImage || isShape) && br > 0 ? `${br}px` : undefined,
                            overflow: (isImage || isShape) && br > 0 ? 'hidden' : undefined,
                            textShadow,
                            boxShadow,
                            zIndex: 1,
                        }}
                    >
                        {isImage && el.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block', filter: combinedImgFilter, borderRadius: br > 0 ? `${br}px` : undefined }} />
                        ) : isShape ? <ShapeRender el={el} />
                        : isFlag ? <FlagRender el={el} runner={runner} fontScale={renderScale} />
                        : isTable ? <TableRender el={el} splits={splits} fontScale={renderScale} />
                        : substituteFields(el.content, runner, campaign)}
                    </div>
                );
            })}
        </>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '16px 12px 32px', fontFamily: "'Sarabun', sans-serif" }}>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Prompt:wght@400;700&family=Kanit:wght@400;700&family=Playfair+Display:wght@400;700&display=swap" />

            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                        ← กลับ
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {isMobile && (
                            <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                                กดค้างเพื่อดาวน์โหลด
                            </span>
                        )}
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            style={{
                                padding: '10px 22px',
                                background: downloading ? '#94a3b8' : '#2563eb',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 10,
                                fontWeight: 700,
                                fontSize: 14,
                                cursor: downloading ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 3v12" />
                                <path d="m7 10 5 5 5-5" />
                                <path d="M5 21h14" />
                            </svg>
                            <span>{downloading ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลดใบประกาศ'}</span>
                        </button>
                    </div>
                </div>

                <div ref={setCanvasWrapEl} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', position: 'relative' }}>
                    {isMobile && previewDataUrl ? (
                        // On mobile we swap the composed cert for a real <img> so
                        // the native long-press menu offers "Save Image" / "Download".
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewDataUrl}
                            alt="Certificate"
                            style={{ width: '100%', display: 'block', aspectRatio, background: bgColor }}
                        />
                    ) : (
                        // Render the CSS-composed cert on desktop AND on mobile
                        // while the JPEG is still being generated in the
                        // background — so users always see their certificate
                        // immediately, then it silently swaps to <img> on mobile
                        // once ready (which enables long-press save).
                        <div
                            ref={certRef}
                            style={{
                                position: 'relative',
                                width: '100%',
                                aspectRatio,
                                background: bgColor,
                                overflow: 'hidden',
                                userSelect: 'none',
                            }}
                        >
                            {renderCertBody(scale)}
                        </div>
                    )}
                </div>

                <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 12 }}>
                    Certificate generated by Action Timing · {campaign?.name || ''}
                </p>
            </div>

            {/* Offscreen full-size mirror used for download capture so
                the exported PNG is consistent across desktop and mobile. */}
            <div
                aria-hidden
                style={{
                    position: 'fixed',
                    left: -99999,
                    top: 0,
                    width: CANVAS_REF_W,
                    pointerEvents: 'none',
                    opacity: 0,
                }}
            >
                <div
                    ref={certFullRef}
                    style={{
                        position: 'relative',
                        width: CANVAS_REF_W,
                        aspectRatio,
                        background: bgColor,
                        overflow: 'hidden',
                    }}
                >
                    {renderCertBody(1)}
                </div>
            </div>
        </div>
    );
}
