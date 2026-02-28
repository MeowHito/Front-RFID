'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '../AdminLayout';

interface Campaign {
    _id: string;
    name: string;
    eslipTemplate?: string;
    eslipCustomHtml?: string;
}

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
    {
        id: 'custom',
        name: 'E-Slip 4 — Custom Template',
        description: 'อัปโหลดเทมเพลตแบบกำหนดเอง (ไฟล์ HTML)',
        previewBg: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
        icon: '🎨',
    },
];

export default function AdminESlipPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [selectedTemplate, setSelectedTemplate] = useState<string>('template1');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [customFile, setCustomFile] = useState<File | null>(null);

    // Fetch campaigns
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/campaigns`);
                const data = await res.json();
                const list = Array.isArray(data) ? data : data.data || [];
                setCampaigns(list);
                if (list.length > 0) {
                    setSelectedCampaignId(list[0]._id);
                    setSelectedTemplate(list[0].eslipTemplate || 'template1');
                }
            } catch (err) {
                console.error('Failed to load campaigns:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // When campaign changes, update selected template
    useEffect(() => {
        const c = campaigns.find(c => c._id === selectedCampaignId);
        if (c) setSelectedTemplate(c.eslipTemplate || 'template1');
    }, [selectedCampaignId, campaigns]);

    const handleSave = async () => {
        if (!selectedCampaignId) return;
        setSaving(true);
        setSaved(false);
        try {
            const body: any = { eslipTemplate: selectedTemplate };

            // If custom template, read HTML file content
            if (selectedTemplate === 'custom' && customFile) {
                const htmlContent = await customFile.text();
                body.eslipCustomHtml = htmlContent;
            }

            const res = await fetch(`/api/campaigns/${selectedCampaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setSaved(true);
                // Update local state
                setCampaigns(prev => prev.map(c =>
                    c._id === selectedCampaignId ? { ...c, eslipTemplate: selectedTemplate } : c
                ));
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCustomFile(file);
        setSelectedTemplate('custom');
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
                    เลือกรูปแบบ E-Slip ที่จะแสดงให้ผู้เข้าแข่งขันดาวน์โหลดเมื่อวิ่งจบ
                </p>
            </div>

            {/* Campaign Selector */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>เลือกกิจกรรม:</label>
                <select
                    value={selectedCampaignId}
                    onChange={e => setSelectedCampaignId(e.target.value)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600, color: '#0f172a', background: '#fff', minWidth: 300 }}
                >
                    {campaigns.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {/* Template Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 32 }}>
                {TEMPLATES.map(tmpl => {
                    const isActive = selectedTemplate === tmpl.id;
                    return (
                        <div
                            key={tmpl.id}
                            onClick={() => {
                                if (tmpl.id !== 'custom') setSelectedTemplate(tmpl.id);
                            }}
                            style={{
                                borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                                border: isActive ? '3px solid #3b82f6' : '1px solid #e2e8f0',
                                boxShadow: isActive ? '0 0 0 3px rgba(59,130,246,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                                transition: 'all 0.2s',
                                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                            }}
                        >
                            {/* Preview Area */}
                            <div style={{
                                height: 160, background: tmpl.previewBg,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 48, position: 'relative',
                            }}>
                                {tmpl.icon}
                                {isActive && (
                                    <div style={{ position: 'absolute', top: 8, right: 8, background: '#3b82f6', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                                        ✓ เลือกแล้ว
                                    </div>
                                )}
                            </div>
                            {/* Info */}
                            <div style={{ padding: 16, background: '#fff' }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{tmpl.name}</h3>
                                <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{tmpl.description}</p>
                                {tmpl.id === 'custom' && (
                                    <div style={{ marginTop: 12 }}>
                                        <input type="file" id="custom-template-upload" accept=".html,.htm" style={{ display: 'none' }} onChange={handleCustomUpload} />
                                        <label htmlFor="custom-template-upload" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                            cursor: 'pointer', background: '#7c3aed', color: '#fff', border: 'none',
                                        }}>
                                            <i className="fas fa-upload" /> อัปโหลดไฟล์ HTML
                                        </label>
                                        {customFile && (
                                            <span style={{ marginLeft: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                                                ✓ {customFile.name}
                                            </span>
                                        )}
                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
                                            รองรับไฟล์ .html — สามารถใช้ตัวแปร {'{{runner.name}}'}, {'{{runner.bib}}'}, {'{{runner.time}}'} ฯลฯ
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
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
                    <li>รูปแบบ E-Slip ที่แสดงจะเป็นตามที่ Admin เลือกไว้ในหน้านี้</li>
                    <li>สำหรับ <strong>Custom Template</strong> — อัปโหลดเป็นไฟล์ <code>.html</code> ที่มี CSS และ layout ครบ</li>
                </ul>
            </div>
        </div>
        </AdminLayout>
    );
}
