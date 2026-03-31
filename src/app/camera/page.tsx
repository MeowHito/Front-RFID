'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: '#f9f9f9',
    sidebar: '#f2f4f4',
    containerHigh: '#e4e9ea',
    containerLow: '#f2f4f4',
    containerLowest: '#ffffff',
    onSurface: '#2d3435',
    onVariant: '#5a6061',
    primary: '#5f5e5e',
    tertiary: '#745c00',
    onTertiary: '#fff8ef',
    outline: '#adb3b4',
    secondaryContainer: '#d8e5e6',
    onSecondaryContainer: '#475455',
    error: '#9f403d',
} as const;
const F = { headline: "'Newsreader', Georgia, serif", body: "'Manrope', system-ui, sans-serif" } as const;
const labelStyle: React.CSSProperties = { fontFamily: F.body, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.onSurface, opacity: 0.6, display: 'block', marginBottom: 10 };
const inputBase: React.CSSProperties = { width: '100%', background: C.containerHigh, border: 'none', outline: 'none', padding: '14px 16px', borderRadius: 2, fontFamily: F.body, fontSize: '0.9375rem', color: C.onSurface, boxSizing: 'border-box', appearance: 'none' };

interface Campaign { _id: string; name: string; nameTh?: string; slug?: string; }
interface Checkpoint { _id: string; name: string; orderNum?: number; }

type StreamStatus = 'idle' | 'setting-up' | 'connecting' | 'streaming' | 'stopped' | 'error';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export default function CameraPage() {
    const params = useParams();
    const routeCampaign = (params?.campaign as string | undefined) || '';
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [campaignId, setCampaignId] = useState('');
    const [campaignName, setCampaignName] = useState('');
    const [checkpointId, setCheckpointId] = useState('');
    const [checkpointName, setCheckpointName] = useState('');
    const [cameraName, setCameraName] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [status, setStatus] = useState<StreamStatus>('idle');
    const [cameraId, setCameraId] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [bytesSent, setBytesSent] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [savedCameraId, setSavedCameraId] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    const [clipSaveStatus, setClipSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [videoBitrateKbps, setVideoBitrateKbps] = useState(2500);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const initChunkRef = useRef<Blob | null>(null);
    const chunkBufferRef = useRef<Blob[]>([]);
    const mimeTypeRef = useRef<string>('');
    const clipBufferSecsRef = useRef<number>(10);

    useEffect(() => {
        fetch('/api/cctv-settings', { cache: 'no-store' })
            .then(r => r.json())
            .then(s => {
                if (s.clipBufferSeconds) clipBufferSecsRef.current = s.clipBufferSeconds;
                if (s.videoBitrateKbps) setVideoBitrateKbps(s.videoBitrateKbps);
            })
            .catch(() => {});

        const storedDevId = localStorage.getItem('cctv_device_id');
        if (storedDevId) { setDeviceId(storedDevId); }
        else { const g = 'MK1-' + Math.random().toString(36).substring(2, 8).toUpperCase(); setDeviceId(g); localStorage.setItem('cctv_device_id', g); }

        const s = localStorage.getItem('camera_settings');
        if (s) { try { const p = JSON.parse(s); if (p.cameraName) setCameraName(p.cameraName); if (p.location) setLocation(p.location); if (p.description) setDescription(p.description); if (p.facingMode) setFacingMode(p.facingMode); } catch { /**/ } }

        const sid = localStorage.getItem('camera_saved_id');
        if (sid) setSavedCameraId(sid);
    }, []);

    useEffect(() => {
        const loadCampaign = async () => {
            try {
                if (routeCampaign) {
                    const res = await fetch(`/api/campaigns/${encodeURIComponent(routeCampaign)}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?._id) {
                            setCampaignId(data._id);
                            setCampaignName(data.name || data.nameTh || '');
                            return;
                        }
                    }
                }

                const featuredRes = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!featuredRes.ok) return;
                const featured = await featuredRes.json();
                if (featured?._id) {
                    setCampaignId(featured._id);
                    setCampaignName(featured.name || featured.nameTh || '');
                }
            } catch {
                return;
            }
        };

        loadCampaign();
    }, [routeCampaign]);

    useEffect(() => {
        if (!campaignId) return;
        fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' })
            .then(r => r.json()).then(data => { const l: Checkpoint[] = Array.isArray(data) ? data : []; l.sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0)); setCheckpoints(l); })
            .catch(() => setCheckpoints([]));
    }, [campaignId]);

    const handleCheckpointChange = (cpId: string) => {
        setCheckpointId(cpId);
        setCheckpointName(checkpoints.find(c => c._id === cpId)?.name || '');
    };

    const handleSavePreset = useCallback(async () => {
        if (!campaignId || !cameraName.trim()) { setErrorMsg('กรุณาใส่ชื่อกล้องก่อน'); return; }
        setSaveStatus('saving');
        localStorage.setItem('camera_settings', JSON.stringify({ cameraName, location, description, facingMode }));
        const payload = { campaignId, name: cameraName.trim(), checkpointId: checkpointId || undefined, checkpointName: checkpointName || undefined, coverageZone: location || undefined, deviceId: deviceId || undefined };
        try {
            if (savedCameraId) {
                await fetch(`/api/cctv-cameras/register?id=${savedCameraId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            } else {
                const res = await fetch('/api/cctv-cameras/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (data._id) { setSavedCameraId(data._id); localStorage.setItem('camera_saved_id', data._id); }
            }
            setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 3000);
        } catch { setSaveStatus('error'); setErrorMsg('ไม่สามารถบันทึกได้'); }
    }, [campaignId, cameraName, checkpointId, checkpointName, location, description, facingMode, deviceId, savedCameraId]);

    const startStream = async () => {
        if (!campaignId || !cameraName.trim()) { setErrorMsg('กรุณาใส่ชื่อกล้องก่อน'); return; }
        setErrorMsg(''); setStatus('connecting');
        await handleSavePreset();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; await videoRef.current.play(); }
            const socket = io(`${SOCKET_URL}/cctv`, { path: '/socket.io', transports: ['websocket', 'polling'] });
            socketRef.current = socket;
            await new Promise<void>((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject); setTimeout(() => reject(new Error('Connection timeout')), 10000); });
            const regResult: any = await new Promise(resolve => { socket.emit('camera:register', { campaignId, name: cameraName.trim(), checkpointId: checkpointId || undefined, checkpointName: checkpointName || undefined, location: location || undefined, description: description || undefined, deviceId }, resolve); });
            if (!regResult?.success) throw new Error('Registration failed');
            const camId = regResult.cameraId; setCameraId(camId);
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            initChunkRef.current = null;
            chunkBufferRef.current = [];
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: videoBitrateKbps * 1000 });
            recorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    if (!initChunkRef.current) {
                        initChunkRef.current = e.data;
                    } else {
                        chunkBufferRef.current.push(e.data);
                        const maxChunks = Math.max(1, Math.ceil(clipBufferSecsRef.current / 2));
                        if (chunkBufferRef.current.length > maxChunks) chunkBufferRef.current.shift();
                    }
                    if (socket.connected) { e.data.arrayBuffer().then(buf => { socket.emit('camera:chunk', { cameraId: camId, chunk: buf, mimeType }); setBytesSent(prev => prev + buf.byteLength); }); }
                }
            };
            recorder.onerror = () => setStatus('error');
            recorder.start(2000);
            setStatus('streaming'); startTimeRef.current = Date.now();
            elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
        } catch (err: any) { setStatus('error'); setErrorMsg(err?.message || 'ไม่สามารถเปิดกล้องได้'); cleanup(); }
    };

    const stopStream = () => { socketRef.current?.emit('camera:stop'); cleanup(); setStatus('stopped'); setBytesSent(0); setElapsed(0); };

    const switchCamera = useCallback(async () => {
        const newFacing: 'user' | 'environment' = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(newFacing);
        if (status !== 'streaming') return; // not live → just update state
        try {
            // Stop recorder (keep socket alive)
            if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
            recorderRef.current = null;
            // Stop old tracks
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
            if (videoRef.current) videoRef.current.srcObject = null;
            // Open new camera
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            streamRef.current = newStream;
            if (videoRef.current) { videoRef.current.srcObject = newStream; await videoRef.current.play(); }
            // New recorder on same socket
            initChunkRef.current = null;
            chunkBufferRef.current = [];
            const socket = socketRef.current;
            const camId = cameraId;
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            const recorder = new MediaRecorder(newStream, { mimeType, videoBitsPerSecond: videoBitrateKbps * 1000 });
            recorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    if (!initChunkRef.current) { initChunkRef.current = e.data; }
                    else { chunkBufferRef.current.push(e.data); const maxChunks = Math.max(1, Math.ceil(clipBufferSecsRef.current / 2)); if (chunkBufferRef.current.length > maxChunks) chunkBufferRef.current.shift(); }
                    if (socket?.connected) { e.data.arrayBuffer().then(buf => { socket?.emit('camera:chunk', { cameraId: camId, chunk: buf, mimeType }); setBytesSent(prev => prev + buf.byteLength); }); }
                }
            };
            recorder.onerror = () => setStatus('error');
            recorder.start(2000);
        } catch (err: any) { setErrorMsg('ไม่สามารถสลับกล้องได้: ' + (err?.message || '')); }
    }, [facingMode, status, cameraId, videoBitrateKbps]);

    const saveClip = useCallback(async () => {
        if (status !== 'streaming' || !initChunkRef.current) return;
        setClipSaveStatus('saving');
        const mimeType = mimeTypeRef.current || 'video/webm';
        const allChunks = [initChunkRef.current, ...chunkBufferRef.current];
        const blob = new Blob(allChunks, { type: mimeType });
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = '';
            const CHUNK = 8192;
            for (let i = 0; i < uint8.length; i += CHUNK) {
                binary += String.fromCharCode(...Array.from(uint8.subarray(i, i + CHUNK)));
            }
            const videoBase64 = btoa(binary);
            const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            const res = await fetch('/api/cctv-recordings/clip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    videoBase64, mimeType, cameraId,
                    cameraName: cameraName.trim(), campaignId, checkpointName, location, deviceId,
                    durationSeconds: Math.min(chunkBufferRef.current.length * 2, clipBufferSecsRef.current),
                }),
            });
            setClipSaveStatus(res.ok ? 'saved' : 'error');
        } catch {
            setClipSaveStatus('error');
        }
        setTimeout(() => setClipSaveStatus('idle'), 3000);
    }, [status, cameraId, cameraName, campaignId, checkpointName, location, deviceId]);

    const cleanup = () => {
        recorderRef.current?.stop(); recorderRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
        socketRef.current?.disconnect(); socketRef.current = null;
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    useEffect(() => () => cleanup(), []);

    const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
    const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(2)} MB`;

    const isStreaming = status === 'streaming';
    const isConnecting = status === 'connecting';

    const navItems = [
        { icon: 'tune', label: 'GENERAL', active: true },
        { icon: 'videocam', label: 'VIDEO', active: false },
        { icon: 'mic', label: 'AUDIO', active: false },
        { icon: 'sensors', label: 'NETWORK', active: false },
    ];

    const HL = F.headline; // shorthand for serif font

    return (
        <div className="flex h-[100dvh] overflow-hidden bg-[#f9f9f9] text-[#2d3435]" style={{ fontFamily: F.body }}>

            {/* Sidebar overlay backdrop */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/25 z-30" onClick={() => setSidebarOpen(false)} />
            )}

            {/* ── Sidebar ── */}
            <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#f2f4f4] flex flex-col px-7 py-8 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="mb-7">
                    <p className="text-[0.65rem] font-bold tracking-widest uppercase text-[#5f5e5e] opacity-60 m-0">Configuration</p>
                    <p className="text-2xl italic mt-1 text-[#2d3435] m-0" style={{ fontFamily: HL }}>Manual Control</p>
                    {campaignName && <p className="text-xs font-bold text-[#745c00] mt-1.5">⭐ {campaignName}</p>}
                </div>
                <nav className="flex-1 flex flex-col gap-0.5">
                    {[{ icon: 'tune', label: 'GENERAL', active: true }, { icon: 'videocam', label: 'VIDEO' }, { icon: 'mic', label: 'AUDIO' }, { icon: 'sensors', label: 'NETWORK' }].map(item => (
                        <div key={item.label} className={`flex items-center gap-3.5 py-2.5 cursor-pointer text-[0.7rem] font-bold tracking-widest uppercase transition-all hover:translate-x-1 ${item.active ? 'text-[#2d3435]' : 'text-[#adb3b4]'}`}>
                            <span className="material-symbols-outlined text-[1.125rem]">{item.icon}</span>{item.label}
                        </div>
                    ))}
                </nav>
                <div className="mb-4">
                    <label className="block text-[0.65rem] font-bold tracking-widest uppercase text-[#5a6061] opacity-60 mb-1.5">รายละเอียดเพิ่มเติม</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="คำอธิบายเพิ่มเติม..."
                        className="w-full bg-[#e4e9ea] text-sm text-[#2d3435] px-3 py-2.5 rounded-sm outline-none resize-none border-none" />
                </div>
                <div className="border-t border-[#adb3b4]/20 pt-4 flex flex-col gap-1.5">
                    {[{ icon: 'help_outline', label: 'SUPPORT' }, { icon: 'update', label: 'FIRMWARE' }].map(item => (
                        <div key={item.label} className="flex items-center gap-3.5 py-1.5 cursor-pointer text-[0.65rem] tracking-widest uppercase text-[#adb3b4] hover:text-[#5f5e5e]">
                            <span className="material-symbols-outlined text-[1rem]">{item.icon}</span>{item.label}
                        </div>
                    ))}
                    <button onClick={handleSavePreset} className="mt-3 w-full py-3 bg-[#5f5e5e] text-[#faf7f6] text-[0.65rem] font-bold tracking-[0.2em] uppercase cursor-pointer border-none">
                        {saveStatus === 'saving' ? 'SAVING...' : saveStatus === 'saved' ? '✓ SAVED' : 'SAVE PRESET'}
                    </button>
                </div>
            </aside>

            {/* ── Main column ── */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* Header */}
                <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-[#f9f9f9] border-b border-[#adb3b4]/15">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(v => !v)} className="bg-transparent border-none cursor-pointer text-[#5a6061] p-0 leading-none">
                            <span className="material-symbols-outlined text-[1.375rem]">menu</span>
                        </button>
                        <span className="text-lg font-bold tracking-tight text-[#2d3435]" style={{ fontFamily: HL }}>ARCHIVIST MK1</span>
                        <nav className="flex gap-3.5">
                            {['Status', 'Media', 'Lenses'].map((t, i) => (
                                <span key={t} className={`text-sm italic cursor-pointer ${i === 0 ? 'text-[#745c00]' : 'text-[#adb3b4]'}`} style={{ fontFamily: HL }}>{t}</span>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        {savedCameraId && <span className="text-[0.6rem] font-bold text-[#745c00]">✓ DB</span>}
                        <span className="material-symbols-outlined text-[1.125rem] text-[#5f5e5e]">battery_full</span>
                        <span className="material-symbols-outlined text-[1.125rem] text-[#5f5e5e]">settings</span>
                    </div>
                </header>

                {/* Camera — fixed height: 38vh keeps proportions on any screen */}
                <section className="shrink-0 relative bg-[#1a1e1e] overflow-hidden" style={{ height: '38vh' }}>
                    <video ref={videoRef} autoPlay muted playsInline
                        className="w-full h-full object-contain"
                        style={{ display: isStreaming || isConnecting ? 'block' : 'none' }} />
                    {!isStreaming && !isConnecting && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-[2.5rem] text-[#5a6061] opacity-20">videocam_off</span>
                            <p className="text-[0.6rem] tracking-[0.25em] uppercase text-[#5a6061] opacity-30 m-0">STANDBY — No Signal</p>
                        </div>
                    )}
                    {/* HUD overlays */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none">
                        {/* Top row */}
                        <div className="flex justify-between items-start">
                            <div className="glass-hud px-3 py-1.5 rounded-full flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full inline-block ${isStreaming ? 'bg-red-500 animate-[livepulse_1.5s_infinite]' : 'bg-[#adb3b4]'}`} />
                                <span className="text-[0.6rem] font-bold tracking-[0.18em] uppercase text-[#2d3435]">
                                    {isStreaming ? `LIVE  ${fmt(elapsed)}` : 'STANDBY'}
                                </span>
                            </div>
                            <div className="glass-hud px-3 py-1.5 rounded-full flex items-center gap-2">
                                <span className="text-[0.5rem] uppercase text-[#2d3435] opacity-50">DATA</span>
                                <span className="text-[0.8rem] font-bold text-[#2d3435]" style={{ fontFamily: HL }}>{fmtBytes(bytesSent)}</span>
                            </div>
                        </div>
                        {/* Bottom controls */}
                        <div className="flex justify-center">
                            <div className="glass-hud px-6 py-2.5 rounded-xl flex items-center gap-6 pointer-events-auto">
                                <button onClick={switchCamera}
                                    className="bg-transparent border-none cursor-pointer"
                                    style={{ color: facingMode === 'user' ? '#745c00' : '#2d3435' }}>
                                    <span className="material-symbols-outlined text-[1.375rem]">cameraswitch</span>
                                </button>
                                <span className="material-symbols-outlined text-[1.375rem] text-[#2d3435] cursor-pointer">photo_camera</span>
                                <span className="material-symbols-outlined text-[1.375rem] text-[#2d3435] cursor-pointer">fullscreen</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Form + actions — fills remaining height, space distributed evenly */}
                <div className="flex-1 flex flex-col justify-between px-5 py-4 overflow-hidden">

                    {/* Section title */}
                    <div>
                        <div className="flex items-baseline gap-2.5 mb-3">
                            <h3 className="text-xl font-bold text-[#2d3435] m-0" style={{ fontFamily: HL }}>รายละเอียดการบันทึก</h3>
                            <span className="text-xs text-[#5a6061] opacity-60">กรอกข้อมูลจุดตรวจและอุปกรณ์</span>
                        </div>

                        {/* Error */}
                        {errorMsg && (
                            <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-[#fff7f6] rounded border border-[#9f403d]/25">
                                <span className="material-symbols-outlined text-[0.9rem] text-[#9f403d]">error</span>
                                <span className="text-xs text-[#9f403d]">{errorMsg}</span>
                            </div>
                        )}

                        {/* 2×2 field grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                            {/* Camera name */}
                            <div>
                                <label className="block text-xs font-bold tracking-widest uppercase text-[#5a6061] mb-1.5">
                                    ชื่อกล้อง <span className="text-red-500">*</span>
                                </label>
                                <input value={cameraName} onChange={e => setCameraName(e.target.value)}
                                    placeholder="เช่น Main Entrance Arch"
                                    className="w-full bg-[#e4e9ea] text-sm text-[#2d3435] px-3 py-2.5 rounded-sm outline-none border-none focus:bg-white transition-colors" />
                            </div>
                            {/* Checkpoint */}
                            <div>
                                <label className="block text-xs font-bold tracking-widest uppercase text-[#5a6061] mb-1.5">จุดตรวจ (Checkpoint)</label>
                                <div className="relative">
                                    <select value={checkpointId} onChange={e => handleCheckpointChange(e.target.value)}
                                        className="w-full bg-[#e4e9ea] text-sm text-[#2d3435] px-3 py-2.5 rounded-sm outline-none border-none appearance-none cursor-pointer">
                                        <option value="">— ไม่ระบุ —</option>
                                        {checkpoints.map(cp => <option key={cp._id} value={cp._id}>{cp.name}</option>)}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#adb3b4] text-[1rem]">keyboard_arrow_down</span>
                                </div>
                            </div>
                            {/* Device ID */}
                            <div>
                                <label className="block text-xs font-bold tracking-widest uppercase text-[#5a6061] mb-1.5">รหัสอุปกรณ์</label>
                                <input value={deviceId} readOnly
                                    className="w-full bg-[#f2f4f4] text-sm text-[#5a6061] px-3 py-2.5 rounded-sm outline-none border-none opacity-60 cursor-not-allowed" />
                            </div>
                            {/* Location */}
                            <div>
                                <label className="block text-xs font-bold tracking-widest uppercase text-[#5a6061] mb-1.5">โซน / สถานที่</label>
                                <input value={location} onChange={e => setLocation(e.target.value)}
                                    placeholder="เช่น ฝั่งขวา ก่อนถึง CP1"
                                    className="w-full bg-[#e4e9ea] text-sm text-[#2d3435] px-3 py-2.5 rounded-sm outline-none border-none focus:bg-white transition-colors" />
                            </div>
                        </div>
                    </div>

                    {/* Session summary bar */}
                    <div className="flex flex-wrap items-center gap-2.5 bg-[#f2f4f4] rounded px-4 py-3 my-3">
                        <span className="text-[0.65rem] font-bold tracking-widest uppercase text-[#5a6061] mr-1">SESSION</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isStreaming ? 'bg-[#d8e5e6] text-[#475455]' : 'bg-[#e4e9ea] text-[#5a6061]'}`}>
                            {isStreaming ? '🔴 LIVE' : isConnecting ? 'กำลังเชื่อมต่อ' : status === 'stopped' ? 'หยุดแล้ว' : 'เตรียมพร้อม'}
                        </span>
                        <span className="text-sm italic text-[#2d3435]" style={{ fontFamily: HL }}>{fmt(elapsed)}</span>
                        <span className="text-sm italic text-[#2d3435]" style={{ fontFamily: HL }}>{fmtBytes(bytesSent)}</span>
                        {savedCameraId && <span className="text-xs font-bold text-[#745c00]">✓ DB</span>}
                        <span className="material-symbols-outlined text-[0.875rem] text-[#745c00] ml-auto">verified_user</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2.5">
                        {!isStreaming && !isConnecting ? (
                            <button onClick={startStream} disabled={!campaignId || !cameraName.trim()}
                                className={`flex-1 py-4 text-sm font-bold tracking-wider uppercase border-none cursor-pointer transition-opacity ${!campaignId || !cameraName.trim() ? 'bg-[#e4e9ea] text-[#adb3b4] cursor-not-allowed' : 'bg-[#745c00] text-[#fff8ef] hover:opacity-90'}`}>
                                เริ่มการถ่ายทอดสด (START)
                            </button>
                        ) : isConnecting ? (
                            <button disabled className="flex-1 py-4 bg-[#92400e] text-[#fff8ef] text-sm font-bold tracking-wider uppercase border-none opacity-80">
                                กำลังเชื่อมต่อ...
                            </button>
                        ) : (
                            <button onClick={stopStream}
                                className="flex-1 py-4 bg-transparent text-[#9f403d] text-sm font-bold tracking-wider uppercase cursor-pointer border border-[#9f403d]/35 hover:bg-[#fff7f6] transition-colors">
                                หยุดการถ่ายทอด (STOP)
                            </button>
                        )}
                        {isStreaming ? (
                            <button onClick={saveClip} disabled={clipSaveStatus === 'saving'}
                                className={`shrink-0 px-5 py-4 text-xs font-bold tracking-widest uppercase cursor-pointer border transition-colors whitespace-nowrap ${
                                    clipSaveStatus === 'saving' ? 'bg-[#e4e9ea] text-[#adb3b4] border-[#adb3b4]/20 cursor-not-allowed'
                                    : clipSaveStatus === 'saved' ? 'bg-[#166534] text-white border-transparent'
                                    : clipSaveStatus === 'error' ? 'bg-[#9f403d] text-white border-transparent'
                                    : 'bg-[#166534]/10 text-[#166534] border-[#166534]/30 hover:bg-[#166534]/20'
                                }`}>
                                {clipSaveStatus === 'saving' ? '⏳ SAVING...' : clipSaveStatus === 'saved' ? '✓ CLIP SAVED' : clipSaveStatus === 'error' ? '✗ ERROR' : `💾 SAVE CLIP (${clipBufferSecsRef.current}s)`}
                            </button>
                        ) : (
                            <button onClick={handleSavePreset}
                                className="shrink-0 px-5 py-4 bg-transparent border border-[#adb3b4]/30 text-[#5f5e5e] text-xs font-bold tracking-widest uppercase cursor-pointer hover:bg-[#f2f4f4] transition-colors whitespace-nowrap">
                                {saveStatus === 'saved' ? '✓ SAVED' : 'SAVE'}
                            </button>
                        )}
                    </div>
                </div>
            </main>

            <style>{`
                .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; vertical-align: middle; }
                .glass-hud { background: rgba(249,249,249,0.65); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
                @keyframes livepulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
                * { -webkit-tap-highlight-color: transparent; }
            `}</style>
        </div>
    );
}

function getSupportedMimeType(): string {
    const types = [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm',
        'video/mp4;codecs=avc1',
        'video/mp4',
    ];
    for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
}
