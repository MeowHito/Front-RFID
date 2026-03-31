'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import { authHeaders } from '@/lib/authHeaders';
import AdminLayout from '../AdminLayout';

export default function CctvSettingsPage() {
    const { language } = useLanguage();
    const { user } = useAuth();
    const th = language === 'th';
    const isAdmin = user?.role === 'admin' || user?.role === 'admin_master';

    const [selectedResolution, setSelectedResolution] = useState('1080p');
    const [autoScale, setAutoScale] = useState(true);
    const [bufferMin, setBufferMin] = useState(15);
    const [preArrivalBuffer, setPreArrivalBuffer] = useState(30);
    const [clipBufferSeconds, setClipBufferSeconds] = useState(10);
    const [videoBitrateKbps, setVideoBitrateKbps] = useState(800);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [pairingToken, setPairingToken] = useState('');
    const [tokenExpiry, setTokenExpiry] = useState(0);

    // Load settings from API on mount
    useEffect(() => {
        fetch('/api/cctv-settings', { cache: 'no-store' })
            .then(r => r.json())
            .then(s => {
                if (s.resolution) setSelectedResolution(s.resolution);
                if (s.autoScale !== undefined) setAutoScale(s.autoScale);
                if (s.bufferMinutes) setBufferMin(s.bufferMinutes);
                if (s.preArrivalBuffer) setPreArrivalBuffer(s.preArrivalBuffer);
                if (s.clipBufferSeconds) setClipBufferSeconds(s.clipBufferSeconds);
                if (s.videoBitrateKbps) setVideoBitrateKbps(s.videoBitrateKbps);
            })
            .catch(() => {})
            .finally(() => setLoading(false));

        try {
            const savedToken = localStorage.getItem('cctv_pairing_token');
            if (savedToken) {
                const t = JSON.parse(savedToken);
                const remaining = Math.floor((t.expiresAt - Date.now()) / 1000);
                if (remaining > 0) { setPairingToken(t.token); setTokenExpiry(remaining); }
            }
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    // Generate pairing token
    const generateToken = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let token = '';
        for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
        const expiresAt = Date.now() + 300 * 1000;
        setPairingToken(token);
        setTokenExpiry(300);
        try {
            localStorage.setItem('cctv_pairing_token', JSON.stringify({ token, expiresAt }));
        } catch { /* ignore */ }
    };

    // Countdown timer for pairing token
    useEffect(() => {
        if (!pairingToken || tokenExpiry <= 0) return;
        const t = setInterval(() => setTokenExpiry(prev => prev - 1), 1000);
        return () => clearInterval(t);
    }, [pairingToken, tokenExpiry]);

    const formatExpiry = (s: number) => {
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    const handleSave = async () => {
        try {
            const res = await fetch('/api/cctv-settings', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    resolution: selectedResolution,
                    autoScale,
                    bufferMinutes: bufferMin,
                    preArrivalBuffer,
                    clipBufferSeconds,
                    videoBitrateKbps,
                }),
            });
            if (!res.ok) throw new Error('API error');
            setToast({ msg: th ? 'บันทึกการตั้งค่าแล้ว' : 'Settings saved', type: 'success' });
        } catch {
            setToast({ msg: th ? 'เกิดข้อผิดพลาด' : 'Failed to save', type: 'error' });
        }
    };

    const resolutions = [
        { value: '4K', label: 'ULTRA HD', detail: '4K', desc: th ? 'คุณภาพสูงสุด • ใช้แบนด์วิดท์มาก' : 'High Precision • Max Bandwidth', color: '#ea580c' },
        { value: '1080p', label: 'STABLE', detail: '1080p', desc: th ? 'สมดุล • เหมาะกับทั่วไป' : 'Optimized • Standard Load', color: '#000666' },
        { value: '720p', label: 'LOW LATENCY', detail: '720p', desc: th ? 'พร้อมใช้มือถือ • ประหยัดเน็ต' : 'Mobile Ready • Critical Speed', color: '#475569' },
    ];

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ตั้งค่า CCTV', labelEn: 'CCTV Settings' }]}>
            {/* Header */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>SYSTEM CONFIGURATION</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#000666' }}>
                    {th ? 'ตั้งค่าพารามิเตอร์ CCTV' : 'CCTV Parameters'}
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>
                    {th ? 'ตั้งค่าคุณภาพ stream, ระดับการเข้าถึง, และการจับคู่อุปกรณ์มือถือ' : 'Configure stream quality, access levels, and mobile device pairing'}
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stream Quality */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                                    ⚙️ {th ? 'คุณภาพ Stream' : 'Stream Quality Integrity'}
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                                    {th ? 'ปรับแบนด์วิดท์สำหรับ live feeds' : 'Adjust bandwidth allocation for live feeds'}
                                </p>
                            </div>
                            <span style={{ padding: '3px 10px', borderRadius: 6, background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                                LATENCY: 42MS
                            </span>
                        </div>

                        {/* Resolution Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                            {resolutions.map(res => (
                                <div
                                    key={res.value}
                                    onClick={() => isAdmin && setSelectedResolution(res.value)}
                                    style={{
                                        padding: '14px 16px',
                                        borderRadius: 10,
                                        border: selectedResolution === res.value ? `2px solid ${res.color}` : '2px solid #e2e8f0',
                                        background: selectedResolution === res.value ? '#f8fafc' : '#fff',
                                        cursor: isAdmin ? 'pointer' : 'default',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ fontSize: 10, fontWeight: 700, color: res.color, letterSpacing: 0.5, marginBottom: 4 }}>{res.label}</div>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: res.color, marginBottom: 4 }}>{res.detail}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{res.desc}</div>
                                </div>
                            ))}
                        </div>

                        {/* Auto-Scale Toggle */}
                        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13 }}>✏️</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{th ? 'ปรับคุณภาพอัตโนมัติ' : 'Auto-Scale Resolution'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {th ? 'ปรับคุณภาพตามความแออัดของเครือข่าย' : 'Adjust quality based on network congestion'}
                                </div>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: isAdmin ? 'pointer' : 'default' }}>
                                <input type="checkbox" checked={autoScale} onChange={e => isAdmin && setAutoScale(e.target.checked)} disabled={!isAdmin} style={{ opacity: 0, width: 0, height: 0 }} />
                                <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: autoScale ? '#ea580c' : '#cbd5e1', transition: 'background 0.2s' }} />
                                <span style={{ position: 'absolute', top: 2, left: autoScale ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                            </label>
                        </div>

                        {/* Buffer */}
                        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13 }}>🕐</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{th ? 'บัฟเฟอร์ (นาที)' : 'Rolling Buffer (Min)'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {th ? 'ระยะเวลา instant replay cache' : 'Duration of instant replay cache'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{bufferMin} MIN</span>
                                {isAdmin && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <button onClick={() => setBufferMin(prev => Math.min(prev + 5, 60))} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', fontSize: 8, padding: '1px 4px' }}>▲</button>
                                        <button onClick={() => setBufferMin(prev => Math.max(prev - 5, 5))} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', fontSize: 8, padding: '1px 4px' }}>▼</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pre-Arrival Alert Buffer */}
                        <div style={{ padding: '12px 16px', background: '#fff7ed', borderRadius: 10, border: '1.5px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13 }}>🏃</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#c2410c' }}>{th ? 'แจ้งเตือนนักวิ่งถึง (วินาที)' : 'Runner Arrival Alert (Sec)'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#9a3412', marginTop: 2 }}>
                                    {th ? 'แสดง alert บน feed เมื่อนักวิ่งผ่าน checkpoint ภายใน X วินาที' : 'Show alert overlay when runner scanned at checkpoint within X seconds'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 14px', borderRadius: 6, border: '1.5px solid #ea580c', fontWeight: 800, fontSize: 14, color: '#ea580c', background: '#fff' }}>{preArrivalBuffer}s</span>
                                {isAdmin && (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {[5, 10, 15, 20, 30, 45, 60].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setPreArrivalBuffer(v)}
                                                style={{
                                                    padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    border: preArrivalBuffer === v ? 'none' : '1px solid #e2e8f0',
                                                    background: preArrivalBuffer === v ? '#ea580c' : '#fff',
                                                    color: preArrivalBuffer === v ? '#fff' : '#64748b',
                                                }}
                                            >{v}s</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Clip Buffer Seconds — Save Clip window */}
                        <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, border: '1.5px solid #86efac', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13 }}>💾</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#166534' }}>{th ? 'บัฟเฟอร์บันทึกคลิป (วินาที)' : 'Save Clip Buffer (Sec)'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#166534', opacity: 0.75, marginTop: 2 }}>
                                    {th ? `เมื่อ Staff กดปุ่ม SAVE ในหน้า /camera จะบันทึกวิดีโอย้อนหลัง ${clipBufferSeconds} วินาทีก่อนกดบันทึก` : `When staff taps SAVE on /camera, records the last ${clipBufferSeconds}s before the tap`}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 14px', borderRadius: 6, border: '1.5px solid #16a34a', fontWeight: 800, fontSize: 14, color: '#16a34a', background: '#fff' }}>{clipBufferSeconds}s</span>
                                {isAdmin && (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {[5, 10, 15, 20, 30].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setClipBufferSeconds(v)}
                                                style={{
                                                    padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    border: clipBufferSeconds === v ? 'none' : '1px solid #e2e8f0',
                                                    background: clipBufferSeconds === v ? '#16a34a' : '#fff',
                                                    color: clipBufferSeconds === v ? '#fff' : '#64748b',
                                                }}
                                            >{v}s</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Video Bitrate */}
                        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13 }}>📶</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{th ? 'Video Bitrate (kbps)' : 'Video Bitrate (kbps)'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {th ? 'ค่าต่ำ = ไฟล์เล็ก / ค่าสูง = คุณภาพดีขึ้น' : 'Lower = smaller files / Higher = better quality'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {isAdmin && [400, 800, 1200, 2000].map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setVideoBitrateKbps(v)}
                                        style={{
                                            padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                            border: videoBitrateKbps === v ? 'none' : '1px solid #e2e8f0',
                                            background: videoBitrateKbps === v ? '#000666' : '#fff',
                                            color: videoBitrateKbps === v ? '#fff' : '#64748b',
                                        }}
                                    >{v}</button>
                                ))}
                                {!isAdmin && <span style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{videoBitrateKbps} kbps</span>}
                            </div>
                        </div>
                    </div>

                    {/* Access Levels */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#000666' }}>
                            👥 {th ? 'ระดับการเข้าถึง' : 'Access Levels'}
                        </h3>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
                            {th ? 'กำหนดสิทธิ์การดูและจัดการกล้อง' : 'Define operational permissions and visibility tiers'}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { level: 'LEVEL 0: SUPERUSER', role: 'Admin', desc: th ? 'เข้าถึงทุกอย่าง ตั้งค่าอุปกรณ์ได้' : 'Full system override and device configuration', perm: th ? 'เข้าถึงทั้งหมด' : 'TOTAL ACCESS', color: '#ea580c', icon: '🛡️' },
                                { level: 'LEVEL 1: ANALYST', role: th ? 'ผู้ติดตาม' : 'Follower', desc: th ? 'ดูกล้องได้อย่างเดียว' : 'Read-only access to specific dashboard telemetry', perm: th ? 'ดูสดเท่านั้น' : 'LIVE MONITORING', color: '#000666', icon: '👁' },
                            ].map((item, i) => (
                                <div key={i} style={{ padding: '16px', borderRadius: 10, border: `2px solid ${item.color}15`, background: `${item.color}08` }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: item.color, letterSpacing: 0.5, marginBottom: 4 }}>{item.level}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        <span style={{ fontSize: 20 }}>{item.icon}</span>
                                        <span style={{ fontSize: 18, fontWeight: 800, color: '#000666' }}>{item.role}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px', lineHeight: 1.4 }}>{item.desc}</p>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#16a34a' }}>
                                        ✅ {item.perm}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Mobile Node Pairing */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                            📱 {th ? 'จับคู่อุปกรณ์มือถือ' : 'Mobile Node Pairing'}
                        </h3>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
                            {th ? 'เปลี่ยนมือถือเป็นกล้อง CCTV' : 'Transform mobile devices into tactical cameras'}
                        </p>

                        {/* Token Display */}
                        <div style={{ padding: '20px', borderRadius: 10, border: '2px dashed #cbd5e1', textAlign: 'center', marginBottom: 16, background: '#f8fafc' }}>
                            {pairingToken && tokenExpiry > 0 ? (
                                <>
                                    <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: '#000666', letterSpacing: 4, marginBottom: 8 }}>
                                        {pairingToken}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#ea580c', fontWeight: 700 }}>
                                        {th ? 'หมดอายุใน' : 'EXPIRES IN'} {formatExpiry(tokenExpiry)}
                                    </div>
                                </>
                            ) : (
                                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                                    {th ? 'กดสร้าง Token เพื่อจับคู่อุปกรณ์' : 'Generate a token to pair devices'}
                                </div>
                            )}
                        </div>

                        {isAdmin && (
                            <button
                                onClick={generateToken}
                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid #ea580c', background: '#fff', color: '#ea580c', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#ea580c'; (e.target as HTMLButtonElement).style.color = '#fff'; }}
                                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = '#fff'; (e.target as HTMLButtonElement).style.color = '#ea580c'; }}
                            >
                                {th ? '🔑 สร้าง Pairing Token' : '🔑 GENERATE PAIRING TOKEN'}
                            </button>
                        )}
                    </div>

                    {/* Steps */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: 0.5 }}>
                            {th ? '📋 ขั้นตอนการตั้งค่า' : '📋 INITIALIZATION STEPS'}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                { step: 1, title: th ? 'เปิดหน้า /camera บนมือถือ' : 'Open /camera on mobile phone', desc: th ? 'เปิด browser บนมือถือแล้วเข้า URL ของระบบ เช่น https://live.action.in.th/camera' : 'Open browser on phone and go to system URL e.g. https://live.action.in.th/camera' },
                                { step: 2, title: th ? 'เลือกกิจกรรมและจุด Checkpoint' : 'Select campaign & checkpoint', desc: th ? 'เลือก campaign ที่ต้องการ, ตั้งชื่อกล้อง, เลือก Checkpoint' : 'Pick campaign, name the camera, select checkpoint' },
                                { step: 3, title: th ? 'กด "เริ่มการถ่ายทอดสด"' : 'Tap "Start Streaming"', desc: th ? 'ระบบจะเปิดกล้องและเริ่มส่ง Live ไปยัง /admin/cctv-live อัตโนมัติ' : 'Camera opens and starts streaming to /admin/cctv-live automatically' },
                                { step: 4, title: th ? 'ดูสดในหน้า Admin' : 'Watch live on Admin page', desc: th ? 'เปิด /admin/cctv-live เพื่อดูกล้องสด • วิดีโอจะบันทึกอัตโนมัติใน /admin/cctv-recordings' : 'Open /admin/cctv-live to watch • Recordings saved automatically to /admin/cctv-recordings' },
                            ].map(item => (
                                <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                                        {item.step}
                                    </span>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.title}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* How it works */}
                        <div style={{ marginTop: 16, padding: '12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', marginBottom: 8 }}>📱 {th ? 'วิธีการทำงาน' : 'How it works'}</div>
                            {[
                                { name: th ? 'ไม่ต้องติดตั้งแอป' : 'No app install needed', desc: th ? 'ใช้ browser มือถือได้เลย' : 'Works in mobile browser' },
                                { name: th ? 'Live + บันทึกอัตโนมัติ' : 'Live + Auto Record', desc: th ? 'ส่ง Live ไปหน้า Admin พร้อมบันทึกวิดีโอ' : 'Streams to admin + records video' },
                                { name: th ? 'รองรับหลายกล้อง' : 'Multi-camera support', desc: th ? 'เปิดได้หลายเครื่องพร้อมกัน' : 'Multiple phones at once' },
                                { name: th ? 'Save Clip ย้อนหลัง' : 'Clip Buffer', desc: th ? `กดบันทึกคลิปย้อนหลังได้ ${clipBufferSeconds} วินาที` : `Save last ${clipBufferSeconds}s as clip` },
                            ].map(a => (
                                <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #e0f2fe', fontSize: 11 }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{a.name}</span>
                                    <span style={{ color: '#64748b' }}>{a.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 20, padding: '12px 20px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: 0.5 }}>CCTV SYSTEM : ONLINE</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>v1.0.0</span>
                </div>
                {isAdmin && (
                    <button
                        onClick={handleSave}
                        style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                        {th ? '💾 บันทึกการตั้งค่า' : '💾 SAVE SETTINGS'}
                    </button>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
                    padding: '12px 24px', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 13,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                }}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
        </AdminLayout>
    );
}
