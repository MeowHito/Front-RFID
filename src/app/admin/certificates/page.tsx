'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; nameTh?: string; nameEn?: string; categories?: RaceCategory[]; }
interface Runner {
    _id: string; bib: string; firstName: string; lastName: string; gender: string;
    category: string; ageGroup?: string; netTime?: number; status: string;
    overallRank?: number; genderRank?: number; ageGroupRank?: number;
    startTime?: string; finishTime?: string;
}

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CertificatesPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [search, setSearch] = useState('');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const certRef = useRef<HTMLDivElement>(null);
    const limit = 30;

    // Certificate customization
    const [certConfig, setCertConfig] = useState({
        title: 'Certificate of Completion',
        titleTh: 'ใบประกาศนียบัตร',
        subtitle: '',
        bgColor: '#1a1a2e',
        accentColor: '#e94560',
        textColor: '#ffffff',
        backgroundImage: '' as string,
    });
    const [bgUploading, setBgUploading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    if (data.categories?.length > 0) setSelectedCategory(data.categories[0].name);
                    // Load saved cert config from campaign
                    if (data.certTextColor) {
                        setCertConfig(prev => ({ ...prev, textColor: data.certTextColor }));
                    }
                    if (data.certBackgroundImage) {
                        setCertConfig(prev => ({ ...prev, backgroundImage: data.certBackgroundImage }));
                    }
                }
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || !selectedCategory) return;
        setRunnersLoading(true);
        try {
            const params = new URLSearchParams({
                campaignId: campaign._id, category: selectedCategory,
                page: String(page), limit: String(limit),
                runnerStatus: 'finished', sortBy: 'netTime', sortOrder: 'asc',
            });
            if (search) params.append('search', search);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setRunners(data.data || []);
                setTotal(data.total || 0);
            }
        } catch { setRunners([]); setTotal(0); }
        finally { setRunnersLoading(false); }
    }, [campaign, selectedCategory, page, search]);

    useEffect(() => { fetchRunners(); }, [fetchRunners]);

    const totalPages = Math.ceil(total / limit);

    const handlePrintCert = useCallback(async (runner: Runner) => {
        setSelectedRunner(runner);
        setGenerating(true);
        // Wait for render
        await new Promise(r => setTimeout(r, 200));
        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                showToast(language === 'th' ? 'บราวเซอร์บล็อก popup' : 'Browser blocked popup', 'error');
                return;
            }
            const certHtml = generateCertHTML(runner);
            printWindow.document.write(certHtml);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error generating certificate', 'error');
        } finally {
            setGenerating(false);
        }
    }, [campaign, certConfig, language]);

    const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast('Max file size 5MB', 'error'); return; }
        setBgUploading(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
            setCertConfig(prev => ({ ...prev, backgroundImage: ev.target?.result as string }));
            setBgUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveCertConfig = async () => {
        if (!campaign?._id) return;
        setConfigSaving(true);
        setConfigSaved(false);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    certTextColor: certConfig.textColor,
                    certBackgroundImage: certConfig.backgroundImage,
                }),
            });
            if (res.ok) {
                setConfigSaved(true);
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Saved', 'success');
                setTimeout(() => setConfigSaved(false), 3000);
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch { showToast('Error', 'error'); }
        finally { setConfigSaving(false); }
    };

    const generateCertHTML = (runner: Runner) => {
        const campaignName = language === 'th' ? (campaign?.nameTh || campaign?.name || '') : (campaign?.nameEn || campaign?.name || '');
        const bgImageCSS = certConfig.backgroundImage
            ? `background-image: url('${certConfig.backgroundImage}'); background-size: cover; background-position: center;`
            : `background: ${certConfig.bgColor};`;
        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Certificate - ${runner.bib}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Playfair+Display:wght@700&display=swap');
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 297mm; height: 210mm; display: flex; align-items: center; justify-content: center; font-family: 'Sarabun', sans-serif; }
.cert { width: 297mm; height: 210mm; position: relative; ${bgImageCSS} display: flex; flex-direction: column; align-items: center; justify-content: center; color: ${certConfig.textColor}; overflow: hidden; }
.cert::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 12px solid ${certConfig.accentColor}40; border-radius: 0; }
.cert::after { content: ''; position: absolute; top: 16px; left: 16px; right: 16px; bottom: 16px; border: 2px solid ${certConfig.accentColor}60; }
.cert-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.3); z-index: 0; }
.cert-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
.cert-title { font-family: 'Playfair Display', serif; font-size: 42px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 8px; color: ${certConfig.accentColor}; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
.cert-subtitle { font-size: 16px; letter-spacing: 8px; text-transform: uppercase; opacity: 0.85; margin-bottom: 40px; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
.cert-name { font-size: 38px; font-weight: 700; border-bottom: 2px solid ${certConfig.accentColor}; padding-bottom: 8px; margin-bottom: 16px; text-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.cert-details { font-size: 16px; opacity: 0.9; margin-bottom: 6px; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.cert-big { font-size: 22px; font-weight: 700; color: ${certConfig.accentColor}; margin: 12px 0; text-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.cert-event { font-size: 24px; font-weight: 600; margin-bottom: 30px; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
.cert-bottom { position: absolute; bottom: 40px; display: flex; gap: 80px; font-size: 13px; opacity: 0.7; z-index: 1; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
</style></head>
<body>
<div class="cert">
    ${certConfig.backgroundImage ? '<div class="cert-overlay"></div>' : ''}
    <div class="cert-content">
        <div class="cert-title">${certConfig.title}</div>
        <div class="cert-subtitle">${certConfig.titleTh}</div>
        <div class="cert-event">${campaignName}</div>
        <div class="cert-name">${runner.firstName} ${runner.lastName}</div>
        <div class="cert-details">BIB: ${runner.bib} | ${runner.category} | ${runner.gender === 'M' ? 'Male' : 'Female'}</div>
        <div class="cert-big">Gun Time: ${formatTime(runner.netTime)}</div>
        <div class="cert-details">${runner.ageGroup ? 'Age Group: ' + runner.ageGroup : ''}</div>
        <div class="cert-details">
            Overall Rank: ${runner.overallRank || '-'} | 
            Gender Rank: ${runner.genderRank || '-'} | 
            Age Group Rank: ${runner.ageGroupRank || '-'}
        </div>
    </div>
    <div class="cert-bottom">
        <div>Date: ${runner.finishTime ? formatDate(runner.finishTime) : '-'}</div>
    </div>
</div>
</body></html>`;
    };

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ใบประกาศ', labelEn: 'Certificates' }]}>
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                    background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>{toast.message}</div>
            )}

            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', fontSize: 14 }}>
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
                    {/* Left: Runner List */}
                    <div>
                        {/* Filters */}
                        <div className="content-box" style={{ padding: '12px 16px', marginBottom: 12 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select className="form-input" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
                                    style={{ width: 200, fontSize: 13, padding: '6px 10px' }}>
                                    {(campaign.categories || []).map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>
                                    ))}
                                </select>
                                <input
                                    className="form-input"
                                    placeholder={language === 'th' ? '🔍 ค้นหา BIB / ชื่อ...' : '🔍 Search BIB / name...'}
                                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    style={{ flex: 1, minWidth: 150, fontSize: 13, padding: '6px 10px' }}
                                />
                            </div>
                            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
                                {language === 'th' ? `แสดงเฉพาะนักวิ่งที่เข้าเส้นชัยแล้ว (${total} คน)` : `Showing only finished runners (${total} records)`}
                            </div>
                        </div>

                        {/* Runner List */}
                        <div className="content-box" style={{ padding: 0 }}>
                            {runnersLoading ? (
                                <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>Loading...</div>
                            ) : runners.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center' }}>
                                    <div style={{ fontSize: 48, marginBottom: 8 }}>🎖️</div>
                                    <p style={{ color: '#999', fontSize: 14 }}>
                                        {language === 'th' ? 'ไม่พบนักวิ่งที่เข้าเส้นชัย' : 'No finishers found'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {runners.map(r => (
                                        <div
                                            key={r._id}
                                            onClick={() => setSelectedRunner(r)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                                borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background .15s',
                                                background: selectedRunner?._id === r._id ? '#eff6ff' : 'transparent',
                                            }}
                                        >
                                            <div style={{ fontWeight: 800, fontSize: 16, color: '#3c8dbc', minWidth: 55, textAlign: 'center' }}>{r.bib}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.firstName} {r.lastName}</div>
                                                <div style={{ fontSize: 11, color: '#999' }}>{r.category} · {r.gender} · {r.ageGroup || '-'}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>{formatTime(r.netTime)}</div>
                                                <div style={{ fontSize: 10, color: '#999' }}>#{r.overallRank || '-'}</div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePrintCert(r); }}
                                                disabled={generating}
                                                style={{
                                                    padding: '5px 10px', borderRadius: 5, border: 'none',
                                                    background: '#3c8dbc', color: '#fff', fontSize: 11, fontWeight: 600,
                                                    cursor: generating ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                🖨️
                                            </button>
                                        </div>
                                    ))}
                                    {totalPages > 1 && (
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px' }}>
                                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                                style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}>←</button>
                                            <span style={{ fontSize: 11, color: '#666' }}>{page}/{totalPages}</span>
                                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                                style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 11 }}>→</button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: Certificate Preview & Config */}
                    <div>
                        {/* Config */}
                        <div className="content-box" style={{ padding: '14px 16px', marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                                {language === 'th' ? '⚙️ ตั้งค่าใบประกาศ' : '⚙️ Certificate Settings'}
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>Title (EN)</label>
                                    <input className="form-input" value={certConfig.title}
                                        onChange={e => setCertConfig(c => ({ ...c, title: e.target.value }))}
                                        style={{ width: '100%', fontSize: 12, padding: '5px 8px' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>Title (TH)</label>
                                    <input className="form-input" value={certConfig.titleTh}
                                        onChange={e => setCertConfig(c => ({ ...c, titleTh: e.target.value }))}
                                        style={{ width: '100%', fontSize: 12, padding: '5px 8px' }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#666' }}>BG Color</label>
                                        <input type="color" value={certConfig.bgColor}
                                            onChange={e => setCertConfig(c => ({ ...c, bgColor: e.target.value }))}
                                            style={{ width: '100%', height: 30, border: 'none', cursor: 'pointer' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#666' }}>Accent</label>
                                        <input type="color" value={certConfig.accentColor}
                                            onChange={e => setCertConfig(c => ({ ...c, accentColor: e.target.value }))}
                                            style={{ width: '100%', height: 30, border: 'none', cursor: 'pointer' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: '#666' }}>Text</label>
                                        <input type="color" value={certConfig.textColor}
                                            onChange={e => setCertConfig(c => ({ ...c, textColor: e.target.value }))}
                                            style={{ width: '100%', height: 30, border: 'none', cursor: 'pointer' }} />
                                    </div>
                                </div>

                                {/* Background Image Upload */}
                                <div>
                                    <label style={{ fontSize: 11, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                                        {language === 'th' ? 'ภาพพื้นหลัง (A4 landscape)' : 'Background Image (A4 landscape)'}
                                    </label>
                                    {certConfig.backgroundImage ? (
                                        <div style={{ position: 'relative', marginBottom: 6 }}>
                                            <img src={certConfig.backgroundImage} alt="bg" style={{ width: '100%', borderRadius: 6, border: '1px solid #e5e7eb', aspectRatio: '297/210', objectFit: 'cover' }} />
                                            <button onClick={() => setCertConfig(c => ({ ...c, backgroundImage: '' }))}
                                                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                                ✕ {language === 'th' ? 'ลบ' : 'Remove'}
                                            </button>
                                        </div>
                                    ) : null}
                                    <input type="file" id="cert-bg-upload" accept="image/*" style={{ display: 'none' }} onChange={handleBgImageUpload} />
                                    <label htmlFor="cert-bg-upload" style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        padding: '8px 12px', borderRadius: 6, border: '1px dashed #ccc',
                                        background: '#f9fafb', cursor: bgUploading ? 'wait' : 'pointer',
                                        fontSize: 12, fontWeight: 600, color: '#666',
                                    }}>
                                        {bgUploading ? '⏳ กำลังอัปโหลด...' : (certConfig.backgroundImage ? '📷 เปลี่ยนรูป' : '📷 อัปโหลดภาพพื้นหลัง')}
                                    </label>
                                    <p style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                        {language === 'th' ? 'แนะนำ: ขนาด 297×210mm, ไม่เกิน 5MB' : 'Recommended: 297×210mm, max 5MB'}
                                    </p>
                                </div>

                                {/* Save Config Button */}
                                <button onClick={handleSaveCertConfig} disabled={configSaving}
                                    style={{
                                        width: '100%', padding: '8px', borderRadius: 6, border: 'none',
                                        background: configSaving ? '#94a3b8' : '#00a65a', color: '#fff',
                                        fontWeight: 700, fontSize: 12, cursor: configSaving ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}>
                                    {configSaving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') :
                                     configSaved ? (language === 'th' ? '✓ บันทึกแล้ว' : '✓ Saved') :
                                     (language === 'th' ? '💾 บันทึกการตั้งค่า' : '💾 Save Settings')}
                                </button>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="content-box" style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                                {language === 'th' ? '👁️ ตัวอย่าง' : '👁️ Preview'}
                            </div>
                            <div ref={certRef} style={{
                                width: '100%', aspectRatio: '297/210', borderRadius: 8, overflow: 'hidden',
                                background: certConfig.backgroundImage ? `url(${certConfig.backgroundImage}) center/cover` : certConfig.bgColor,
                                color: certConfig.textColor,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                position: 'relative', fontSize: '0.6em', border: '2px solid #e5e7eb',
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: `6px solid ${certConfig.accentColor}30` }} />
                                <div style={{ fontFamily: 'serif', fontSize: '2.2em', fontWeight: 700, letterSpacing: 2, color: certConfig.accentColor, marginBottom: 4 }}>
                                    {certConfig.title}
                                </div>
                                <div style={{ fontSize: '0.9em', letterSpacing: 4, opacity: 0.7, marginBottom: 16 }}>
                                    {certConfig.titleTh}
                                </div>
                                <div style={{ fontSize: '1.3em', fontWeight: 600, marginBottom: 14 }}>
                                    {language === 'th' ? (campaign?.nameTh || campaign?.name) : (campaign?.nameEn || campaign?.name)}
                                </div>
                                {selectedRunner ? (
                                    <>
                                        <div style={{ fontSize: '1.8em', fontWeight: 700, borderBottom: `2px solid ${certConfig.accentColor}`, paddingBottom: 4, marginBottom: 8 }}>
                                            {selectedRunner.firstName} {selectedRunner.lastName}
                                        </div>
                                        <div style={{ fontSize: '0.9em', opacity: 0.8, marginBottom: 4 }}>
                                            BIB: {selectedRunner.bib} | {selectedRunner.category} | {selectedRunner.gender === 'M' ? 'Male' : 'Female'}
                                        </div>
                                        <div style={{ fontSize: '1.2em', fontWeight: 700, color: certConfig.accentColor, margin: '6px 0' }}>
                                            🏆 {formatTime(selectedRunner.netTime)}
                                        </div>
                                        <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                                            Overall: #{selectedRunner.overallRank || '-'} | Gender: #{selectedRunner.genderRank || '-'} | Age: #{selectedRunner.ageGroupRank || '-'}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ opacity: 0.5, fontSize: '1em' }}>
                                        {language === 'th' ? 'เลือกนักวิ่งเพื่อดูตัวอย่าง' : 'Select a runner to preview'}
                                    </div>
                                )}
                            </div>
                            {selectedRunner && (
                                <button
                                    onClick={() => handlePrintCert(selectedRunner)}
                                    disabled={generating}
                                    style={{
                                        width: '100%', padding: '10px', marginTop: 10, borderRadius: 6, border: 'none',
                                        background: '#3c8dbc', color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: generating ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <rect x="6" y="14" width="12" height="8" />
                                    </svg>
                                    {generating
                                        ? (language === 'th' ? 'กำลังสร้าง...' : 'Generating...')
                                        : (language === 'th' ? 'พิมพ์ / ดาวน์โหลด PDF' : 'Print / Download PDF')
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
