'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '../AdminLayout';

interface Campaign {
    _id: string;
    name: string;
    eslipTemplate?: string;
    eslipTemplates?: string[];
    eslipCustomHtml?: string;
    eslipVisibleFields?: string[];
}

const ESLIP_FIELDS = [
    { key: 'overallRank', label: 'Overall Rank', icon: '🏆' },
    { key: 'genderRank', label: 'Gender Rank', icon: '👤' },
    { key: 'categoryRank', label: 'Category Rank', icon: '🏷️' },
    { key: 'gunTime', label: 'Gun Time', icon: '🔫' },
    { key: 'netTime', label: 'Net Time', icon: '⏱️' },
    { key: 'distance', label: 'Distance', icon: '📏' },
    { key: 'pace', label: 'Avg Pace', icon: '🏃' },
];

const TEMPLATES = [
    {
        id: 'template1',
        name: 'E-Slip 1 — Dark',
        description: 'พื้นหลังสีเข้ม พร้อมรูปถ่ายนักวิ่ง สไตล์โมเดิร์น',
        previewBg: 'linear-gradient(135deg, #0f172a, #1e293b)',
        icon: '🌙',
    },
    {
        id: 'template2',
        name: 'E-Slip 2 — Photo',
        description: 'ภาพถ่ายเป็นพื้นหลัง กรอบข้อมูลแบบ Frosted Glass',
        previewBg: 'linear-gradient(135deg, #334155, #1e293b)',
        icon: '📷',
    },
    {
        id: 'template3',
        name: 'E-Slip 3 — Clean White',
        description: 'สไตล์สะอาดตา พื้นหลังขาว เหมาะสำหรับพิมพ์',
        previewBg: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
        icon: '🤍',
    },
];

export default function AdminESlipPage() {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
    const [visibleFields, setVisibleFields] = useState<string[]>(ESLIP_FIELDS.map(f => f.key));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    // Fetch featured campaign
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    // Load previously saved templates, or default to all
                    const saved = data.eslipTemplates;
                    setSelectedTemplates(Array.isArray(saved) && saved.length > 0 ? saved : TEMPLATES.map(t => t.id));
                    const savedFields = data.eslipVisibleFields;
                    setVisibleFields(Array.isArray(savedFields) && savedFields.length > 0 ? savedFields : ESLIP_FIELDS.map(f => f.key));
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
                // Don't allow deselecting the last one
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
            // Set eslipTemplate to the first selected template (default for users)
            const body: any = {
                eslipTemplates: selectedTemplates,
                eslipTemplate: selectedTemplates[0] || 'template1',
                eslipVisibleFields: visibleFields,
            };

            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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
            <AdminLayout
                breadcrumbItems={[
                    { label: 'E-Slip', labelEn: 'E-Slip' }
                ]}
            >
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'E-Slip', labelEn: 'E-Slip' }
            ]}
        >
            <div style={{ padding: '24px 32px', fontFamily: "'Prompt', sans-serif", maxWidth: 1200 }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                        <i className="fas fa-id-badge" style={{ marginRight: 8, color: '#3b82f6' }} />
                        E-Slip Template
                    </h1>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        เลือกรูปแบบ E-Slip ที่จะให้ผู้เข้าแข่งขันเลือกใช้ได้ (เลือกได้หลายแบบ)
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
                            <i className="fas fa-star" style={{ color: '#f59e0b' }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>{campaign.name}</span>
                        </div>

                        {/* Instructions */}
                        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <p style={{ fontSize: 12, color: '#92400e', margin: 0, fontWeight: 600 }}>
                                <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                                กดเลือกแบบที่ต้องการเปิดให้ User ใช้ได้ — ถ้าเลือก 1 แบบ User จะได้ใช้แบบนั้นอย่างเดียว ถ้าเลือกหลายแบบ User จะเลือกได้เอง
                            </p>
                        </div>

                        {/* Template Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 32 }}>
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
                                        {/* Preview Area */}
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
                                        {/* Info */}
                                        <div style={{ padding: 16, background: '#fff' }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{tmpl.name}</h3>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{tmpl.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Field Visibility Toggles */}
                        <div style={{ marginBottom: 32 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                                <i className="fas fa-eye" style={{ marginRight: 8, color: '#8b5cf6' }} />
                                แสดงข้อมูลใน E-Slip
                            </h2>
                            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                                เลือกข้อมูลที่จะแสดงให้ผู้เข้าแข่งขันเห็นบน E-Slip
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
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

                        {/* Summary */}
                        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                            <p style={{ fontSize: 12, color: '#15803d', margin: 0, fontWeight: 600 }}>
                                เปิดใช้งาน {selectedTemplates.length} แบบ — {selectedTemplates.length === 1 ? 'User จะได้ใช้แบบนี้อย่างเดียว' : 'User จะเลือกแบบที่ชอบได้เอง'}
                            </p>
                        </div>

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

                        {/* Info Box */}
                        <div style={{ marginTop: 32, padding: 20, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: '0 0 8px' }}>
                                <i className="fas fa-info-circle" style={{ marginRight: 6 }} />
                                วิธีการทำงาน
                            </h4>
                            <ul style={{ fontSize: 13, color: '#334155', margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                                <li>เมื่อผู้เข้าแข่งขันกดดูรายละเอียดนักวิ่ง จะเห็นหน้า <strong>Runner Profile</strong> พร้อมข้อมูล Checkpoint</li>
                                <li>ถ้านักวิ่ง <strong>Finish</strong> แล้ว จะมีปุ่ม <strong>&quot;ดู E-Slip&quot;</strong> ให้กดเข้าไปดาวน์โหลดเป็นภาพได้</li>
                                <li>ถ้าเปิดหลายแบบ — User จะเห็น <strong>Dropdown</strong> เลือกแบบที่ชอบ</li>
                                <li>ถ้าเปิดแบบเดียว — User จะเห็นแบบนั้นเลยโดยไม่ต้องเลือก</li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
