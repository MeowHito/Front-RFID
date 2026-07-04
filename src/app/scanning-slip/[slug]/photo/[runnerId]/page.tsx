'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { computeAwardsForCategory, formatAwardLabel } from '@/lib/awards';
import { isNationalitySplitCategory } from '@/lib/nationality';
import {
    RunnerData,
    TimingRecord,
    CampaignData,
    computeTargetBandLabel,
    Template2,
} from '@/components/eslip/eslip-templates';

/** Resize an image file to max dimension and compress to JPEG base64. */
function resizeAndCompress(file: File, maxSize: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
                    else { w = Math.round((w * maxSize) / h); h = maxSize; }
                }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function ScanningSlipPhotoPage() {
    const params = useParams();
    const slug = params.slug as string;
    const runnerId = params.runnerId as string;
    const slipRef = useRef<HTMLDivElement>(null);

    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [awardLabel, setAwardLabel] = useState<string | null>(null);
    const [targetBandLabel, setTargetBandLabel] = useState<string | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // Load campaign (config) + runner detail (ranks + splits).
    useEffect(() => {
        if (!slug || !runnerId) return;
        (async () => {
            try {
                setLoading(true);
                const [cRes, rRes] = await Promise.all([
                    fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' }),
                    fetch(`/api/runner/${runnerId}`, { cache: 'no-store' }),
                ]);
                const c = cRes.ok ? await cRes.json() : null;
                const detail = await rRes.json();
                if (detail?.status?.code === '200' && detail.data?.runner) {
                    const r: RunnerData = detail.data.runner;
                    setCampaign(c);
                    setRunner(r);
                    setTimings(detail.data.timingRecords || []);
                    setTargetBandLabel(computeTargetBandLabel(r, c));
                    // Existing photo (from a previous upload in this session)
                    try {
                        const pRes = await fetch(`/api/runners/${runnerId}`, { cache: 'no-store' });
                        if (pRes.ok) { const pd = await pRes.json(); if (pd.photoUrl) setPhotoUrl(pd.photoUrl); }
                    } catch { /* ignore */ }
                } else {
                    setError(detail?.status?.description || 'ไม่พบข้อมูลนักวิ่ง');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
            } finally {
                setLoading(false);
            }
        })();
    }, [slug, runnerId]);

    // Compute AWARD (same algorithm as the e-slip page / scan display).
    useEffect(() => {
        if (!runner || !campaign?._id || !runner.category) { setAwardLabel(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const p = new URLSearchParams({ campaignId: campaign._id, category: runner.category, limit: '10000', skipStatusCounts: 'true' });
                const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
                if (!res.ok) { if (!cancelled) setAwardLabel(null); return; }
                const data = await res.json();
                const pool = Array.isArray(data?.data) ? data.data : [];
                const awards = computeAwardsForCategory(pool, {
                    overallDisplayCount: campaign.overallDisplayCount,
                    ageGroupDisplayCount: campaign.ageGroupDisplayCount,
                    excludeOverallFromAgeGroup: campaign.excludeOverallFromAgeGroup,
                    excludeOverallThaiFromAgeGroup: campaign.excludeOverallThaiFromAgeGroup,
                    excludeOverallForeignFromAgeGroup: campaign.excludeOverallForeignFromAgeGroup,
                    separateOverallByNationality: isNationalitySplitCategory(campaign.separateOverallNationalityCategories, runner.category),
                });
                const mine = awards.get(runner._id);
                if (!cancelled) setAwardLabel(mine ? formatAwardLabel(mine) : null);
            } catch { if (!cancelled) setAwardLabel(null); }
        })();
        return () => { cancelled = true; };
    }, [runner, campaign]);

    const showField = useCallback((key: string) => {
        const vf = campaign?.eslipVisibleFields;
        const hasAgeGroup = !!runner?.ageGroup;
        if (!hasAgeGroup && (key === 'categoryRank' || key === 'ageGroup')) return false;
        return !vf || vf.length === 0 || vf.includes(key);
    }, [campaign, runner]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file || !runnerId) return;
        setUploading(true);
        try {
            const base64 = await resizeAndCompress(file, 900, 0.82);
            const res = await fetch(`/api/runners/${runnerId}/photo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: base64 }),
            });
            if (res.ok) {
                setPhotoUrl(base64);
            } else {
                alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
            }
        } catch (err) {
            console.error('Photo upload error:', err);
            alert('ไม่สามารถอัปโหลดรูปภาพได้');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async () => {
        if (!slipRef.current) return;
        setDownloading(true);
        try {
            const { toJpeg } = await import('html-to-image');
            const opts = { quality: 0.95, pixelRatio: 3, backgroundColor: '#0f172a', cacheBust: true };
            await toJpeg(slipRef.current, opts).catch(() => {});
            const dataUrl = await toJpeg(slipRef.current, opts);
            const fileName = `ACTION_ESlip_${runner?.bib || 'runner'}.jpg`;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile && typeof navigator.share === 'function') {
                try {
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const imageFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
                    const shareData: ShareData = { files: [imageFile] };
                    if (navigator.canShare?.(shareData)) { await navigator.share(shareData); return; }
                } catch (shareErr) {
                    if ((shareErr as Error)?.name === 'AbortError') return;
                }
            }
            if (isMobile) { setPreviewImage(dataUrl); return; }
            const link = document.createElement('a');
            link.download = fileName; link.href = dataUrl; link.click();
        } catch (err) {
            console.error('E-Slip download error:', err);
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center">
                    <div className="w-10 h-10 border-[3px] border-slate-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">กำลังโหลด...</p>
                </div>
            </div>
        );
    }

    if (error || !runner) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt] p-6">
                <div className="text-center text-white">
                    <p className="text-5xl mb-4">😔</p>
                    <p className="text-slate-400">{error || 'ไม่พบข้อมูล'}</p>
                </div>
            </div>
        );
    }

    const hasPhoto = !!photoUrl;

    return (
        <div className="min-h-screen flex flex-col items-center bg-slate-900 font-[Prompt] px-3 py-5">
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

            <div className="w-full max-w-[380px] text-center mb-4">
                <div className="text-sm font-extrabold text-green-500 uppercase tracking-widest">E-Slip</div>
                <div className="text-lg font-black text-white mt-1 leading-tight">{campaign?.name || 'Race Event'}</div>
                <div className="text-xs text-slate-400 mt-1">
                    {hasPhoto ? '✓ ใส่รูปแล้ว — บันทึกภาพ E-Slip ของคุณได้เลย' : '📸 เพิ่มรูปของคุณ แล้วรูปจะขึ้นบนจอทันที'}
                </div>
            </div>

            {/* E-Slip card (Photo template) — long-press to save on mobile */}
            <div
                className="w-full flex flex-col items-center select-none"
                onContextMenu={(e) => e.preventDefault()}
            >
                <Template2
                    runner={runner}
                    timings={timings}
                    campaign={campaign}
                    slipRef={slipRef}
                    showField={showField}
                    bgImage={photoUrl}
                    textColorMode={hasPhoto ? 'light' : 'dark'}
                    awardLabel={awardLabel}
                    targetBandLabel={targetBandLabel}
                />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 w-full max-w-[380px] mt-5">
                <input type="file" id="slip-photo" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />
                <label htmlFor="slip-photo" className={`flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center cursor-pointer bg-white text-black flex justify-center items-center gap-2 ${uploading ? 'opacity-70' : ''}`}>
                    {uploading ? '⏳ กำลังอัปโหลด...' : hasPhoto ? '🔄 เปลี่ยนรูป' : '📷 เลือก / ถ่ายรูป'}
                </label>
                {hasPhoto && (
                    <button onClick={handleDownload} disabled={downloading}
                        className={`flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center border-none bg-green-600 text-white flex justify-center items-center gap-2 ${downloading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                    >
                        {downloading ? '⏳ กำลังประมวลผล...' : '📥 บันทึกภาพ'}
                    </button>
                )}
            </div>

            {previewImage && (
                <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center p-4 gap-4">
                    <img src={previewImage} alt="E-Slip" className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl" onContextMenu={(e) => e.preventDefault()} />
                    <div className="text-center text-slate-300 text-sm bg-white/10 rounded-xl px-5 py-3 leading-relaxed max-w-[300px]">
                        📲 <b className="text-green-400">กดค้างที่รูป</b> แล้วเลือก<br />
                        <b className="text-green-400">&quot;บันทึกรูปภาพ&quot;</b><br />
                        <span className="text-slate-400 text-xs">เพื่อบันทึกลงแกลเลอรีของคุณ</span>
                    </div>
                    <button onClick={() => setPreviewImage(null)} className="px-8 py-3 rounded-xl bg-white/10 text-white font-bold text-sm border border-white/20 cursor-pointer">
                        ✕ ปิด
                    </button>
                </div>
            )}
        </div>
    );
}
