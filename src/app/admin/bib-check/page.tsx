'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '../AdminLayout';

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    scanningTemplate?: string;
}

const SCANNING_TEMPLATES = [
    {
        id: 'classic',
        name: 'Classic — Top-Down',
        description: 'แสดงเต็มจอ แบบ Card กลางจอ ชื่อ + BIB + ข้อมูล',
        previewBg: 'linear-gradient(135deg, #0f172a, #1e293b)',
        icon: '🎯',
    },
    {
        id: 'split',
        name: 'Split — Left-Right',
        description: 'แบ่งซ้ายขวา รูปนักวิ่ง + ข้อมูล + BIB เฉียง',
        previewBg: 'linear-gradient(135deg, #334155, #020617)',
        icon: '🖥️',
    },
];

export default function BibCheckPage() {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState('classic');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    const savedTmpl = data.scanningTemplate;
                    if (savedTmpl) setSelectedTemplate(savedTmpl);
                }
            } catch (err) {
                console.error('Failed to load campaign:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scanningTemplate: selectedTemplate }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            console.error('Save error:', err);
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
                        เลือก Template ที่จะใช้แสดงข้อมูลนักกีฬาเมื่อสแกน RFID — เปิดหน้า Scanning เพื่อเริ่มสแกน
                    </p>
                </div>

                {!campaign ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        ไม่พบกิจกรรมที่กดดาว — กรุณากดดาวเลือกกิจกรรมก่อน
                    </div>
                ) : (
                    <>
                        {/* Campaign Info */}
                        <div style={{ marginBottom: 24, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#f59e0b' }}>⭐</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>{campaign.name}</span>
                        </div>

                        {/* Instructions */}
                        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <p style={{ fontSize: 12, color: '#92400e', margin: 0, fontWeight: 600 }}>
                                ℹ️ เลือก Template แล้วกดบันทึก — จากนั้นไปที่หน้า <strong>Scanning</strong> เพื่อเริ่มสแกน RFID แสดงข้อมูลนักกีฬา
                            </p>
                        </div>

                        {/* Template Cards with Mini Previews */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, marginBottom: 32 }}>
                            {SCANNING_TEMPLATES.map(tmpl => {
                                const isSelected = selectedTemplate === tmpl.id;
                                return (
                                    <div
                                        key={tmpl.id}
                                        onClick={() => setSelectedTemplate(tmpl.id)}
                                        style={{
                                            borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                                            border: isSelected ? '3px solid #22c55e' : '1px solid #e2e8f0',
                                            boxShadow: isSelected ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                                            transition: 'all 0.2s',
                                            transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                            opacity: isSelected ? 1 : 0.75,
                                        }}
                                    >
                                        {/* Mini Preview */}
                                        <div style={{
                                            height: 200, background: tmpl.previewBg,
                                            position: 'relative', overflow: 'hidden', padding: 16,
                                        }}>
                                            {tmpl.id === 'classic' ? (
                                                /* Classic mini: centered card */
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, maxWidth: '90%' }}>
                                                        <div style={{ width: 50, height: 50, borderRadius: 8, border: '2px solid #4ade80', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏃</div>
                                                        <div>
                                                            <div style={{ fontSize: 7, color: '#4ade80', fontWeight: 800, letterSpacing: 1 }}>✓ VERIFIED</div>
                                                            <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>สมชาย ใจดี</div>
                                                            <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 700 }}>Somchai Jaidee</div>
                                                            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                                                                <span style={{ background: '#ef4444', color: '#fff', padding: '1px 8px', borderRadius: 4, fontSize: 9, fontWeight: 900 }}>10K</span>
                                                                <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontStyle: 'italic', fontFamily: "'Exo 2', sans-serif" }}>001</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ position: 'absolute', bottom: 10, left: 16, right: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
                                                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 12px', textAlign: 'center' }}>
                                                            <div style={{ fontSize: 6, color: '#94a3b8', fontWeight: 800 }}>GENDER</div>
                                                            <div style={{ fontSize: 10, color: '#fff', fontWeight: 900 }}>Male</div>
                                                        </div>
                                                        <div style={{ background: 'rgba(74,222,128,0.1)', borderRadius: 6, padding: '3px 12px', textAlign: 'center' }}>
                                                            <div style={{ fontSize: 6, color: '#4ade80', fontWeight: 800 }}>AGE GROUP</div>
                                                            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 900 }}>30-39</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Split mini: left-right */
                                                <div style={{ width: '100%', height: '100%', display: 'flex' }}>
                                                    <div style={{ width: '40%', background: '#0f172a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                                                        <span style={{ fontSize: 40 }}>🏃</span>
                                                        <div style={{ position: 'absolute', bottom: 4, left: 4, background: '#fff', borderRadius: 4, padding: 3, border: '1px solid #4ade80' }}>
                                                            <div style={{ width: 20, height: 20, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>📱</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ width: '60%', paddingLeft: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                        <div style={{ fontSize: 6, color: '#4ade80', fontWeight: 800, borderLeft: '2px solid #4ade80', paddingLeft: 4, marginBottom: 4 }}>EVENT NAME</div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 6 }}>
                                                            <div style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid #4ade80', padding: '2px 8px', transform: 'skewX(-10deg)' }}>
                                                                <span style={{ transform: 'skewX(10deg)', display: 'block', fontSize: 5, color: '#64748b', fontWeight: 700 }}>BIB</span>
                                                                <span style={{ transform: 'skewX(10deg)', display: 'block', fontSize: 20, fontWeight: 900, color: '#fff', fontStyle: 'italic', fontFamily: "'Exo 2', sans-serif", lineHeight: 0.9 }}>001</span>
                                                            </div>
                                                            <div style={{ background: '#ef4444', padding: '1px 6px', transform: 'skewX(-10deg)', borderRadius: 2 }}>
                                                                <span style={{ transform: 'skewX(10deg)', display: 'block', fontSize: 8, fontWeight: 900, color: '#fff' }}>10K</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: 7, color: '#4ade80', fontWeight: 800, marginBottom: 2 }}>✓ VERIFIED 🇹🇭</div>
                                                        <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', lineHeight: 1 }}>สมชาย ใจดี</div>
                                                        <div style={{ fontSize: 7, color: '#94a3b8', fontWeight: 700 }}>SOMCHAI JAIDEE</div>
                                                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 8px', textAlign: 'center' }}>
                                                                <div style={{ fontSize: 5, color: '#64748b', fontWeight: 800 }}>GENDER</div>
                                                                <div style={{ fontSize: 8, color: '#fff', fontWeight: 900 }}>Male</div>
                                                            </div>
                                                            <div style={{ background: 'rgba(74,222,128,0.08)', borderRadius: 4, padding: '2px 8px', textAlign: 'center', border: '1px solid rgba(74,222,128,0.15)' }}>
                                                                <div style={{ fontSize: 5, color: '#4ade80', fontWeight: 800 }}>AGE GROUP</div>
                                                                <div style={{ fontSize: 8, color: '#4ade80', fontWeight: 900 }}>30-39</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {isSelected && (
                                                <div style={{ position: 'absolute', top: 8, right: 8, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                                    ✓ เลือกใช้งาน
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ padding: 16, background: '#fff' }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{tmpl.name}</h3>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{tmpl.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
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
