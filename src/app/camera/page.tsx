'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const F = { headline: "'Newsreader', Georgia, serif", body: "'Manrope', system-ui, sans-serif" } as const;

interface Checkpoint { _id: string; name: string; orderNum?: number; }
interface CameraRegisterResult { success?: boolean; cameraId?: string; }
interface FullscreenVideoElement extends HTMLVideoElement { webkitEnterFullscreen?: () => void; }

type StreamStatus = 'idle' | 'setting-up' | 'connecting' | 'streaming' | 'stopped' | 'error';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export default function CameraPage() {
    const params = useParams();
    const routeCampaign = (params?.campaign as string | undefined) || '';
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [campaignId, setCampaignId] = useState('');
    const [, setCampaignName] = useState('');
    const [checkpointId, setCheckpointId] = useState('');
    const [checkpointName, setCheckpointName] = useState('');
    const [cameraName, setCameraName] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

    const [status, setStatus] = useState<StreamStatus>('idle');
    const [cameraId, setCameraId] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [bytesSent, setBytesSent] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [savedCameraId, setSavedCameraId] = useState('');
    const [, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    const [videoBitrateKbps, setVideoBitrateKbps] = useState(2500);

    const videoRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLElement>(null);
    const streamRef = useRef<MediaStream | null>(null);          // raw camera stream
    const composedStreamRef = useRef<MediaStream | null>(null);  // canvas stream with timestamp burned in
    const composeRafRef = useRef<number | null>(null);
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

    const stopCompose = useCallback(() => {
        if (composeRafRef.current != null) {
            cancelAnimationFrame(composeRafRef.current);
            composeRafRef.current = null;
        }
        composedStreamRef.current?.getTracks().forEach(t => t.stop());
        composedStreamRef.current = null;
    }, []);

    const cleanup = useCallback(() => {
        recorderRef.current?.stop(); recorderRef.current = null;
        stopCompose();
        streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
        socketRef.current?.disconnect(); socketRef.current = null;
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (videoRef.current) videoRef.current.srcObject = null;
    }, [stopCompose]);

    const startStream = async () => {
        if (!campaignId || !cameraName.trim()) { setErrorMsg('กรุณาใส่ชื่อกล้องก่อน'); return; }
        setErrorMsg(''); setStatus('connecting');
        await handleSavePreset();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; await videoRef.current.play(); }
            // Timestamp is burned in by the server during ffmpeg conversion (using
            // recording.startTime), so the camera records the raw stream directly.
            stopCompose();
            const composedStream = stream;
            composedStreamRef.current = null;
            const socket = io(`${SOCKET_URL}/cctv`, { path: '/socket.io', transports: ['websocket', 'polling'] });
            socketRef.current = socket;
            await new Promise<void>((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject); setTimeout(() => reject(new Error('Connection timeout')), 10000); });
            const streamSessionId = `S-${Math.random().toString(36).substring(2, 10)}-${Date.now().toString(36)}`;
            const registerData = { campaignId, name: cameraName.trim(), checkpointId: checkpointId || undefined, checkpointName: checkpointName || undefined, location: location || undefined, description: description || undefined, deviceId, streamSessionId };
            const regResult = await new Promise<CameraRegisterResult>(resolve => { socket.emit('camera:register', registerData, resolve); });
            if (!regResult?.success) throw new Error('Registration failed');
            // Re-register on every subsequent reconnect so the server's camera
            // map stays populated even when the WebSocket briefly drops. The
            // server uses deviceId for a stable cameraId so the cameraId we
            // captured below stays valid across reconnects.
            socket.on('connect', () => { socket.emit('camera:register', registerData); });
            const camId = regResult.cameraId || '';
            setCameraId(camId);
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            initChunkRef.current = null;
            chunkBufferRef.current = [];
            const recorder = new MediaRecorder(composedStream, { mimeType, videoBitsPerSecond: videoBitrateKbps * 1000 });
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
        } catch (err: unknown) { setStatus('error'); setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเปิดกล้องได้'); cleanup(); }
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
            // Server burns timestamp during ffmpeg conversion — record raw stream directly.
            stopCompose();
            const composedStream = newStream;
            composedStreamRef.current = null;
            // New recorder on same socket
            initChunkRef.current = null;
            chunkBufferRef.current = [];
            const socket = socketRef.current;
            const camId = cameraId;
            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;
            const recorder = new MediaRecorder(composedStream, { mimeType, videoBitsPerSecond: videoBitrateKbps * 1000 });
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
        } catch (err: unknown) { setErrorMsg('ไม่สามารถสลับกล้องได้: ' + (err instanceof Error ? err.message : '')); }
    }, [facingMode, status, cameraId, videoBitrateKbps, stopCompose]);

    const openFullscreen = useCallback(async () => {
        setErrorMsg('');
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return;
            }
            const target = previewRef.current;
            if (target?.requestFullscreen) {
                await target.requestFullscreen();
                return;
            }
            const video = videoRef.current as FullscreenVideoElement | null;
            if (video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
                return;
            }
            setErrorMsg('เบราว์เซอร์นี้ไม่รองรับ Full Screen');
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเปิด Full Screen ได้');
        }
    }, []);

    useEffect(() => () => cleanup(), [cleanup]);

    const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
    const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(2)} MB`;

    const isStreaming = status === 'streaming';
    const isConnecting = status === 'connecting';

    const HL = F.headline; // shorthand for serif font

    return (
        <div
            className="flex overflow-hidden bg-[#f9f9f9] text-[#2d3435]"
            style={{
                fontFamily: F.body,
                /* dvh keeps it inside the viewport on Android Chrome (URL bar resizes).
                 * Fallbacks for older WebViews that don't support dvh. */
                height: '100dvh',
                minHeight: '-webkit-fill-available',
                maxHeight: '100vh',
            }}
        >
            {/* ── Main column ── */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* Camera viewport — smaller on portrait/short screens so action buttons stay reachable on Android phones */}
                <section
                    ref={previewRef}
                    className="shrink-0 relative bg-[#1a1e1e] overflow-hidden"
                    style={{ height: 'min(46vh, 46dvh, 430px)' }}
                >
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
                                <button onClick={openFullscreen}
                                    className="bg-transparent border-none cursor-pointer text-[#2d3435] p-0 flex items-center"
                                    aria-label="Open fullscreen">
                                    <span className="material-symbols-outlined text-[1.375rem]">fullscreen</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Form + actions — fills remaining height; form scrolls, action buttons stay pinned at bottom */}
                <div className="flex-1 flex flex-col min-h-0 px-5 pt-5 pb-3 overflow-hidden">

                    {/* Scrollable form region (everything except the action buttons) */}
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>

                    {/* Section title */}
                    <div>
                        <div className="flex items-baseline gap-2.5 mb-3">
                            <h3 className="text-xl font-bold text-[#2d3435] m-0" style={{ fontFamily: HL }}>รายละเอียดการบันทึก</h3>
                            
                        </div>

                        {/* Error */}
                        {errorMsg && (
                            <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-[#fff7f6] rounded border border-[#9f403d]/25">
                                <span className="material-symbols-outlined text-[0.9rem] text-[#9f403d]">error</span>
                                <span className="text-xs text-[#9f403d]">{errorMsg}</span>
                            </div>
                        )}

                        {/* 2×2 field grid */}
                        <div className="grid grid-cols-1 gap-y-3.5">
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
                        </div>
                    </div>

                    </div>{/* /scrollable form region */}

                    {/* Action buttons — pinned outside the scroll area, always reachable on small Android screens */}
                    <div className="shrink-0 flex gap-2.5 pt-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                        {!isStreaming && !isConnecting ? (
                            <button onClick={startStream} disabled={!campaignId || !cameraName.trim()}
                                className={`flex-1 py-4 text-sm font-bold tracking-wider uppercase border-none cursor-pointer transition-opacity ${!campaignId || !cameraName.trim() ? 'bg-[#e4e9ea] text-[#adb3b4] cursor-not-allowed' : 'bg-[#dc2626] text-white hover:opacity-90'}`}>
                                เริ่มการถ่ายทอดสด (START)
                            </button>
                        ) : isConnecting ? (
                            <button disabled className="flex-1 py-4 bg-[#dc2626] text-white text-sm font-bold tracking-wider uppercase border-none opacity-80">
                                กำลังเชื่อมต่อ...
                            </button>
                        ) : (
                            <button onClick={stopStream}
                                className="flex-1 py-4 bg-[#dc2626] text-white text-sm font-bold tracking-wider uppercase cursor-pointer border border-[#dc2626] hover:opacity-90 transition-opacity">
                                หยุดการถ่ายทอด (STOP)
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
