'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { computeAwardsForCategory, formatAwardLabel } from '@/lib/awards';
import { computeBuriramWinnerIds } from '@/lib/province';
import { isNationalitySplitCategory } from '@/lib/nationality';
import { useLanguage } from '@/lib/language-context';
import {
    RunnerData,
    TimingRecord,
    CampaignData,
    ESlipV2Element,
    computeTargetBandLabel,
    Template1,
    Template2,
    Template3,
    ESlipV2Renderer,
} from '@/components/eslip/eslip-templates';

export default function ESlipPage() {
    const { language } = useLanguage();
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;
    const slipRef = useRef<HTMLDivElement>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [awardLabel, setAwardLabel] = useState<string | null>(null);
    const [bestOfBuriram, setBestOfBuriram] = useState(false);
    // Award line shown on the slip: "Best of Buriram" leads (when earned), then the
    // Overall / Age-group award, separated by " | ".
    const displayAwardLabel = useMemo(() => {
        const parts = [bestOfBuriram ? 'Best of Buriram' : null, awardLabel || null].filter(Boolean);
        return parts.length ? parts.join(' | ') : null;
    }, [bestOfBuriram, awardLabel]);
    const targetBandLabel = useMemo(() => (runner ? computeTargetBandLabel(runner, campaign) : null), [runner, campaign]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bgImage, setBgImage] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [activeTemplate, setActiveTemplate] = useState<string>('template3');
    const [availableTemplates, setAvailableTemplates] = useState<string[]>(['template3', 'template2']);
    const [photoTextColor, setPhotoTextColor] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/runner/${runnerId}`);
                const json = await res.json();
                if (json.status?.code === '200' && json.data) {
                    setRunner(json.data.runner);
                    setTimings(json.data.timingRecords || []);
                    let c = json.data.campaign;
                    // Back-compat: ensure layout has a splits element so the splits table renders
                    if (c?.eslipV2Layout?.elements && !c.eslipV2Layout.elements.some((el: ESlipV2Element) => el.type === 'splits')) {
                        const cw = c.eslipV2Layout.canvasWidth || 380;
                        const ch = c.eslipV2Layout.canvasHeight || 700;
                        const w = cw - 40;
                        const h = 200;
                        const defaultSplits: ESlipV2Element = {
                            id: `el-splits-default`, type: 'splits', field: 'static', staticText: '',
                            x: 20, y: Math.max(0, ch - h - 16), width: w, height: h,
                            fontSize: 13, fontWeight: '900', color: '#000000', align: 'left',
                            prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 50,
                            italic: false, uppercase: false, letterSpacing: 0,
                            header1: 'CHECKPOINT', header2: 'TIME', header3: 'PACE', rowGap: 6, colGap: 4,
                        };
                        c = { ...c, eslipV2Layout: { ...c.eslipV2Layout, elements: [...c.eslipV2Layout.elements, defaultSplits] } };
                    }
                    setCampaign(c || null);
                    // Set available templates from admin config
                    const adminTemplates = c?.eslipTemplates;
                    if (Array.isArray(adminTemplates) && adminTemplates.length > 0) {
                        const filtered = adminTemplates.filter((t: string) => t !== 'template1');
                        const sorted = (filtered.length > 0 ? filtered : ['template2', 'template3']).sort((a: string, b: string) => {
                            if (a === 'template3') return -1;
                            if (b === 'template3') return 1;
                            return 0;
                        });
                        setAvailableTemplates(sorted);
                        setActiveTemplate(sorted.includes('template3') ? 'template3' : sorted[0] || 'template3');
                    } else {
                        setAvailableTemplates(['template3', 'template2']);
                        setActiveTemplate('template3');
                    }
                } else {
                    setError(json.status?.description || 'Runner not found');
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    // Compute this runner's AWARD (Overall / Age Group) — same algorithm as the
    // public event table + winner boards — by pulling the whole category pool.
    useEffect(() => {
        if (!runner || !campaign?._id || !runner.category) { setAwardLabel(null); setBestOfBuriram(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const p = new URLSearchParams({ campaignId: campaign._id, category: runner.category, limit: '10000', skipStatusCounts: 'true' });
                const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
                if (!res.ok) { if (!cancelled) { setAwardLabel(null); setBestOfBuriram(false); } return; }
                const data = await res.json();
                const pool = Array.isArray(data?.data) ? data.data : [];
                // "Best of Buriram" — same top-N-per-gender local award as the board.
                const buriramTopN = Math.max(1, campaign.bestOfDisplayCount || 1);
                const buriramIds = computeBuriramWinnerIds(pool, buriramTopN);
                if (!cancelled) setBestOfBuriram(buriramIds.has(runner._id));
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
            } catch { if (!cancelled) { setAwardLabel(null); setBestOfBuriram(false); } }
        })();
        return () => { cancelled = true; };
    }, [runner, campaign?._id, campaign?.overallDisplayCount, campaign?.ageGroupDisplayCount, campaign?.bestOfDisplayCount, campaign?.excludeOverallFromAgeGroup, campaign?.excludeOverallThaiFromAgeGroup, campaign?.excludeOverallForeignFromAgeGroup, campaign?.excludeAgeGroupTop, campaign?.separateOverallNationalityCategories]);

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            let dataUrl: string;
            if (file.size > 5 * 1024 * 1024) {
                const { compressImage } = await import('@/lib/image-utils');
                dataUrl = await compressImage(file);
            } else {
                dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                });
            }
            setBgImage(null);
            requestAnimationFrame(() => setBgImage(dataUrl));
        } catch (err) {
            console.error('Background image upload error:', err);
            alert('ไม่สามารถอัปโหลดรูปภาพได้');
        }
    };

    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const handleDownload = async () => {
        if (!slipRef.current) return;
        setDownloading(true);
        try {
            const { toJpeg } = await import('html-to-image');
            const v2Mode = isV2;
            const opts = {
                quality: 0.95,
                pixelRatio: 3,
                backgroundColor: v2Mode ? (campaign?.eslipV2Layout?.background?.color || '#1e293b') : activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a',
                cacheBust: true,
            };
            // Safari/iOS needs a double-render: first pass primes image loading, second captures correctly
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
                    if (navigator.canShare?.(shareData)) {
                        await navigator.share(shareData);
                        return;
                    }
                } catch (shareErr: any) {
                    if (shareErr?.name === 'AbortError') return;
                    console.warn('Share API failed, falling back to preview:', shareErr);
                }
            }

            if (isMobile) {
                setPreviewImage(dataUrl);
                return;
            }

            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('E-Slip download error:', err);
        } finally {
            setDownloading(false);
        }
    };

    const handleCardLongPress = async () => {
        if (!slipRef.current || downloading) return;
        setDownloading(true);
        try {
            const { toJpeg } = await import('html-to-image');
            const v2Mode = campaign?.eslipMode === 'v2' && (campaign?.eslipV2Layout?.elements?.length ?? 0) > 0;
            const opts = {
                quality: 0.95,
                pixelRatio: 3,
                backgroundColor: v2Mode
                    ? (campaign?.eslipV2Layout?.background?.color || '#1e293b')
                    : activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a',
                cacheBust: true,
            };
            await toJpeg(slipRef.current, opts).catch(() => {});
            const dataUrl = await toJpeg(slipRef.current, opts);
            setPreviewImage(dataUrl);
        } catch (err) {
            console.error('Long-press save error:', err);
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
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center text-white">
                    <p className="text-5xl mb-4">😔</p>
                    <p className="text-slate-400">{error || 'ไม่พบข้อมูล'}</p>
                    <button onClick={() => router.back()} className="mt-4 px-6 py-2 rounded-lg bg-green-500 text-white font-semibold border-none cursor-pointer">ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    if (runner.status !== 'finished') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center text-white max-w-[400px] p-8">
                    <p className="text-5xl mb-4">⏳</p>
                    <h2 className="text-xl font-bold mb-2">นักวิ่งยังไม่จบการแข่งขัน</h2>
                    <p className="text-slate-400 mb-4">E-Slip จะพร้อมใช้งานเมื่อนักวิ่ง Finish แล้วเท่านั้น</p>
                    <button onClick={() => router.back()} className="px-6 py-2.5 rounded-xl bg-green-500 text-white font-bold border-none cursor-pointer">ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    const modeIsV2 = campaign?.eslipMode === 'v2';
    const hasV2Layout = modeIsV2 && (campaign?.eslipV2Layout?.elements?.length ?? 0) > 0;
    const isV2 = hasV2Layout;
    const isWhiteTheme = !modeIsV2 && activeTemplate === 'template3';
    const bgColor = isWhiteTheme ? 'bg-slate-100' : 'bg-slate-900';

    return (
        <div className={`min-h-screen flex flex-col items-center ${bgColor} font-[Prompt]`}>
            {/* Header */}
            <header className={`${isWhiteTheme ? 'bg-white border-b border-slate-200' : 'bg-slate-800 border-b border-white/10'} px-4 py-2.5 w-full sticky top-0 z-50`}>
                <div className="max-w-screen-lg mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className={`flex items-center ${isWhiteTheme ? 'border-r border-slate-200' : 'border-r border-white/20'} pr-3 no-underline`}>
                            <Image src={isWhiteTheme ? '/logo-black.png' : '/logo-white.png'} alt="ACTION" width={80} height={26} className="object-contain" />
                        </Link>
                        <span className="text-sm font-extrabold text-green-500 uppercase">E-Slip</span>
                    </div>
                    <button onClick={() => router.back()} className={`text-xs font-bold ${isWhiteTheme ? 'text-slate-500' : 'text-slate-400'} bg-transparent border-none cursor-pointer flex items-center gap-1`}>
                        ← กลับหน้าผลการแข่งขัน
                    </button>
                </div>
            </header>

            <div className="px-2.5 py-5 flex flex-col items-center w-full">
                {/* Template Selector — only for v1 */}
                {!modeIsV2 && availableTemplates.length > 1 && (
                    <div className="mb-4 flex gap-2 flex-wrap justify-center">
                        {availableTemplates.map(t => {
                            const isActive = activeTemplate === t;
                            const label = t === 'template2' ? '📷 Photo' : '🤍 Default';
                            return (
                                <button
                                    key={t}
                                    onClick={() => setActiveTemplate(t)}
                                    className={`px-5 py-2.5 rounded-[14px] text-sm font-extrabold cursor-pointer transition-all duration-200 min-w-[100px]
                                        ${isActive
                                            ? 'bg-gradient-to-br from-green-600 to-green-500 text-white border-2 border-green-500 shadow-lg shadow-green-500/40 scale-105'
                                            : isWhiteTheme
                                                ? 'bg-black/5 text-slate-600 border-2 border-slate-200'
                                                : 'bg-white/10 text-white/70 border-2 border-white/15'
                                        }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                {!modeIsV2 && activeTemplate === 'template2' && (
                    <div className="mb-4 max-w-[380px] rounded-[16px] bg-[#121a2c] border border-white/10 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-white/75 shrink-0">Choose Text Color</div>
                            <button
                                type="button"
                                onClick={() => setPhotoTextColor('dark')}
                                className={` rounded-xl border text-left px-2.5 py-2 transition-all cursor-pointer ${photoTextColor === 'dark' ? 'bg-[#1a2439] border-white/18 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/3 border-white/8'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="w-7 h-7 rounded-full bg-black border border-white/10 shrink-0" />

                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPhotoTextColor('light')}
                                className={` rounded-xl border text-left px-2.5 py-2 transition-all cursor-pointer ${photoTextColor === 'light' ? 'bg-white border-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)]' : 'bg-white/3 border-white/8'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="w-7     h-7 rounded-full bg-white border border-white/20 shrink-0" />

                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Render Active Template — long-press on mobile triggers save */}
                <div
                    className="w-full flex flex-col items-center select-none"
                    onTouchStart={() => { longPressTimerRef.current = setTimeout(handleCardLongPress, 500); }}
                    onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    onTouchCancel={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                {modeIsV2 && !hasV2Layout
                    ? (
                        <div className="w-full max-w-[380px] rounded-[20px] bg-slate-800 border border-slate-700 flex flex-col items-center justify-center p-10 gap-4">
                            <span className="text-4xl">🎨</span>
                            <p className="text-white font-bold text-center">ผู้จัดงานยังไม่ได้ออกแบบ E-Slip</p>
                            <p className="text-slate-400 text-sm text-center">โปรดรอให้ทีมงานตั้งค่า E-Slip ก่อนนะคะ</p>
                        </div>
                    )
                    : isV2
                    ? <ESlipV2Renderer layout={campaign!.eslipV2Layout!} runner={runner} campaign={campaign} slipRef={slipRef} timings={timings} awardLabel={displayAwardLabel} targetBandLabel={targetBandLabel} language={language} />
                    : (() => {
                        const vf = campaign?.eslipVisibleFields;
                        const hasAgeGroup = !!runner.ageGroup;
                        const showField = (key: string) => {
                            // If the runner's distance has no age groups configured (runner.ageGroup
                            // is empty), suppress every age-group-derived field so the e-slip
                            // doesn't show a stale "Category 1" or "AgeGroup -".
                            if (!hasAgeGroup && (key === 'categoryRank' || key === 'ageGroup')) return false;
                            return !vf || vf.length === 0 || vf.includes(key);
                        };
                        const common = { runner, timings, campaign, slipRef, showField, awardLabel: displayAwardLabel, targetBandLabel, language };
                        if (activeTemplate === 'template1') return <Template1 {...common} bgImage={bgImage} />;
                        if (activeTemplate === 'template2') return <Template2 {...common} bgImage={bgImage} textColorMode={photoTextColor} />;
                        return <Template3 {...common} bgImage={null} />;
                    })()
                }
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 w-full max-w-[380px] mt-5">
                    {!modeIsV2 && activeTemplate !== 'template3' && (
                        <>
                            <input type="file" id="eslip-bg" accept="image/*" className="hidden" onChange={handleBgUpload} />
                            <label htmlFor="eslip-bg" className="flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center cursor-pointer bg-white text-black flex justify-center items-center gap-2">
                                📷 เลือกรูปถ่าย
                            </label>
                        </>
                    )}
                    {!(modeIsV2 && !hasV2Layout) && (
                        <button onClick={handleDownload} disabled={downloading}
                            className={`flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center border-none bg-green-600 text-white flex justify-center items-center gap-2 ${downloading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                        >
                            {downloading ? '⏳ กำลังประมวลผล...' : '📥 บันทึกภาพ'}
                        </button>
                    )}
                </div>

                {/* Back link */}
                <button onClick={() => router.back()} className="mt-5 bg-transparent border-none text-slate-500 text-[13px] font-semibold cursor-pointer">
                    ← ย้อนกลับ
                </button>
            </div>

            {/* Mobile preview overlay */}
            {previewImage && (
                <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center p-4 gap-4">
                    <img
                        src={previewImage}
                        alt="E-Slip"
                        className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl"
                        onContextMenu={(e) => e.preventDefault()}
                    />
                    <div className="text-center text-slate-300 text-sm bg-white/10 rounded-xl px-5 py-3 leading-relaxed max-w-[300px]">
                        📲 <b className="text-green-400">กดค้างที่รูป</b> แล้วเลือก<br />
                        <b className="text-green-400">&quot;บันทึกรูปภาพ&quot;</b> หรือ <b className="text-green-400">&quot;ดาวน์โหลดรูปภาพ&quot;</b><br />
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
