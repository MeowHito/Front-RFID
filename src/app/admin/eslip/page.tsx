'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../AdminLayout';
import { authHeaders } from '@/lib/authHeaders';

interface Campaign {
    _id: string;
    name: string;
    eslipTemplate?: string;
    eslipTemplates?: string[];
    eslipCustomHtml?: string;
    eslipVisibleFields?: string[];
    eslipMode?: string;
}

const ESLIP_FIELDS = [
    { key: 'overallRank', label: 'Overall Rank', icon: '🏆' },
    { key: 'genderRank', label: 'Gender Rank', icon: '👤' },
    { key: 'categoryRank', label: 'Category Rank', icon: '🏷️' },
    { key: 'gunTime', label: 'Gun Time', icon: '🔫' },
    { key: 'netTime', label: 'Net Time', icon: '⏱️' },
    { key: 'award', label: 'Award', icon: '🏆' },
    { key: 'targetBand', label: 'Sub (เป้าหมาย)', icon: '🎯' },
    { key: 'distance', label: 'Distance', icon: '📏' },
    { key: 'pace', label: 'Avg Pace', icon: '🏃' },
];

const TEMPLATES = [
    {
        id: 'template2',
        name: 'E-Slip — Photo',
        description: 'ภาพถ่ายเป็นพื้นหลัง กรอบข้อมูลแบบ Frosted Glass',
        previewBg: 'linear-gradient(135deg, #334155, #1e293b)',
        icon: '📷',
    },
    {
        id: 'template3',
        name: 'E-Slip — Default',
        description: 'สไตล์สะอาดตา พื้นหลังขาว เหมาะสำหรับพิมพ์',
        previewBg: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
        icon: '🤍',
    },
];

export default function AdminESlipPage() {
    const router = useRouter();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
    const [visibleFields, setVisibleFields] = useState<string[]>(ESLIP_FIELDS.map(f => f.key));
    const [eslipMode, setEslipMode] = useState<'v1' | 'v2'>('v1');
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
                    const saved = data.eslipTemplates;
                    setSelectedTemplates(Array.isArray(saved) && saved.length > 0 ? saved : TEMPLATES.map(t => t.id));
                    const savedFields = data.eslipVisibleFields;
                    setVisibleFields(Array.isArray(savedFields) && savedFields.length > 0 ? savedFields : ESLIP_FIELDS.map(f => f.key));
                    setEslipMode(data.eslipMode === 'v2' ? 'v2' : 'v1');
                }
            } catch (err) {
                console.error('Failed to load campaign:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const toggleTemplate = (id: string) => {
        setSelectedTemplates(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) return prev;
                return prev.filter(t => t !== id);
            }
            return [...prev, id];
        });
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        setSaved(false);
        try {
            const body: any = {
                eslipMode,
                eslipTemplates: selectedTemplates,
                eslipTemplate: selectedTemplates[0] || 'template1',
                eslipVisibleFields: visibleFields,
            };

            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(body),
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
            <AdminLayout breadcrumbItems={[{ label: 'E-Slip', labelEn: 'E-Slip' }]}>
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'E-Slip', labelEn: 'E-Slip' }]}>
            <div style={{ padding: '24px 32px', fontFamily: "'Prompt', sans-serif", maxWidth: 1200 }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                        <i className="fas fa-id-badge" style={{ marginRight: 8, color: '#3b82f6' }} />
                        ตั้งค่า E-Slip
                    </h1>
                </div>

                {!campaign ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        ไม่พบกิจกรรมที่กดดาว — กรุณากดดาวเลือกกิจกรรมก่อน
                    </div>
                ) : (
                    <>
                        {/* Version Toggle */}
                        <div style={{ marginBottom: 32 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>
                                <i className="fas fa-toggle-on" style={{ marginRight: 8, color: '#3b82f6' }} />
                                เลือกรูปแบบ E-Slip
                            </h2>
                            <div style={{ display: 'flex', gap: 16 }}>
                                {/* E-Slip 1 card */}
                                <div
                                    onClick={() => setEslipMode('v1')}
                                    style={{
                                        flex: 1, maxWidth: 260, borderRadius: 16, padding: '20px 24px', cursor: 'pointer',
                                        border: eslipMode === 'v1' ? '3px solid #3b82f6' : '2px solid #e2e8f0',
                                        background: eslipMode === 'v1' ? '#eff6ff' : '#fff',
                                        boxShadow: eslipMode === 'v1' ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <span style={{ fontSize: 28 }}>🎴</span>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>E-Slip 1</div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>เทมเพลตสำเร็จรูป</div>
                                        </div>
                                        {eslipMode === 'v1' && (
                                            <div style={{ marginLeft: 'auto', background: '#3b82f6', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                                ✓ ใช้งาน
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                                        เลือกจากเทมเพลตที่มีให้ ง่าย รวดเร็ว พร้อมใช้งานทันที
                                    </p>
                                </div>

                                {/* E-Slip 2 card */}
                                <div
                                    onClick={() => setEslipMode('v2')}
                                    style={{
                                        flex: 1, maxWidth: 260, borderRadius: 16, padding: '20px 24px', cursor: 'pointer',
                                        border: eslipMode === 'v2' ? '3px solid #8b5cf6' : '2px solid #e2e8f0',
                                        background: eslipMode === 'v2' ? '#f5f3ff' : '#fff',
                                        boxShadow: eslipMode === 'v2' ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <span style={{ fontSize: 28 }}>🎨</span>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>E-Slip 2</div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>ออกแบบเองแบบ Canva</div>
                                        </div>
                                        {eslipMode === 'v2' && (
                                            <div style={{ marginLeft: 'auto', background: '#8b5cf6', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                                ✓ ใช้งาน
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                                        ออกแบบ layout ได้อิสระ วางตำแหน่ง ปรับขนาด และตกแต่งองค์ประกอบต่างๆ
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* E-Slip 2 section */}
                        {eslipMode === 'v2' && (
                            <div style={{ marginBottom: 32, padding: '20px 24px', background: '#faf5ff', borderRadius: 16, border: '1px solid #e9d5ff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#6d28d9', margin: '0 0 4px' }}>
                                            <i className="fas fa-paint-brush" style={{ marginRight: 8 }} />
                                            ออกแบบ E-Slip 2
                                        </h3>
                                        <p style={{ fontSize: 13, color: '#7c3aed', margin: 0 }}>
                                            คลิกปุ่มด้านล่างเพื่อเปิด Editor และออกแบบ layout ของ E-Slip
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => router.push('/admin/eslip2')}
                                        style={{
                                            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                                            background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                        }}
                                    >
                                        <i className="fas fa-paint-brush" />
                                        เปิด E-Slip 2 Editor
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* E-Slip 1 section — template + field toggles */}
                        {eslipMode === 'v1' && (
                            <>
                                {/* Template Cards */}
                                <div style={{ marginBottom: 32 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>
                                        <i className="fas fa-th-large" style={{ marginRight: 8, color: '#3b82f6' }} />
                                        เลือก Template
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
                                        {TEMPLATES.map(tmpl => {
                                            const isSelected = selectedTemplates.includes(tmpl.id);
                                            return (
                                                <div
                                                    key={tmpl.id}
                                                    onClick={() => toggleTemplate(tmpl.id)}
                                                    style={{
                                                        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                                                        border: isSelected ? '3px solid #22c55e' : '1px solid #e2e8f0',
                                                        boxShadow: isSelected ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                        transition: 'all 0.2s',
                                                        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                                        opacity: isSelected ? 1 : 0.7,
                                                    }}
                                                >
                                                    <div style={{
                                                        height: 160, background: tmpl.previewBg,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 48, position: 'relative',
                                                    }}>
                                                        {tmpl.icon}
                                                        {isSelected && (
                                                            <div style={{ position: 'absolute', top: 8, right: 8, background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                                                ✓ เปิดใช้งาน
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
                                </div>

                                {/* Field Visibility Toggles */}
                                <div style={{ marginBottom: 32 }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                                        <i className="fas fa-eye" style={{ marginRight: 8, color: '#8b5cf6' }} />
                                        เลือกข้อมูลที่จะแสดงบน E-Slip
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
                                        {ESLIP_FIELDS.map(field => {
                                            const isActive = visibleFields.includes(field.key);
                                            return (
                                                <div
                                                    key={field.key}
                                                    onClick={() => {
                                                        setVisibleFields(prev =>
                                                            prev.includes(field.key)
                                                                ? prev.filter(k => k !== field.key)
                                                                : [...prev, field.key]
                                                        );
                                                    }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                                        border: isActive ? '2px solid #22c55e' : '1px solid #e2e8f0',
                                                        background: isActive ? '#f0fdf4' : '#fff',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 18 }}>{field.icon}</span>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 }}>{field.label}</span>
                                                    <div style={{
                                                        width: 36, height: 20, borderRadius: 10,
                                                        background: isActive ? '#22c55e' : '#cbd5e1',
                                                        position: 'relative', transition: '0.2s',
                                                    }}>
                                                        <div style={{
                                                            width: 16, height: 16, borderRadius: '50%',
                                                            background: '#fff', position: 'absolute', top: 2,
                                                            left: isActive ? 18 : 2, transition: '0.2s',
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                                        }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
                                        <p style={{ fontSize: 11, color: '#92400e', margin: 0, fontWeight: 600 }}>
                                            <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                                            เปิดอยู่ {visibleFields.length} จาก {ESLIP_FIELDS.length} รายการ {visibleFields.length === 0 ? '— จะแสดงทุกรายการ (ค่าเริ่มต้น)' : ''}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Save Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
