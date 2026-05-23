'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ─── Types — must match /admin/certificates editor ────────────────────────────

interface CertElement {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height?: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    opacity: number;
    letterSpacing: number;
    type?: 'text' | 'image';
    src?: string;
    aspectRatio?: number;
    // effects (mirrors editor)
    rotation?: number;
    borderRadius?: number;
    brightness?: number;
    contrast?: number;
    blur?: number;
    shadowEnabled?: boolean;
    shadowColor?: string;
    shadowBlur?: number;
    shadowX?: number;
    shadowY?: number;
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
    status: string;
    netTime?: number;
    gunTime?: number;
    finishTime?: string;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
    categoryRank?: number;
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
    '{{name}}': '-', '{{name_th}}': '-', '{{bib}}': '-',
    '{{category}}': '-', '{{gender}}': '-', '{{time}}': '-',
    '{{gun_time}}': '-', '{{rank}}': '-', '{{gender_rank}}': '-',
    '{{age_rank}}': '-', '{{event_name}}': '-', '{{event_date}}': '-',
};

// Fallback layout when the campaign has no saved cert layout yet — mirrors editor's DEFAULT_ELEMENTS.
const DEFAULT_ELEMENTS: CertElement[] = [
    { id: 'title', content: 'Certificate of Achievement', x: 50, y: 12, width: 80, fontSize: 44, fontFamily: 'Playfair Display, serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 3 },
    { id: 'event', content: '{{event_name}}', x: 50, y: 24, width: 75, fontSize: 20, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.85, letterSpacing: 1 },
    { id: 'presented', content: 'This certificate is presented to', x: 50, y: 34, width: 60, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'italic', textAlign: 'center', opacity: 0.65, letterSpacing: 0 },
    { id: 'name', content: '{{name}}', x: 50, y: 47, width: 70, fontSize: 48, fontFamily: 'Playfair Display, serif', color: '#ffffff', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'details', content: 'BIB: {{bib}}   |   {{category}}   |   {{gender}}', x: 50, y: 59, width: 65, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.8, letterSpacing: 0 },
    { id: 'time', content: '{{time}}', x: 50, y: 70, width: 40, fontSize: 38, fontFamily: 'Sarabun, sans-serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'rank', content: 'Overall #{{rank}}  |  Gender #{{gender_rank}}  |  Age #{{age_rank}}', x: 50, y: 81, width: 70, fontSize: 13, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.6, letterSpacing: 0 },
    { id: 'date', content: '{{event_date}}', x: 15, y: 92, width: 24, fontSize: 12, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.55, letterSpacing: 0 },
];

// ─── Helpers — must match editor ─────────────────────────────────────────────

function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '-';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function substituteFields(content: string, runner: RunnerData | null, campaign: CampaignData | null): string {
    if (!runner) return content.replace(/\{\{[^}]+\}\}/g, m => FIELD_PREVIEWS[m] ?? m);
    const netTime = typeof runner.netTime === 'number' && runner.netTime > 0
        ? formatTime(runner.netTime)
        : (runner.finishTime || '-');
    const gunTime = typeof runner.gunTime === 'number' && runner.gunTime > 0 ? formatTime(runner.gunTime) : '-';
    const map: Record<string, string> = {
        '{{name}}': `${runner.firstName || ''} ${runner.lastName || ''}`.trim() || '-',
        '{{name_th}}': runner.firstNameTh
            ? `${runner.firstNameTh} ${runner.lastNameTh ?? ''}`.trim()
            : `${runner.firstName || ''} ${runner.lastName || ''}`.trim() || '-',
        '{{bib}}': runner.bib ?? '-',
        '{{category}}': runner.category ?? '-',
        '{{gender}}': runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : (runner.gender || '-'),
        '{{time}}': netTime,
        '{{gun_time}}': gunTime,
        '{{rank}}': runner.overallRank && runner.overallRank > 0 ? String(runner.overallRank) : '-',
        '{{gender_rank}}': runner.genderRank && runner.genderRank > 0 ? String(runner.genderRank) : '-',
        '{{age_rank}}': runner.ageGroupRank && runner.ageGroupRank > 0
            ? String(runner.ageGroupRank)
            : (runner.categoryRank && runner.categoryRank > 0 ? String(runner.categoryRank) : '-'),
        '{{event_name}}': campaign?.nameTh ?? campaign?.name ?? '-',
        '{{event_date}}': campaign?.eventDate
            ? new Date(campaign.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-',
    };
    return content.replace(/\{\{[^}]+\}\}/g, m => map[m] ?? m);
}

function getElementHeight(el: CertElement, ratioWH: number): number {
    if (el.type !== 'image') return 0;
    return Math.max(4, Math.min(100, el.width * ratioWH / Math.max(0.1, el.aspectRatio || 1)));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificatePage() {
    const { id: runnerId } = useParams<{ id: string }>();
    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const canvasWrapRef = useRef<HTMLDivElement>(null);
    const certRef = useRef<HTMLDivElement>(null);
    const [canvasW, setCanvasW] = useState(800);

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
        const measure = () => {
            if (canvasWrapRef.current) setCanvasW(canvasWrapRef.current.clientWidth);
        };
        measure();
        if (typeof ResizeObserver !== 'undefined' && canvasWrapRef.current) {
            const obs = new ResizeObserver(measure);
            obs.observe(canvasWrapRef.current);
            return () => obs.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const handleDownload = useCallback(async () => {
        if (!certRef.current || !runner) return;
        setDownloading(true);
        try {
            const { toPng } = await import('html-to-image');
            // Capture at 2x device width for crisp output regardless of viewport size.
            await document.fonts.ready;
            const dataUrl = await toPng(certRef.current, {
                pixelRatio: 2,
                cacheBust: true,
                backgroundColor: '#1a1a2e',
                skipFonts: true,
            });
            const link = document.createElement('a');
            link.download = `certificate-${runner.bib || 'runner'}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Download failed', err);
            alert('ดาวน์โหลดไม่สำเร็จ');
        } finally {
            setDownloading(false);
        }
    }, [runner]);

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
    const ratioWH = paperRatioWH(paper);

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '16px 12px 32px', fontFamily: "'Sarabun', sans-serif" }}>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Prompt:wght@400;700&family=Kanit:wght@400;700&family=Playfair+Display:wght@400;700&display=swap" />

            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                        ← กลับ
                    </Link>
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
                            gap: 6,
                        }}
                    >
                        {downloading ? '⏳ กำลังสร้างไฟล์...' : '📥 ดาวน์โหลดใบประกาศ'}
                    </button>
                </div>

                <div ref={canvasWrapRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
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
                        {bgImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={bgImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: bgOpacity, pointerEvents: 'none', zIndex: 0 }} />
                        )}
                        {elements.map(el => {
                            const imageHeight = getElementHeight(el, ratioWH);
                            const isImage = el.type === 'image';
                            const rot = el.rotation || 0;
                            const br = el.borderRadius || 0;
                            const filterParts: string[] = [];
                            if (isImage) {
                                if (typeof el.brightness === 'number' && el.brightness !== 100) filterParts.push(`brightness(${el.brightness}%)`);
                                if (typeof el.contrast === 'number' && el.contrast !== 100) filterParts.push(`contrast(${el.contrast}%)`);
                                if (typeof el.blur === 'number' && el.blur > 0) filterParts.push(`blur(${el.blur}px)`);
                            }
                            const shadowStr = el.shadowEnabled
                                ? `${el.shadowX || 0}px ${el.shadowY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor || 'rgba(0,0,0,0.5)'}`
                                : undefined;
                            if (isImage && shadowStr) filterParts.push(`drop-shadow(${shadowStr})`);
                            const imgFilter = filterParts.length > 0 ? filterParts.join(' ') : undefined;
                            return (
                                <div
                                    key={el.id}
                                    style={{
                                        position: 'absolute',
                                        left: `${el.x}%`,
                                        top: `${el.y}%`,
                                        width: `${el.width}%`,
                                        height: isImage ? `${imageHeight}%` : undefined,
                                        transform: `translate(-50%,-50%) rotate(${rot}deg)`,
                                        fontSize: `${el.fontSize * scale}px`,
                                        fontFamily: el.fontFamily,
                                        color: el.color,
                                        fontWeight: el.fontWeight,
                                        fontStyle: el.fontStyle,
                                        textAlign: el.textAlign,
                                        opacity: el.opacity,
                                        letterSpacing: `${el.letterSpacing * scale}px`,
                                        padding: isImage ? 0 : '2px 4px',
                                        boxSizing: 'border-box',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        lineHeight: 1.3,
                                        textShadow: !isImage && shadowStr ? shadowStr : undefined,
                                        borderRadius: isImage && br > 0 ? `${br}px` : undefined,
                                        overflow: isImage && br > 0 ? 'hidden' : undefined,
                                        zIndex: 1,
                                    }}
                                >
                                    {isImage && el.src ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block', filter: imgFilter, borderRadius: br > 0 ? `${br}px` : undefined }} />
                                    ) : (
                                        substituteFields(el.content, runner, campaign)
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 12 }}>
                    Certificate generated by Action Timing · {campaign?.name || ''}
                </p>
            </div>
        </div>
    );
}
