'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface RunnerData {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender?: string;
    category?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
}

interface CampaignData {
    name: string;
    eventDate: string;
    location?: string;
    isApproveCertificate?: boolean;
    certLayout?: any;
}

function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '--:--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CertificatePage() {
    const { id: runnerId } = useParams<{ id: string }>();
    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!runnerId) return;
        fetch(`/api/runner/${runnerId}`)
            .then(r => r.json())
            .then(data => {
                if (data.success === false) { setError('Runner not found'); return; }
                setRunner(data.runner);
                setCampaign(data.campaign);
            })
            .catch(() => setError('Failed to load data'))
            .finally(() => setLoading(false));
    }, [runnerId]);

    const renderCertificate = useCallback(() => {
        if (!canvasRef.current || !runner || !campaign?.certLayout) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const layout = campaign.certLayout;
        const W = layout.width || 1200;
        const H = layout.height || 850;
        canvas.width = W;
        canvas.height = H;

        // Background
        if (layout.backgroundImage) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.drawImage(img, 0, 0, W, H);
                drawElements(ctx, layout.elements || [], runner, campaign);
            };
            img.src = layout.backgroundImage;
        } else {
            ctx.fillStyle = layout.backgroundColor || '#ffffff';
            ctx.fillRect(0, 0, W, H);
            drawElements(ctx, layout.elements || [], runner, campaign);
        }
    }, [runner, campaign]);

    useEffect(() => {
        renderCertificate();
    }, [renderCertificate]);

    const handleDownload = () => {
        if (!canvasRef.current) return;
        const link = document.createElement('a');
        link.download = `certificate-${runner?.bib || 'runner'}.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
            <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading...</p>
        </div>
    );

    if (error || !runner) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600 }}>{error || 'Runner not found'}</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>Back to runner</Link>
        </div>
    );

    if (!campaign?.isApproveCertificate) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#94a3b8', fontSize: 16, fontWeight: 600 }}>Certificate is not available for this event.</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>Back to runner</Link>
        </div>
    );

    if (runner.status !== 'finished') return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: 16 }}>
            <p style={{ color: '#f59e0b', fontSize: 16, fontWeight: 600 }}>Certificate is available only for finished runners.</p>
            <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', textDecoration: 'underline' }}>Back to runner</Link>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '24px 16px' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Link href={`/runner/${runnerId}`} style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        ← Back
                    </Link>
                    <button
                        onClick={handleDownload}
                        style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                    >
                        📥 Download Certificate
                    </button>
                </div>
                <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                    <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
                </div>
            </div>
        </div>
    );
}

function drawElements(ctx: CanvasRenderingContext2D, elements: any[], runner: RunnerData, campaign: CampaignData) {
    for (const el of elements) {
        if (el.type !== 'text') continue;
        const text = resolveText(el.content || '', runner, campaign);
        const x = (el.x / 100) * ctx.canvas.width;
        const y = (el.y / 100) * ctx.canvas.height;
        ctx.font = `${el.fontWeight || 'normal'} ${el.fontSize || 24}px ${el.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = el.color || '#000000';
        ctx.textAlign = (el.textAlign as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }
}

function resolveText(template: string, runner: RunnerData, campaign: CampaignData): string {
    return template
        .replace(/\{name\}/gi, `${runner.firstName} ${runner.lastName}`.trim())
        .replace(/\{firstName\}/gi, runner.firstName || '')
        .replace(/\{lastName\}/gi, runner.lastName || '')
        .replace(/\{bib\}/gi, runner.bib || '')
        .replace(/\{category\}/gi, runner.category || '')
        .replace(/\{time\}/gi, formatTime(runner.netTime || runner.gunTime))
        .replace(/\{netTime\}/gi, formatTime(runner.netTime))
        .replace(/\{gunTime\}/gi, formatTime(runner.gunTime))
        .replace(/\{overallRank\}/gi, String(runner.overallRank || '-'))
        .replace(/\{genderRank\}/gi, String(runner.genderRank || '-'))
        .replace(/\{categoryRank\}/gi, String(runner.categoryRank || '-'))
        .replace(/\{gender\}/gi, runner.gender || '')
        .replace(/\{eventName\}/gi, campaign.name || '')
        .replace(/\{eventDate\}/gi, campaign.eventDate || '')
        .replace(/\{location\}/gi, campaign.location || '');
}
