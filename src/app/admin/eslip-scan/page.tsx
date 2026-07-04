'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../AdminLayout';
import { authHeaders } from '@/lib/authHeaders';

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    slipScanTemplate?: string;
}

const TEMPLATES = [
    {
        id: 'template3',
        name: 'Default — การ์ดขาว',
        description: 'สไตล์สะอาดตา พื้นหลังขาว แสดงผลรางวัล เวลา และ checkpoint splits — ไม่ต้องใส่รูป',
        icon: '🤍',
        previewBg: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
    },
    {
        id: 'template2',
        name: 'Photo — ใส่รูปนักวิ่ง',
        description: 'ใช้รูปนักวิ่งเป็นพื้นหลัง มี QR เล็กๆ ให้นักวิ่งสแกนอัปโหลดรูปเองจากมือถือ แล้วรูปจะขึ้นบนจอทันที',
        icon: '📷',
        previewBg: 'linear-gradient(135deg, #334155, #1e293b)',
    },
];

export default function AdminESlipScanPage() {
    const router = useRouter();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [template, setTemplate] = useState<string>('template3');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured?full=true');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    setTemplate(data.slipScanTemplate === 'template2' ? 'template2' : 'template3');
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
        setSaveError('');
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ slipScanTemplate: template }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `HTTP ${res.status}`);
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Save error:', err);
            setSaveError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const shareUrl = campaign
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/scanning-slip/${campaign.slug || campaign._id}`
        : '';

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'สแกน E-Slip', labelEn: 'E-Slip Scan' }]}>
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'สแกน E-Slip', labelEn: 'E-Slip Scan' }]}>
            <div style={{ padding: '24px 32px', fontFamily: "'Prompt', sans-serif", maxWidth: 1000 }}>
                <div style={{ marginBottom: 28 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                        🎫 สแกน E-Slip / E-Slip Scan Display
                    </h1>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        เปิดหน้าจอนี้ที่จุดสแกน — เมื่อนักวิ่งสแกนบิบ จะแสดง E-Slip ผลการแข่งขันตาม template ที่เลือก
                        (ข้อมูลที่แสดงใช้ค่าเดียวกับหน้า <b>E-Slip</b>)
                    </p>
                </div>

                {!campaign ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        ไม่พบกิจกรรมที่กดดาว — กรุณากดดาวเลือกกิจกรรมก่อน
                    </div>
                ) : (
                    <>
                        {/* Template selection */}
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>เลือกรูปแบบการแสดงผล</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginBottom: 28 }}>
                            {TEMPLATES.map(tmpl => {
                                const isSelected = template === tmpl.id;
                                return (
                                    <div
                                        key={tmpl.id}
                                        onClick={() => setTemplate(tmpl.id)}
                                        style={{
                                            borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                                            border: isSelected ? '3px solid #22c55e' : '1px solid #e2e8f0',
                                            boxShadow: isSelected ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                                            transition: 'all 0.2s',
                                            transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                                            opacity: isSelected ? 1 : 0.75,
                                        }}
                                    >
                                        <div style={{ height: 150, background: tmpl.previewBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, position: 'relative' }}>
                                            {tmpl.icon}
                                            {isSelected && (
                                                <div style={{ position: 'absolute', top: 8, right: 8, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                                    ✓ ใช้งานอยู่
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

                        {/* Save */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
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
                            {saved && <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>✓ บันทึกสำเร็จ</span>}
                            {saveError && <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>✗ {saveError}</span>}
                        </div>

                        {/* Fields note */}
                        <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fefce8', borderRadius: 10, border: '1px solid #fde68a' }}>
                            <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                                <i className="fas fa-info-circle" style={{ marginRight: 6 }} />
                                ข้อมูลที่แสดง (รางวัล, เวลา, อันดับ ฯลฯ) ปรับได้ที่หน้า <b>E-Slip</b> — ใช้ค่า <code>เลือกข้อมูลที่จะแสดง</code> ร่วมกัน
                            </p>
                        </div>

                        {/* Share link */}
                        <div style={{ padding: 20, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: '0 0 8px' }}>
                                🔗 ลิ้งค์แชร์หน้าสแกน E-Slip
                            </h4>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                                เปิดลิ้งค์นี้บนเครื่องที่ต่อ RFID Scanner — เป็นหน้าสาธารณะ ไม่ต้อง Login รองรับจอแนวตั้ง/แนวนอน ทุกขนาด (1080p–4K)
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    readOnly
                                    value={shareUrl}
                                    style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#fff', fontSize: 14, fontFamily: 'monospace', color: '#1e40af', fontWeight: 600 }}
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    onClick={() => { navigator.clipboard.writeText(shareUrl); alert('คัดลอกลิ้งค์แล้ว!'); }}
                                    style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    📋 คัดลอก
                                </button>
                                <a
                                    href={`/scanning-slip/${campaign.slug || campaign._id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}
                                >
                                    🚀 เปิด
                                </a>
                            </div>
                            <button
                                onClick={() => router.push('/admin/eslip')}
                                style={{ marginTop: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                            >
                                ⚙️ ไปตั้งค่าข้อมูล E-Slip
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
