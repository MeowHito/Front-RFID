'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '../AdminLayout';
import { authHeaders } from '@/lib/authHeaders';

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    scanningTemplate?: string;
    scanningBgImage?: string;
    scanningBgImagePortrait?: string;
}

/** Resize an image file to maxWidth and re-encode as JPEG so the base64 payload
 *  fits inside the 10 MB API limit. Server still receives a data: URL. */
async function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
                const w = Math.round(img.width * ratio);
                const h = Math.round(img.height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('canvas ctx unavailable'));
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('image decode failed'));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('file read failed'));
        reader.readAsDataURL(file);
    });
}

const SCANNING_TEMPLATE = {
    id: 'athletic',
    name: 'Athletic Precision — Race Day Display',
    description: 'แบบใหม่ — การ์ดสีขาวกลางจอ ภาพนักวิ่ง + BIB ขนาดใหญ่ + แถบสถิติด้านล่าง',
};

export default function BibCheckPage() {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [bgImage, setBgImage] = useState<string | null>(null);
    const [bgImagePortrait, setBgImagePortrait] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured?full=true');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    if (data.scanningBgImage) setBgImage(data.scanningBgImage);
                    if (data.scanningBgImagePortrait) setBgImagePortrait(data.scanningBgImagePortrait);
                }
            } catch (err) {
                console.error('Failed to load campaign:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const [saveError, setSaveError] = useState<string>('');

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        setSaved(false);
        setSaveError('');
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    scanningTemplate: 'athletic',
                    scanningBgImage: bgImage || '',
                    scanningBgImagePortrait: bgImagePortrait || '',
                }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `HTTP ${res.status}`);
            }
            // Confirm by re-reading so we know the field actually persisted.
            const fresh = await fetch(`/api/campaigns/${campaign._id}?full=true`, { cache: 'no-store' });
            if (fresh.ok) {
                const data = await fresh.json();
                setCampaign(data);
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            console.error('Save error:', err);
            setSaveError(err?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'Check BIB', labelEn: 'Check BIB' }]}>
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'Check BIB', labelEn: 'Check BIB' }]}>
            <div style={{ padding: '24px 32px', fontFamily: "'Prompt', sans-serif", maxWidth: 1200 }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                        📡 Check BIB / Scanning Template
                    </h1>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        Template ที่ใช้แสดงข้อมูลนักกีฬาเมื่อสแกน RFID — เปิดหน้า Scanning เพื่อเริ่มสแกน
                    </p>
                </div>

                {!campaign ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        ไม่พบกิจกรรมที่กดดาว — กรุณากดดาวเลือกกิจกรรมก่อน
                    </div>
                ) : (
                    <>
                        {/* Single Template Preview */}
                        <div style={{ marginBottom: 32 }}>
                            <div
                                style={{
                                    borderRadius: 16, overflow: 'hidden',
                                    border: '3px solid #22c55e',
                                    boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
                                    maxWidth: 720,
                                }}
                            >
                                {/* Mini Preview — Athletic Precision */}
                                <div style={{
                                    height: 320, background: '#0f172a',
                                    position: 'relative', overflow: 'hidden', padding: 18,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{
                                        width: '100%', height: '100%', background: '#ffffff',
                                        borderRadius: 10, display: 'flex', flexDirection: 'column',
                                        overflow: 'hidden', boxShadow: '0 12px 24px rgba(0,0,0,0.4)',
                                        position: 'relative',
                                    }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: '80%', background: '#1e40af' }} />
                                        {/* Header */}
                                        <div style={{ padding: '14px 20px 10px', textAlign: 'center', borderBottom: '1px solid #eceef0' }}>
                                            <div style={{ fontSize: 8, fontWeight: 800, color: '#1e40af', letterSpacing: 3, textTransform: 'uppercase' }}>100 Mile by UTMB® · Global Series</div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#191c1e', textTransform: 'uppercase', marginTop: 2 }}>Tarawera Ultramarathon 2026</div>
                                        </div>
                                        {/* Content */}
                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14, padding: '12px 18px', alignItems: 'center' }}>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: 110, height: 110, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: 38, color: '#cbd5e1' }}>🏃</span>
                                                </div>
                                                <div style={{ position: 'absolute', bottom: -6, right: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: 3, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
                                                    <div style={{ width: 22, height: 22, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800 }}>QR</div>
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ display: 'inline-block', background: '#16a34a', color: '#fff', fontSize: 7, fontWeight: 800, padding: '2px 8px', borderRadius: 999, letterSpacing: 1, marginBottom: 6 }}>VERIFIED ATHLETE</div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: '#191c1e', lineHeight: 1.05 }}>สมชาย รักการวิ่ง</div>
                                                <div style={{ fontSize: 9, color: '#444653', textTransform: 'uppercase', marginTop: 1 }}>Somchai Rakkanwing</div>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, background: '#f8fafc', borderLeft: '4px solid #1e40af', padding: '6px 10px', borderRadius: '0 6px 6px 0' }}>
                                                    <span style={{ fontSize: 26, fontWeight: 900, color: '#191c1e', fontFamily: "'Roboto Slab', serif", lineHeight: 0.9 }}>5024</span>
                                                    <span style={{ fontSize: 14, fontWeight: 800, color: '#9d4300' }}>50 KM</span>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Footer Stats */}
                                        <div style={{ background: '#0f172a', color: '#fff', padding: '8px 18px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                            {[
                                                ['GENDER', 'Male'],
                                                ['CATEGORY', '30-39'],
                                                ['WAVE', 'A · 05:00'],
                                                ['SHIRT', 'XL'],
                                                ['CHECK-IN', '02:50'],
                                            ].map(([l, v], i) => (
                                                <div key={l} style={{ borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)', paddingLeft: i === 0 ? 0 : 8 }}>
                                                    <div style={{ fontSize: 6, fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>{l}</div>
                                                    <div style={{ fontSize: 10, fontWeight: 800, color: l === 'WAVE' ? '#93c5fd' : '#fff' }}>{v}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ position: 'absolute', top: 8, right: 8, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                        ✓ ใช้งานอยู่
                                    </div>
                                </div>
                                <div style={{ padding: 16, background: '#fff' }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{SCANNING_TEMPLATE.name}</h3>
                                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{SCANNING_TEMPLATE.description}</p>
                                </div>
                            </div>
                        </div>

                        {/* Background Image Upload */}
                        <div style={{ marginBottom: 20, padding: 20, background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                                🖼️ ภาพพื้นหลัง Scanning
                            </h3>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                                อัพโหลดภาพพื้นหลังแยกตามทิศทางหน้าจอ — ระบบจะเลือกภาพที่ถูกต้องโดยอัตโนมัติ
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                {/* Landscape BG */}
                                <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <span style={{ fontSize: 16 }}>🖥️</span>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>แนวนอน (Landscape)</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>แนะนำ 1920×1080 px</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        {bgImage ? (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={bgImage}
                                                    alt="bg-landscape-preview"
                                                    style={{ width: 200, height: 112, objectFit: 'cover', borderRadius: 8, border: '2px solid #cbd5e1' }}
                                                />
                                                <button
                                                    onClick={() => setBgImage(null)}
                                                    style={{
                                                        position: 'absolute', top: -8, right: -8,
                                                        width: 24, height: 24, borderRadius: '50%',
                                                        background: '#ef4444', color: '#fff', border: 'none',
                                                        fontSize: 12, fontWeight: 900, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >✕</button>
                                            </div>
                                        ) : (
                                            <label style={{
                                                width: 200, height: 112, borderRadius: 8,
                                                border: '2px dashed #cbd5e1', display: 'flex',
                                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', background: '#f8fafc', transition: '0.2s',
                                            }}>
                                                <span style={{ fontSize: 24, marginBottom: 4 }}>📁</span>
                                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>คลิกเพื่ออัพโหลด</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const compressed = await compressImage(file, 1920, 0.82);
                                                        setBgImage(compressed);
                                                    }}
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* Portrait BG */}
                                <div style={{ padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <span style={{ fontSize: 16 }}>📱</span>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>แนวตั้ง (Portrait)</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>แนะนำ 1080×1920 px</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        {bgImagePortrait ? (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={bgImagePortrait}
                                                    alt="bg-portrait-preview"
                                                    style={{ width: 63, height: 112, objectFit: 'cover', borderRadius: 8, border: '2px solid #cbd5e1' }}
                                                />
                                                <button
                                                    onClick={() => setBgImagePortrait(null)}
                                                    style={{
                                                        position: 'absolute', top: -8, right: -8,
                                                        width: 24, height: 24, borderRadius: '50%',
                                                        background: '#ef4444', color: '#fff', border: 'none',
                                                        fontSize: 12, fontWeight: 900, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >✕</button>
                                            </div>
                                        ) : (
                                            <label style={{
                                                width: 63, height: 112, borderRadius: 8,
                                                border: '2px dashed #cbd5e1', display: 'flex',
                                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', background: '#f8fafc', transition: '0.2s',
                                            }}>
                                                <span style={{ fontSize: 24, marginBottom: 4 }}>📁</span>
                                                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textAlign: 'center' }}>คลิกเพื่อ<br/>อัพโหลด</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const compressed = await compressImage(file, 1080, 0.82);
                                                        setBgImagePortrait(compressed);
                                                    }}
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '12px 0 0', lineHeight: 1.6 }}>
                                รองรับไฟล์ JPG, PNG, WebP — ภาพจะแสดงเป็นพื้นหลังพร้อม overlay มืด
                            </p>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    padding: '12px 32px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                                    background: saving ? '#94a3b8' : '#3b82f6', color: '#fff', border: 'none',
                                    cursor: saving ? 'wait' : 'pointer', transition: '0.2s',
                                }}
                            >
                                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                            </button>
                            {saved && (
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>
                                    ✓ บันทึกสำเร็จ
                                </span>
                            )}
                            {saveError && (
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>
                                    ✗ {saveError}
                                </span>
                            )}
                        </div>

                        {/* Share Scanning Link */}
                        <div style={{ padding: 20, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: '0 0 8px' }}>
                                🔗 ลิ้งค์แชร์หน้า Scanning
                            </h4>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                                คัดลอกลิ้งค์นี้เพื่อเปิดบนเครื่องที่เชื่อมต่อ RFID Scanner — หน้า Scanning เป็นหน้าสาธารณะ ไม่ต้อง Login
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    readOnly
                                    value={typeof window !== 'undefined' ? `${window.location.origin}/scanning/${campaign.slug || campaign._id}` : `/scanning/${campaign.slug || campaign._id}`}
                                    style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 8,
                                        border: '1px solid #bfdbfe', background: '#fff', fontSize: 14,
                                        fontFamily: 'monospace', color: '#1e40af', fontWeight: 600,
                                    }}
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/scanning/${campaign.slug || campaign._id}`;
                                        navigator.clipboard.writeText(url);
                                        alert('คัดลอกลิ้งค์แล้ว!');
                                    }}
                                    style={{
                                        padding: '10px 18px', borderRadius: 8, border: 'none',
                                        background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                >
                                    📋 คัดลอก
                                </button>
                                <a
                                    href={`/scanning/${campaign.slug || campaign._id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        padding: '10px 18px', borderRadius: 8, border: 'none',
                                        background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13,
                                        textDecoration: 'none', whiteSpace: 'nowrap',
                                    }}
                                >
                                    🚀 เปิด
                                </a>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
