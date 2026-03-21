'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

export default function UploadPhotoPage() {
    const params = useParams();
    const runnerId = params.runnerId as string;

    const searchParams = useSearchParams();
    const campaignSlug = searchParams.get('slug');

    const [runner, setRunner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [uploadedPhoto, setUploadedPhoto] = useState<string>('');
    const [template, setTemplate] = useState<'classic' | 'split'>('classic');
    const [campaignName, setCampaignName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownload = async () => {
        if (!uploadedPhoto) return;
        const filename = `BIB${runner?.bib || 'photo'}_${runner?.firstNameTh || runner?.firstName || ''}.jpg`;

        await document.fonts.ready;
        const img = new Image();
        img.src = uploadedPhoto;
        await new Promise<void>((res) => { img.onload = () => res(); });

        const CW = 1080, CH = 540;
        const canvas = document.createElement('canvas');
        canvas.width = CW; canvas.height = CH;
        const ctx = canvas.getContext('2d')!;

        const bibStr = String(runner?.bib || '-');
        const catStr = runner?.category || '';
        const nameTh = [runner?.firstNameTh || runner?.firstName, runner?.lastNameTh || runner?.lastName].filter(Boolean).join(' ');
        const nameEn = runner?.firstNameTh ? [runner?.firstName, runner?.lastName].filter(Boolean).join(' ') : '';
        const genderLabel = runner?.gender === 'M' ? 'Male' : runner?.gender === 'F' ? 'Female' : runner?.gender || '-';
        const ageGroupLabel = runner?.ageGroup || '-';

        const rr = (x: number, y: number, w: number, h: number, r: number) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        };

        if (template === 'split') {
            ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, CW, CH);
            const photoW = Math.floor(CW * 0.47);
            {
                const scale = Math.max(photoW / img.width, CH / img.height);
                const dw = img.width * scale, dh = img.height * scale;
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, photoW, CH); ctx.clip();
                ctx.drawImage(img, (photoW - dw) / 2, (CH - dh) / 2, dw, dh);
                ctx.restore();
            }
            const fadeGrad = ctx.createLinearGradient(photoW - 90, 0, photoW + 10, 0);
            fadeGrad.addColorStop(0, 'rgba(10,22,40,0)'); fadeGrad.addColorStop(1, 'rgba(10,22,40,1)');
            ctx.fillStyle = fadeGrad; ctx.fillRect(photoW - 90, 0, 100, CH);
            const rx = photoW + 32;
            ctx.fillStyle = '#4ade80'; ctx.fillRect(rx - 14, CH * 0.14, 4, CH * 0.72);
            ctx.font = '700 15px "Prompt", Arial, sans-serif';
            ctx.fillStyle = '#64748b'; ctx.textAlign = 'left';
            ctx.fillText('BIB', rx, CH * 0.28);
            const bibFontSize = bibStr.length <= 2 ? 180 : bibStr.length <= 3 ? 150 : 120;
            ctx.font = `900 ${bibFontSize}px "Prompt", Arial, sans-serif`;
            ctx.fillStyle = '#ffffff';
            const bibW = ctx.measureText(bibStr).width;
            ctx.fillText(bibStr, rx, CH * 0.68);
            if (catStr) {
                ctx.font = '800 21px "Prompt", Arial, sans-serif';
                const cw2 = ctx.measureText(catStr).width + 30, ch2 = 36;
                const cx = rx + bibW + 18, cy = CH * 0.5;
                ctx.fillStyle = '#ef4444'; rr(cx, cy, cw2, ch2, 9); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.fillText(catStr, cx + cw2 / 2, cy + ch2 - 8);
            }
            ctx.textAlign = 'left';
            ctx.font = '800 48px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#ffffff';
            ctx.fillText(nameTh, rx, CH * 0.84);
            if (nameEn) {
                ctx.font = '600 26px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#94a3b8';
                ctx.fillText(nameEn.toUpperCase(), rx, CH * 0.93);
            }
            if (campaignName) {
                ctx.font = '700 14px "Prompt", Arial, sans-serif';
                ctx.fillStyle = '#4ade80'; ctx.textAlign = 'right';
                ctx.fillText(campaignName.toUpperCase(), CW - 18, 30);
            }
        } else {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, CW, CH);
            const radGrad = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, CW * 0.65);
            radGrad.addColorStop(0, 'rgba(30,41,59,0.6)'); radGrad.addColorStop(1, 'rgba(2,6,23,0)');
            ctx.fillStyle = radGrad; ctx.fillRect(0, 0, CW, CH);
            const headerH = campaignName ? 84 : 0;
            if (campaignName) {
                ctx.font = '900 26px "Prompt", Arial, sans-serif';
                ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
                ctx.fillText(campaignName.toUpperCase(), CW / 2, 44);
                ctx.font = '700 13px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#4ade80';
                ctx.fillText('RFID CHECK-IN · ACTION TIMING', CW / 2, 65);
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(CW * 0.15, 76, CW * 0.7, 1);
            }
            const photoSize = 230, photoX = 65;
            const photoY = headerH + Math.floor((CH - headerH - photoSize) / 2);
            ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 5;
            rr(photoX - 4, photoY - 4, photoSize + 8, photoSize + 8, 20); ctx.stroke();
            ctx.save(); rr(photoX, photoY, photoSize, photoSize, 16); ctx.clip();
            const pScale = Math.max(photoSize / img.width, photoSize / img.height);
            const pdw = img.width * pScale, pdh = img.height * pScale;
            ctx.drawImage(img, photoX + (photoSize - pdw) / 2, photoY + (photoSize - pdh) / 2, pdw, pdh);
            ctx.restore();
            const rx = photoX + photoSize + 50;
            ctx.textAlign = 'left';
            ctx.font = '800 15px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#4ade80';
            ctx.fillText('✅  VERIFIED RUNNER', rx, photoY + 22);
            const nameFsz = nameTh.length > 18 ? 38 : nameTh.length > 12 ? 46 : 52;
            ctx.font = `900 ${nameFsz}px "Prompt", Arial, sans-serif`; ctx.fillStyle = '#ffffff';
            ctx.fillText(nameTh, rx, photoY + 82);
            if (nameEn) {
                ctx.font = '600 24px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#94a3b8';
                ctx.fillText(nameEn.toUpperCase(), rx, photoY + 116);
            }
            const catRowY = photoY + (nameEn ? 132 : 112);
            if (catStr) {
                ctx.font = '800 20px "Prompt", Arial, sans-serif';
                const catBW = ctx.measureText(catStr).width + 28, catBH = 34;
                ctx.fillStyle = '#ef4444'; rr(rx, catRowY, catBW, catBH, 9); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.fillText(catStr, rx + catBW / 2, catRowY + catBH - 8); ctx.textAlign = 'left';
            }
            ctx.font = '700 13px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#64748b';
            ctx.fillText('BIB', rx, catRowY + 60);
            const bibFs = bibStr.length <= 2 ? 120 : bibStr.length <= 3 ? 100 : 82;
            ctx.font = `900 ${bibFs}px "Prompt", Arial, sans-serif`; ctx.fillStyle = '#ffffff';
            ctx.fillText(bibStr, rx, catRowY + 160);
            const barTop = CH - 115;
            ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(60, barTop, CW - 120, 100);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(CW / 2, barTop + 8, 1, 84);
            ctx.font = '800 12px "Prompt", Arial, sans-serif';
            ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
            ctx.fillText('GENDER', CW / 4, barTop + 25);
            ctx.font = '900 30px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#ffffff';
            ctx.fillText(genderLabel, CW / 4, barTop + 68);
            ctx.fillStyle = 'rgba(74,222,128,0.06)'; ctx.fillRect(CW / 2, barTop, CW / 2 - 60, 100);
            ctx.font = '800 12px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#4ade80'; ctx.textAlign = 'center';
            ctx.fillText('AGE GROUP', CW * 3 / 4, barTop + 25);
            ctx.font = '900 38px "Prompt", Arial, sans-serif'; ctx.fillStyle = '#4ade80';
            ctx.fillText(ageGroupLabel, CW * 3 / 4, barTop + 72);
        }

        ctx.font = '700 12px "Prompt", Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.textAlign = 'right';
        ctx.fillText('ACTION TIMING SYSTEM', CW - 18, CH - 10);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], filename, { type: 'image/jpeg' });
            if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
                try { await navigator.share({ files: [file] }); return; } catch { /* fall through */ }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/jpeg', 0.92);
    };

    // Fetch runner info
    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRunner(data);
                } else {
                    setError('ไม่พบนักวิ่ง — Runner not found');
                }
            } catch {
                setError('เกิดข้อผิดพลาด — Connection error');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    useEffect(() => {
        if (!campaignSlug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignSlug)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.scanningTemplate === 'split') setTemplate('split');
                    if (data.name) setCampaignName(data.name);
                }
            } catch { /* ignore */ }
        })();
    }, [campaignSlug]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError('');

        try {
            // Resize image to max 800px and compress
            const base64 = await resizeAndCompress(file, 800, 0.8);

            // Upload to backend
            const res = await fetch(`/api/runners/${runnerId}/photo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: base64 }),
            });

            if (res.ok) {
                setUploadedPhoto(base64);
                setSuccess(true);
            } else {
                setError('อัปโหลดไม่สำเร็จ — Upload failed');
            }
        } catch {
            setError('เกิดข้อผิดพลาด — Upload error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
                fontFamily: "'Prompt', sans-serif", padding: 20,
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: 50, height: 50,
                            border: '4px solid #334155', borderTopColor: '#4ade80',
                            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                            margin: '0 auto 20px',
                        }} />
                        <p style={{ color: '#94a3b8', fontSize: 16 }}>กำลังโหลด...</p>
                    </div>
                ) : error && !runner ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>❌</div>
                        <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 800 }}>{error}</p>
                    </div>
                ) : success ? (
                    template === 'split' ? (
                        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease-out' }}>
                            <div style={{ borderRadius: '24px 24px 0 0', overflow: 'hidden', position: 'relative' }}>
                                <img src={uploadedPhoto} alt="uploaded"
                                    style={{ width: '100%', display: 'block', maxHeight: '48vh', objectFit: 'cover' }} />
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to top, rgba(2,6,23,1), transparent)' }} />
                            </div>
                            <div style={{ background: '#0f172a', borderRadius: '0 0 24px 24px', border: '2px solid rgba(74,222,128,0.25)', borderTop: 'none', padding: '20px 20px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14 }}>
                                    <div style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '6px solid #4ade80', padding: '8px 24px', borderRadius: 6, transform: 'skewX(-8deg)' }}>
                                        <div style={{ transform: 'skewX(8deg)' }}>
                                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 4 }}>BIB</div>
                                            <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 0.9, fontStyle: 'italic' }}>{runner?.bib || '-'}</div>
                                        </div>
                                    </div>
                                    {runner?.category && (
                                        <div style={{ background: '#ef4444', padding: '6px 18px', borderRadius: 6, transform: 'skewX(-8deg)', marginBottom: 8 }}>
                                            <span style={{ display: 'block', transform: 'skewX(8deg)', color: '#fff', fontWeight: 900, fontSize: 18, fontStyle: 'italic' }}>{runner.category}</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>✅ Verified Participant</div>
                                <p style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>{runner?.firstNameTh || runner?.firstName} {runner?.lastNameTh || runner?.lastName}</p>
                                {runner?.firstNameTh && <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', margin: '0 0 12px' }}>{runner.firstName} {runner.lastName}</p>}
                                {(runner?.gender || runner?.ageGroup) && (
                                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
                                        <div style={{ flex: 1, padding: '10px 16px', textAlign: 'center' }}>
                                            <p style={{ color: '#64748b', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 2px' }}>GENDER</p>
                                            <p style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: 0 }}>{runner?.gender === 'M' ? 'Male' : runner?.gender === 'F' ? 'Female' : runner?.gender || '-'}</p>
                                        </div>
                                        <div style={{ flex: 1, padding: '10px 16px', textAlign: 'center', background: 'rgba(74,222,128,0.06)', borderRadius: '0 14px 14px 0', borderLeft: '1px solid rgba(74,222,128,0.1)' }}>
                                            <p style={{ color: '#4ade80', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 2px' }}>AGE GROUP</p>
                                            <p style={{ color: '#4ade80', fontSize: 20, fontWeight: 900, margin: 0 }}>{runner?.ageGroup || '-'}</p>
                                        </div>
                                    </div>
                                )}
                                <button onClick={handleDownload} style={{ width: '100%', padding: '14px 20px', borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 17, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(59,130,246,0.35)', marginBottom: 10 }}>💾 ดาวน์โหลดรูป</button>
                                <button onClick={() => { setSuccess(false); setUploadedPhoto(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ width: '100%', padding: '12px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 14, fontWeight: 700, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>📸 อัปโหลดรูปใหม่</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease-out' }}>
                            {campaignName && (
                                <div style={{ textAlign: 'center', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
                                    <p style={{ color: '#fff', fontSize: 15, fontWeight: 900, textTransform: 'uppercase', margin: 0 }}>{campaignName}</p>
                                    <p style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, margin: '4px 0 0' }}>RFID Check-in · Action Timing</p>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: '16px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ width: 130, height: 130, borderRadius: 16, border: '4px solid #4ade80', overflow: 'hidden', flexShrink: 0, background: '#0f172a', boxShadow: '0 8px 20px rgba(74,222,128,0.2)' }}>
                                    <img src={uploadedPhoto} alt="uploaded" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>✅ Verified Runner</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 2 }}>BIB</div>
                                            <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{runner?.bib || '-'}</div>
                                        </div>
                                        {runner?.category && <div style={{ background: '#ef4444', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: 14, fontWeight: 900, alignSelf: 'flex-end', marginBottom: 4 }}>{runner.category}</div>}
                                    </div>
                                </div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 18px', marginBottom: 12 }}>
                                <p style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>{runner?.firstNameTh || runner?.firstName} {runner?.lastNameTh || runner?.lastName}</p>
                                {runner?.firstNameTh && <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', margin: '4px 0 0' }}>{runner.firstName} {runner.lastName}</p>}
                            </div>
                            {(runner?.gender || runner?.ageGroup) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                                    <div style={{ padding: '10px 16px', textAlign: 'center' }}>
                                        <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 4px' }}>Gender</p>
                                        <p style={{ color: '#fff', fontSize: 18, fontWeight: 900, margin: 0 }}>{runner?.gender === 'M' ? 'Male' : runner?.gender === 'F' ? 'Female' : runner?.gender || '-'}</p>
                                    </div>
                                    <div style={{ padding: '10px 16px', textAlign: 'center', background: 'rgba(74,222,128,0.08)', borderLeft: '1px solid rgba(74,222,128,0.15)' }}>
                                        <p style={{ color: '#4ade80', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 4px' }}>Age Group</p>
                                        <p style={{ color: '#4ade80', fontSize: 20, fontWeight: 900, margin: 0 }}>{runner?.ageGroup || '-'}</p>
                                    </div>
                                </div>
                            )}
                            <button onClick={handleDownload} style={{ width: '100%', padding: '14px 20px', borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 17, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(59,130,246,0.35)', marginBottom: 10 }}>💾 ดาวน์โหลดรูป</button>
                            <button onClick={() => { setSuccess(false); setUploadedPhoto(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ width: '100%', padding: '12px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 14, fontWeight: 700, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>📸 อัปโหลดรูปใหม่</button>
                        </div>
                    )
                ) : (
                    <div style={{
                        width: '100%', maxWidth: 400, textAlign: 'center',
                        animation: 'fadeIn 0.5s ease-out',
                    }}>
                        {/* Runner info card */}
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 20,
                            padding: '24px 20px', marginBottom: 24,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <div style={{
                                display: 'inline-block', background: '#ef4444',
                                padding: '6px 20px', borderRadius: 10,
                                fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 12,
                            }}>
                                {runner?.category || '-'}
                            </div>
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: '#64748b',
                                textTransform: 'uppercase', letterSpacing: 3, marginBottom: 4,
                            }}>BIB</div>
                            <div style={{
                                fontSize: 48, fontWeight: 900, color: '#fff',
                                lineHeight: 1, marginBottom: 12,
                            }}>{runner?.bib || '-'}</div>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                {runner?.firstNameTh || runner?.firstName} {runner?.lastNameTh || runner?.lastName}
                            </p>
                            {runner?.firstNameTh && (
                                <p style={{ fontSize: 14, color: '#94a3b8' }}>
                                    {runner.firstName} {runner.lastName}
                                </p>
                            )}
                        </div>

                        {/* Upload section */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />

                        {error && (
                            <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>
                        )}

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                width: '100%', padding: '16px 20px', borderRadius: 16,
                                background: uploading ? '#334155' : 'linear-gradient(135deg, #4ade80, #22c55e)',
                                color: uploading ? '#94a3b8' : '#020617',
                                fontSize: 18, fontWeight: 900, border: 'none',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                boxShadow: uploading ? 'none' : '0 10px 30px rgba(74,222,128,0.3)',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {uploading ? (
                                <>⏳ กำลังอัปโหลด...</>
                            ) : (
                                <>📸 ถ่ายรูป / เลือกรูป</>
                            )}
                        </button>

                        <p style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>
                            เลือกรูปจากกล้องหรือแกลเลอรี่
                        </p>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                * { font-family: 'Prompt', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
            `}</style>
        </>
    );
}

/** Resize an image file to max dimension and compress to JPEG base64 */
function resizeAndCompress(file: File, maxSize: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round((h * maxSize) / w);
                        w = maxSize;
                    } else {
                        w = Math.round((w * maxSize) / h);
                        h = maxSize;
                    }
                }
                canvas.width = w;
                canvas.height = h;
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
