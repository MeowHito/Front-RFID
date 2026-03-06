'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Campaign { _id: string; name: string; }
interface Runner {
    _id: string; bib: string; firstName: string; lastName: string;
    firstNameTh?: string; lastNameTh?: string;
    gender: string; category: string; ageGroup?: string; nationality?: string;
    status: string; chipCode?: string; printingCode?: string; rfidTag?: string;
    netTime?: number; overallRank?: number;
    team?: string; teamName?: string;
}
interface ScanRecord {
    code: string;
    runner: Runner | null;
    found: boolean;
    time: Date;
}

export default function BibCheckPage() {
    const { language } = useLanguage();
    const t = (th: string, en: string) => language === 'th' ? th : en;

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
    const [lastResult, setLastResult] = useState<ScanRecord | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load campaigns
    useEffect(() => {
        fetch('/api/campaigns')
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : data?.data || [];
                setCampaigns(list);
                if (list.length > 0 && !selectedCampaign) {
                    setSelectedCampaign(list[0]._id);
                }
            })
            .catch(console.error);
    }, []);

    // Auto-focus input for scanner
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(timer);
    }, [selectedCampaign, lastResult]);

    const formatTime = (ms?: number) => {
        if (!ms || ms <= 0) return '-';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getStatusLabel = (status: string) => {
        const map: Record<string, { th: string; en: string; color: string; bg: string }> = {
            'not_started': { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#6b7280', bg: '#f3f4f6' },
            'in_progress': { th: 'กำลังวิ่ง', en: 'In Progress', color: '#2563eb', bg: '#dbeafe' },
            'finished': { th: 'จบแล้ว', en: 'Finished', color: '#16a34a', bg: '#dcfce7' },
            'dnf': { th: 'ไม่จบ', en: 'DNF', color: '#dc2626', bg: '#fee2e2' },
            'dns': { th: 'ไม่ออกวิ่ง', en: 'DNS', color: '#9333ea', bg: '#f3e8ff' },
            'dq': { th: 'ถูกตัดสิทธิ์', en: 'DQ', color: '#dc2626', bg: '#fee2e2' },
        };
        return map[status] || { th: status, en: status, color: '#6b7280', bg: '#f3f4f6' };
    };

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || !selectedCampaign || loading) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({ campaignId: selectedCampaign, code });
            const res = await fetch(`/api/runners/lookup?${params.toString()}`);
            const data = await res.json();

            const record: ScanRecord = {
                code,
                runner: data.runner || null,
                found: !!data.found,
                time: new Date(),
            };

            setLastResult(record);
            setScanHistory(prev => [record, ...prev].slice(0, 50)); // Keep last 50 scans
        } catch (err) {
            const record: ScanRecord = { code, runner: null, found: false, time: new Date() };
            setLastResult(record);
            setScanHistory(prev => [record, ...prev].slice(0, 50));
        } finally {
            setLoading(false);
            setScanCode('');
            // Re-focus input for next scan
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [scanCode, selectedCampaign, loading]);

    return (
        <AdminLayout>
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '24px', flexWrap: 'wrap', gap: '16px',
                }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                            🔍 {t('เช็คบิบ / สแกน RFID', 'Check BIB / Scan RFID')}
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
                            {t('สแกนรหัสหรือพิมพ์ BIB เพื่อค้นหานักวิ่ง', 'Scan code or type BIB to find runner')}
                        </p>
                    </div>
                </div>

                {/* Campaign Selector + Scanner Input */}
                <div style={{
                    background: '#fff', borderRadius: '12px', padding: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px',
                }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'end' }}>
                        {/* Campaign Select */}
                        <div style={{ flex: '0 0 300px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                {t('เลือกกิจกรรม', 'Select Campaign')}
                            </label>
                            <select
                                value={selectedCampaign}
                                onChange={e => setSelectedCampaign(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0',
                                    borderRadius: '8px', fontSize: '14px', background: '#fff',
                                }}
                            >
                                {campaigns.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Scan Input */}
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                {t('สแกน / พิมพ์ BIB, ChipCode, หรือ PrintingCode', 'Scan / Type BIB, ChipCode, or PrintingCode')}
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={scanCode}
                                    onChange={e => setScanCode(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                                    placeholder={t('สแกนหรือพิมพ์รหัส...', 'Scan or type code...')}
                                    autoFocus
                                    style={{
                                        flex: 1, padding: '10px 16px',
                                        border: '2px solid #3b82f6', borderRadius: '8px',
                                        fontSize: '18px', fontFamily: 'monospace', fontWeight: '600',
                                        outline: 'none',
                                    }}
                                />
                                <button
                                    onClick={handleScan}
                                    disabled={loading || !scanCode.trim()}
                                    style={{
                                        padding: '10px 24px', background: loading ? '#94a3b8' : '#3b82f6',
                                        color: '#fff', border: 'none', borderRadius: '8px',
                                        fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {loading ? '...' : t('ค้นหา', 'Search')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Result Card */}
                {lastResult && (
                    <div style={{
                        background: lastResult.found ? '#f0fdf4' : '#fef2f2',
                        border: `2px solid ${lastResult.found ? '#86efac' : '#fca5a5'}`,
                        borderRadius: '12px', padding: '24px', marginBottom: '24px',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        {lastResult.found && lastResult.runner ? (
                            <div>
                                {/* Header: Status + Scan Time */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '28px' }}>✅</span>
                                        <div>
                                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#166534' }}>
                                                {t('พบนักวิ่ง!', 'Runner Found!')}
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#4ade80' }}>
                                                {t('สแกนรหัส:', 'Scanned code:')} <code style={{ fontFamily: 'monospace', fontWeight: '600' }}>{lastResult.code}</code>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            display: 'inline-block', padding: '6px 16px', borderRadius: '20px',
                                            fontSize: '13px', fontWeight: '600',
                                            color: getStatusLabel(lastResult.runner.status).color,
                                            background: getStatusLabel(lastResult.runner.status).bg,
                                        }}>
                                            {t(getStatusLabel(lastResult.runner.status).th, getStatusLabel(lastResult.runner.status).en)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                            {lastResult.time.toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Runner Info Grid */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '16px',
                                }}>
                                    <InfoCard label={t('BIB', 'BIB')} value={lastResult.runner.bib} large />
                                    <InfoCard
                                        label={t('ชื่อ', 'Name')}
                                        value={`${lastResult.runner.firstName} ${lastResult.runner.lastName}`}
                                        sub={lastResult.runner.firstNameTh ? `${lastResult.runner.firstNameTh} ${lastResult.runner.lastNameTh || ''}` : undefined}
                                    />
                                    <InfoCard label={t('เพศ', 'Gender')} value={lastResult.runner.gender === 'M' ? t('ชาย', 'Male') : t('หญิง', 'Female')} />
                                    <InfoCard label={t('ประเภท', 'Category')} value={lastResult.runner.category} />
                                    <InfoCard label={t('กลุ่มอายุ', 'Age Group')} value={lastResult.runner.ageGroup || '-'} />
                                    <InfoCard label={t('สัญชาติ', 'Nationality')} value={lastResult.runner.nationality || '-'} />
                                    <InfoCard label="ChipCode" value={lastResult.runner.chipCode || '-'} mono />
                                    <InfoCard label="PrintingCode" value={lastResult.runner.printingCode || '-'} mono />
                                    <InfoCard label={t('เวลา', 'Time')} value={formatTime(lastResult.runner.netTime)} />
                                    <InfoCard label={t('อันดับ', 'Rank')} value={lastResult.runner.overallRank ? `#${lastResult.runner.overallRank}` : '-'} />
                                    <InfoCard label={t('ทีม', 'Team')} value={lastResult.runner.teamName || lastResult.runner.team || '-'} />
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '28px' }}>❌</span>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#991b1b' }}>
                                        {t('ไม่พบนักวิ่ง', 'Runner Not Found')}
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#dc2626' }}>
                                        {t('รหัส:', 'Code:')} <code style={{ fontFamily: 'monospace', fontWeight: '600' }}>{lastResult.code}</code>
                                        {' — '}{t('ไม่พบ BIB, ChipCode หรือ PrintingCode ที่ตรงกัน', 'No matching BIB, ChipCode, or PrintingCode found')}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Scan History */}
                {scanHistory.length > 0 && (
                    <div style={{
                        background: '#fff', borderRadius: '12px', padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '16px',
                        }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                📋 {t('ประวัติการสแกน', 'Scan History')} ({scanHistory.length})
                            </h3>
                            <button
                                onClick={() => { setScanHistory([]); setLastResult(null); }}
                                style={{
                                    padding: '6px 12px', fontSize: '12px', border: '1px solid #e2e8f0',
                                    borderRadius: '6px', background: '#fff', color: '#64748b', cursor: 'pointer',
                                }}
                            >
                                {t('ล้าง', 'Clear')}
                            </button>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>#</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('รหัสสแกน', 'Scanned Code')}</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('ผลลัพธ์', 'Result')}</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>BIB</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('ชื่อ', 'Name')}</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('ประเภท', 'Category')}</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('สถานะ', 'Status')}</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>{t('เวลา', 'Time')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scanHistory.map((scan, i) => {
                                        const statusInfo = scan.runner ? getStatusLabel(scan.runner.status) : null;
                                        return (
                                            <tr
                                                key={i}
                                                style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    background: i === 0 ? (scan.found ? '#f0fdf4' : '#fef2f2') : undefined,
                                                }}
                                            >
                                                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{scanHistory.length - i}</td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: '600' }}>{scan.code}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                                        fontSize: '11px', fontWeight: '600',
                                                        background: scan.found ? '#dcfce7' : '#fee2e2',
                                                        color: scan.found ? '#166534' : '#991b1b',
                                                    }}>
                                                        {scan.found ? t('พบ', 'Found') : t('ไม่พบ', 'Not Found')}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', fontWeight: '600' }}>{scan.runner?.bib || '-'}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {scan.runner ? `${scan.runner.firstName} ${scan.runner.lastName}` : '-'}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>{scan.runner?.category || '-'}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {statusInfo && (
                                                        <span style={{
                                                            display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                                            fontSize: '11px', fontWeight: '600',
                                                            color: statusInfo.color, background: statusInfo.bg,
                                                        }}>
                                                            {t(statusInfo.th, statusInfo.en)}
                                                        </span>
                                                    )}
                                                    {!scan.runner && '-'}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '12px' }}>
                                                    {scan.time.toLocaleTimeString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {scanHistory.length === 0 && !lastResult && (
                    <div style={{
                        textAlign: 'center', padding: '60px 20px', color: '#94a3b8',
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
                        <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                            {t('รอการสแกน', 'Waiting for Scan')}
                        </div>
                        <div style={{ fontSize: '14px' }}>
                            {t('ใช้เครื่องสแกน RFID หรือพิมพ์รหัส BIB / ChipCode / PrintingCode แล้วกด Enter',
                                'Use RFID scanner or type BIB / ChipCode / PrintingCode and press Enter')}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </AdminLayout>
    );
}

function InfoCard({ label, value, sub, large, mono }: {
    label: string; value: string; sub?: string; large?: boolean; mono?: boolean;
}) {
    return (
        <div style={{
            background: '#fff', borderRadius: '8px', padding: '12px 16px',
            border: '1px solid #e2e8f0',
        }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                {label}
            </div>
            <div style={{
                fontSize: large ? '24px' : '15px',
                fontWeight: large ? '800' : '600',
                color: '#1e293b',
                fontFamily: mono ? 'monospace' : 'inherit',
            }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    {sub}
                </div>
            )}
        </div>
    );
}
