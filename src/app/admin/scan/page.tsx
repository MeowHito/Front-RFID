'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';

// ---------------------------------------------------------------------------
// RaceControl Checkpoint Scanner — "Velocity Performance System" dark theme.
// ---------------------------------------------------------------------------
// Full-screen, station-focused surface (no AdminLayout). Mirrors the Stitch
// designs in /stitch 2 (checkpoint_qr_scanner_dark_mode + race_control_desktop):
//   • Desktop: top bar + slim sidebar + 12-col dashboard (scanner / last scan /
//     stats / live results table).
//   • Mobile: top bar + full scanner viewfinder + recent activity, with a
//     bottom nav (Scanner / Manual / History / Results) and a settings sheet.
//
// Logic is unchanged from the previous scanner: pick Campaign (starred) →
// Event → Checkpoint once, then continuously scan runners' bib QR/barcodes.
// Each scan looks up the runner and POSTs to /timing/scan (the same endpoint
// RFID readers use) with instant audio + visual feedback. The QR/barcode is
// assumed to encode the plain BIB number.
//
// Design tokens (used inline as Tailwind arbitrary values):
//   bg #131318 · surface-low #1b1b20 · surface #1f1f24 · high #2a292f ·
//   highest #35343a · lowest #0e0e13 · on-surface #e4e1e9 ·
//   on-surface-variant #c4c9ac · outline-variant #444933 ·
//   lime (primary) #c3f400 / dim #abd600 · on-lime #161e00 · blue #adc6ff ·
//   blue-fixed #d8e2ff · error #ffb4ab
// ---------------------------------------------------------------------------

interface Campaign { _id: string; name: string; nameTh?: string; nameEn?: string }
interface RaceEvent { _id: string; name?: string; nameTh?: string; nameEn?: string; status?: string; eventDate?: string }
interface Checkpoint { _id: string; name: string; eventId?: string; kmCumulative?: number; order?: number }
interface Runner {
    _id?: string; bib?: string; firstName?: string; lastName?: string;
    firstNameTh?: string; lastNameTh?: string; firstNameEn?: string; lastNameEn?: string;
    category?: string;
}

// Participant row from /api/runners?id=<eventId> (getAllParticipantByEvent).
interface Participant {
    _id?: string; bib?: string;
    firstName?: string; lastName?: string; firstNameTh?: string; lastNameTh?: string;
    gender?: string; category?: string; ageGroup?: string; status?: string;
    latestCheckpoint?: string; passedCount?: number; overallRank?: number;
    netTimeStr?: string; gunTimeStr?: string; netPace?: string; gunPace?: string;
    passTime?: string;
}

type ScanStatus = 'success' | 'duplicate' | 'notfound' | 'error';
interface ScanEntry { id: string; bib: string; name: string; status: ScanStatus; message: string; time: string }

interface BarcodeScannerInstance {
    start: (
        camera: { facingMode: string } | string,
        config: { fps: number; qrbox: (vw: number, vh: number) => { width: number; height: number } },
        onSuccess: (decodedText: string) => void,
        onError: (err: unknown) => void,
    ) => Promise<void>;
    stop: () => Promise<void>;
    clear: () => void;
}

const SCAN_COOLDOWN_MS = 4000;
const PARTICIPANTS_POLL_MS = 12000;

function runnerName(r: Runner | null, lang: string): string {
    if (!r) return '';
    if (lang === 'th') {
        const th = [r.firstNameTh, r.lastNameTh].filter(Boolean).join(' ').trim();
        if (th) return th;
    }
    const en = [r.firstNameEn || r.firstName, r.lastNameEn || r.lastName].filter(Boolean).join(' ').trim();
    return en || [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
}
function participantName(p: Participant, lang: string): string {
    if (lang === 'th') {
        const th = [p.firstNameTh, p.lastNameTh].filter(Boolean).join(' ').trim();
        if (th) return th;
    }
    return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || `BIB ${p.bib || '?'}`;
}
function eventLabel(e: RaceEvent, lang: string): string {
    return (lang === 'th' ? e.nameTh : e.nameEn) || e.name || e.nameTh || e.nameEn || e._id;
}

type MobileView = 'scanner' | 'manual' | 'history' | 'results';

export default function ScanPage() {
    const { language } = useLanguage();
    const t = (th: string, en: string) => (language === 'th' ? th : en);

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [events, setEvents] = useState<RaceEvent[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

    const campaignId = campaign?._id || '';
    const [eventId, setEventId] = useState('');
    const [checkpoint, setCheckpoint] = useState('');

    const [scanning, setScanning] = useState(false);
    const [log, setLog] = useState<ScanEntry[]>([]);
    const [last, setLast] = useState<ScanEntry | null>(null);
    const [manualBib, setManualBib] = useState('');
    const [soundOn, setSoundOn] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [participants, setParticipants] = useState<Participant[]>([]);
    const [search, setSearch] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [mobileView, setMobileView] = useState<MobileView>('scanner');
    const [now, setNow] = useState(() => new Date());

    const scannerRef = useRef<BarcodeScannerInstance | null>(null);
    const cooldownRef = useRef<Map<string, number>>(new Map());
    const scannedThisSessionRef = useRef<Set<string>>(new Set());
    const audioCtxRef = useRef<AudioContext | null>(null);
    const ctxRef = useRef({ campaignId: '', eventId: '', checkpoint: '' });
    ctxRef.current = { campaignId, eventId, checkpoint };

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

    // live clock for the footer / header
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // ----- load the featured (starred) campaign -----
    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.json())
            .then(data => setCampaign(data && data._id ? data : null))
            .catch(() => setCampaign(null));
    }, []);

    // ----- load events + checkpoints when campaign changes -----
    useEffect(() => {
        setEventId('');
        setEvents([]);
        setCheckpoints([]);
        setCheckpoint('');
        if (!campaignId) return;
        fetch(`/api/events/by-campaign/${campaignId}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => setEvents(Array.isArray(data) ? data : data?.data || []))
            .catch(() => setEvents([]));
        fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => setCheckpoints(Array.isArray(data) ? data : []))
            .catch(() => setCheckpoints([]));
    }, [campaignId]);

    // Checkpoints scoped to the selected event (fall back to all if none carry eventId).
    const eventCheckpoints = useMemo(() => {
        if (!eventId) return checkpoints;
        const scoped = checkpoints.filter(c => !c.eventId || c.eventId === eventId);
        const named = scoped.length ? scoped : checkpoints;
        const seen = new Set<string>();
        return named.filter(c => {
            if (!c.name || seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        });
    }, [checkpoints, eventId]);

    // ----- live results: participants for the selected event (polled) -----
    const loadParticipants = useCallback(async () => {
        if (!eventId) { setParticipants([]); return; }
        try {
            const res = await fetch(`/api/runners?id=${eventId}`, { cache: 'no-store' });
            const json = await res.json();
            const list: Participant[] = json?.data?.data || json?.data || (Array.isArray(json) ? json : []);
            setParticipants(Array.isArray(list) ? list : []);
        } catch {
            setParticipants([]);
        }
    }, [eventId]);

    useEffect(() => {
        loadParticipants();
        if (!eventId) return;
        const id = setInterval(loadParticipants, PARTICIPANTS_POLL_MS);
        return () => clearInterval(id);
    }, [eventId, loadParticipants]);

    const beep = useCallback((ok: boolean) => {
        if (!soundOn) return;
        try {
            if (!audioCtxRef.current) {
                const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                audioCtxRef.current = new Ctx();
            }
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = ok ? 980 : 280;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.15 : 0.35));
            osc.start();
            osc.stop(ctx.currentTime + (ok ? 0.16 : 0.36));
        } catch { /* audio not available — ignore */ }
    }, [soundOn]);

    const pushEntry = (entry: ScanEntry) => {
        setLast(entry);
        setLog(prev => [entry, ...prev].slice(0, 50));
    };

    // ----- core: process a decoded code -----
    const handleCode = useCallback(async (raw: string) => {
        const { campaignId: cId, eventId: eId, checkpoint: cp } = ctxRef.current;
        if (!eId || !cp) return;

        const bib = (raw || '').trim();
        if (!bib) return;

        const nowMs = Date.now();
        const lastSeen = cooldownRef.current.get(bib) || 0;
        if (nowMs - lastSeen < SCAN_COOLDOWN_MS) return;
        cooldownRef.current.set(bib, nowMs);

        const sessionKey = `${eId}::${cp}::${bib}`;
        if (scannedThisSessionRef.current.has(sessionKey)) {
            beep(false);
            pushEntry({ id: `${nowMs}-${bib}`, bib, name: '', status: 'duplicate', message: t('สแกนแล้วที่จุดนี้', 'Already scanned here'), time: new Date().toLocaleTimeString('th-TH') });
            return;
        }

        let runner: Runner | null = null;
        try {
            const params = new URLSearchParams({ code: bib });
            if (cId) params.set('campaignId', cId);
            const res = await fetch(`/api/runners/lookup?${params.toString()}`);
            const data = await res.json();
            runner = (data?.runner as Runner) || null;
        } catch { runner = null; }

        if (!runner) {
            beep(false);
            pushEntry({ id: `${nowMs}-${bib}`, bib, name: '', status: 'notfound', message: t('ไม่พบนักวิ่ง BIB นี้', 'No runner for this BIB'), time: new Date().toLocaleTimeString('th-TH') });
            return;
        }

        try {
            const res = await fetch('/api/timing/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: eId, bib, checkpoint: cp, scanTime: new Date().toISOString(), note: 'qrcode' }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(errText || `HTTP ${res.status}`);
            }
            scannedThisSessionRef.current.add(sessionKey);
            beep(true);
            pushEntry({ id: `${nowMs}-${bib}`, bib, name: runnerName(runner, language) || `BIB ${bib}`, status: 'success', message: t('บันทึกเวลาแล้ว', 'Time recorded'), time: new Date().toLocaleTimeString('th-TH') });
            loadParticipants();
        } catch (err) {
            cooldownRef.current.delete(bib);
            beep(false);
            pushEntry({ id: `${nowMs}-${bib}`, bib, name: runnerName(runner, language) || `BIB ${bib}`, status: 'error', message: t('บันทึกไม่สำเร็จ', 'Save failed') + (err instanceof Error && err.message ? ` — ${err.message}` : ''), time: new Date().toLocaleTimeString('th-TH') });
        }
    }, [beep, language, loadParticipants]);

    // ----- camera control -----
    const startScanning = useCallback(async () => {
        if (!eventId || !checkpoint) {
            setSettingsOpen(true);
            showToast(t('เลือกอีเวนต์และจุด Checkpoint ก่อน', 'Select event and checkpoint first'), 'error');
            return;
        }
        setScanning(true);
        try {
            const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
            const formatsToSupport = [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
            ];
            const scanner = new Html5Qrcode('qr-scan-region', { formatsToSupport, verbose: false }) as unknown as BarcodeScannerInstance;
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: (vw: number, vh: number) => ({ width: Math.min(vw - 20, 360), height: Math.min(vh - 40, 360) }) },
                (decodedText: string) => { void handleCode(decodedText); },
                () => {},
            );
        } catch (err) {
            console.error('Camera error:', err);
            showToast(t('เปิดกล้องไม่ได้ ตรวจสอบสิทธิ์การเข้าถึงกล้อง', 'Cannot open camera — check permission'), 'error');
            setScanning(false);
        }
    }, [eventId, checkpoint, handleCode]);

    const stopScanning = useCallback(async () => {
        const s = scannerRef.current;
        scannerRef.current = null;
        if (s) {
            try { await s.stop(); } catch { /* already stopped */ }
            try { s.clear(); } catch { /* ignore */ }
        }
        setScanning(false);
    }, []);

    useEffect(() => () => { void stopScanning(); }, [stopScanning]);

    const submitManual = (e: React.FormEvent) => {
        e.preventDefault();
        const bib = manualBib.trim();
        if (!bib) return;
        cooldownRef.current.delete(bib);
        void handleCode(bib);
        setManualBib('');
    };

    // ----- derived data -----
    const successCount = log.filter(e => e.status === 'success').length;
    const ready = !!eventId && !!checkpoint;

    const leaderboard = useMemo(() => {
        const sorted = [...participants].sort((a, b) => {
            const ra = a.overallRank ?? Number.MAX_SAFE_INTEGER;
            const rb = b.overallRank ?? Number.MAX_SAFE_INTEGER;
            if (ra !== rb) return ra - rb;
            return (a.bib || '').localeCompare(b.bib || '');
        });
        const q = search.trim().toLowerCase();
        if (!q) return sorted;
        return sorted.filter(p =>
            (p.bib || '').toLowerCase().includes(q) ||
            participantName(p, language).toLowerCase().includes(q),
        );
    }, [participants, search, language]);

    const stats = useMemo(() => {
        const total = participants.length;
        const finished = participants.filter(p => String(p.status || '').toLowerCase() === 'finished').length;
        const passed = participants.filter(p => (p.passedCount || 0) > 0 || !!p.latestCheckpoint).length;
        return { total, finished, passed, remaining: Math.max(total - finished, 0) };
    }, [participants]);

    const checkpointTitle = checkpoint || t('ยังไม่ได้เลือกจุด', 'No checkpoint');
    const eventName = events.find(e => e._id === eventId);

    // shared select styling
    const selectClass = 'w-full bg-[#0e0e13] border border-[#444933] rounded text-[#e4e1e9] px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-[#c3f400] font-[Manrope]';
    const labelClass = 'text-[12px] font-[JetBrains_Mono] font-semibold text-[#c4c9ac] uppercase tracking-wider mb-1.5 block';

    const statusBar: Record<ScanStatus, string> = {
        success: '#c3f400', duplicate: '#adc6ff', notfound: '#ffb4ab', error: '#ffb4ab',
    };
    const statusIcon: Record<ScanStatus, string> = {
        success: 'check_circle', duplicate: 'info', notfound: 'cancel', error: 'warning',
    };

    return (
        <div className="min-h-[100dvh] flex flex-col bg-[#131318] text-[#e4e1e9] font-[Manrope]">
            <style>{`
                .vps-symbol { font-family: 'Material Symbols Outlined'; font-weight: normal; font-style: normal; line-height: 1; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr; font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
                .vps-scan-line { height: 2px; background: linear-gradient(90deg, transparent, #c3f400, transparent); box-shadow: 0 0 15px #c3f400; position: absolute; left: 0; width: 100%; animation: vps-scan 2.6s infinite ease-in-out; }
                @keyframes vps-scan { 0%, 100% { top: 4%; } 50% { top: 92%; } }
                .vps-zebra:nth-child(even) { background-color: rgba(255,255,255,0.02); }
                .vps-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
                .vps-scroll::-webkit-scrollbar-track { background: #131318; }
                .vps-scroll::-webkit-scrollbar-thumb { background: #35343a; border-radius: 4px; }
                .vps-scroll::-webkit-scrollbar-thumb:hover { background: #444933; }
            `}</style>

            {/* ---------- Top app bar ---------- */}
            <header className="bg-[#131318] border-b border-[#444933] flex justify-between items-center w-full px-4 lg:px-6 h-14 z-40 shrink-0">
                <div className="flex items-center gap-3">
                    <Link href="/admin/live-monitor" className="text-[#e4e1e9] hover:bg-[#2a292f] p-2 rounded active:scale-95 transition" title={t('กลับแอดมิน', 'Back to admin')}>
                        <span className="vps-symbol text-[22px]">arrow_back</span>
                    </Link>
                    <div className="flex flex-col leading-tight">
                        <h1 className="font-[JetBrains_Mono] text-[18px] font-bold text-[#c3f400]">RaceControl</h1>
                        <span className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac] truncate max-w-[200px] sm:max-w-none">{checkpointTitle}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center bg-[#1b1b20] px-2.5 py-1 rounded-lg border border-[#444933]">
                        <span className={`w-2 h-2 rounded-full mr-2 ${scanning ? 'bg-[#c3f400] animate-pulse' : 'bg-[#8e9379]'}`} />
                        <span className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac]">{scanning ? t('กำลังสแกน', 'LIVE SCAN') : t('พร้อม', 'STANDBY')}</span>
                    </div>
                    <button onClick={() => setSoundOn(s => !s)} className="text-[#c4c9ac] hover:bg-[#2a292f] p-2 rounded active:scale-95 transition" title={t('เปิด/ปิดเสียง', 'Toggle sound')}>
                        <span className="vps-symbol text-[22px]">{soundOn ? 'volume_up' : 'volume_off'}</span>
                    </button>
                    <button onClick={() => setSettingsOpen(true)} className="text-[#c4c9ac] hover:bg-[#2a292f] p-2 rounded active:scale-95 transition" title={t('ตั้งค่า', 'Settings')}>
                        <span className="vps-symbol text-[22px]">settings</span>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* ---------- Desktop sidebar ---------- */}
                <aside className="hidden lg:flex flex-col h-full w-60 bg-[#1f1f24] border-r border-[#444933] py-6 shrink-0">
                    <div className="px-4 mb-8 flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-[#c3f400] flex items-center justify-center text-[#161e00]">
                            <span className="vps-symbol">sensors</span>
                        </div>
                        <div className="min-w-0">
                            <p className="font-[JetBrains_Mono] text-[14px] font-bold truncate">{checkpoint || t('สถานี', 'Station')}</p>
                            <p className="text-[13px] text-[#c4c9ac] truncate">{eventName ? eventLabel(eventName, language) : t('ยังไม่เลือกอีเวนต์', 'No event')}</p>
                        </div>
                    </div>
                    <nav className="flex-1 space-y-1 px-2">
                        <button onClick={() => setSettingsOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-[#c3f400] text-[#161e00] font-bold rounded-lg">
                            <span className="vps-symbol">qr_code_scanner</span>
                            <span>{t('สแกนเนอร์', 'Scanner')}</span>
                        </button>
                        <Link href="/admin/live-monitor" className="flex items-center gap-3 px-4 py-3 text-[#c4c9ac] hover:bg-[#35343a] rounded-lg transition">
                            <span className="vps-symbol">monitor_heart</span>
                            <span>{t('มอนิเตอร์สด', 'Live Monitor')}</span>
                        </Link>
                        <Link href="/admin/links" className="flex items-center gap-3 px-4 py-3 text-[#c4c9ac] hover:bg-[#35343a] rounded-lg transition">
                            <span className="vps-symbol">link</span>
                            <span>{t('ลิงก์แชร์', 'Share Links')}</span>
                        </Link>
                        <Link href="/admin/events" className="flex items-center gap-3 px-4 py-3 text-[#c4c9ac] hover:bg-[#35343a] rounded-lg transition">
                            <span className="vps-symbol">leaderboard</span>
                            <span>{t('กิจกรรม', 'Events')}</span>
                        </Link>
                    </nav>
                    <div className="px-4 mt-auto pt-6 border-t border-[#444933]">
                        <Link href="/admin" className="flex items-center gap-3 px-4 py-3 text-[#ffb4aa] hover:bg-[#35343a] rounded-lg transition">
                            <span className="vps-symbol">dashboard</span>
                            <span>{t('แดชบอร์ดแอดมิน', 'Admin Dashboard')}</span>
                        </Link>
                        <p className="text-[10px] text-center mt-2 text-[#c4c9ac] opacity-50 font-[JetBrains_Mono]">VELOCITY · RFID TIMING</p>
                    </div>
                </aside>

                {/* ---------- Main canvas ---------- */}
                <main className="flex-1 overflow-y-auto vps-scroll p-3 lg:p-6 bg-[#131318]">
                    {!campaign && (
                        <div className="mb-4 bg-[#2a292f] border border-[#444933] rounded-lg px-4 py-3 flex items-center gap-2.5 text-[#ffb4ab]">
                            <span className="vps-symbol">warning</span>
                            <span className="text-[14px]">{t('ยังไม่มีแคมเปญที่ปักดาว — ไปที่ /admin/events แล้วปักดาวก่อน', 'No starred campaign — star one in /admin/events first')}</span>
                        </div>
                    )}

                    <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full">
                        {/* ===== Left: Scanner + last scanned ===== */}
                        <div className={`lg:col-span-4 space-y-4 lg:space-y-6 ${mobileView === 'scanner' || mobileView === 'manual' ? '' : 'hidden lg:block'}`}>
                            {/* Scanner card */}
                            <div className="bg-[#1b1b20] rounded-lg border border-[#444933] overflow-hidden">
                                <div className="p-4 flex justify-between items-center border-b border-[#444933] bg-[#1f1f24]">
                                    <h2 className="font-[JetBrains_Mono] text-[18px] font-semibold flex items-center gap-2">
                                        <span className="vps-symbol text-[#c3f400]">qr_code_scanner</span>
                                        {t('สแกน QR', 'QR SCANNER')}
                                    </h2>
                                    <div className="flex items-center gap-2 text-[12px] font-[JetBrains_Mono] text-[#c4c9ac]">
                                        <span className="vps-symbol text-[16px]">bolt</span>{successCount}
                                    </div>
                                </div>

                                {/* viewfinder */}
                                <div className="relative aspect-square lg:aspect-video bg-black overflow-hidden flex items-center justify-center">
                                    <div id="qr-scan-region" className="absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
                                    {!scanning && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 text-center px-4">
                                            <span className="vps-symbol text-[#444933] text-[64px]">center_focus_strong</span>
                                            <button
                                                onClick={startScanning}
                                                className={`px-6 py-3 rounded font-[JetBrains_Mono] font-semibold text-[14px] transition active:scale-95 ${ready ? 'bg-[#c3f400] text-[#161e00] hover:brightness-110' : 'bg-[#2a292f] text-[#c4c9ac]'}`}
                                            >
                                                {ready ? t('เริ่มสแกน', 'START SCAN') : t('ตั้งค่าจุดสแกนก่อน', 'CONFIGURE FIRST')}
                                            </button>
                                        </div>
                                    )}
                                    {scanning && (
                                        <>
                                            <div className="pointer-events-none absolute z-10 w-3/4 h-3/4 max-w-[280px] max-h-[280px] border-2 border-[#c3f400]/60 rounded-xl">
                                                <div className="vps-scan-line" />
                                                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#c3f400] rounded-tl" />
                                                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#c3f400] rounded-tr" />
                                                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#c3f400] rounded-bl" />
                                                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#c3f400] rounded-br" />
                                            </div>
                                            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-[12px] font-[JetBrains_Mono] text-[#c4c9ac] whitespace-nowrap">
                                                {t('ส่องป้าย BIB ของนักวิ่ง', 'Align BIB code in frame')}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* manual entry + controls */}
                                <div className="p-4 bg-[#2a292f] space-y-3">
                                    <div>
                                        <label className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac] mb-1 block uppercase tracking-wide">{t('กรอก BIB เอง', 'Manual BIB Entry')}</label>
                                        <form onSubmit={submitManual} className="relative">
                                            <input
                                                value={manualBib}
                                                onChange={e => setManualBib(e.target.value)}
                                                placeholder="####"
                                                inputMode="numeric"
                                                disabled={!ready}
                                                className="w-full bg-[#0e0e13] border border-[#8e9379] px-4 py-3 text-[24px] font-[JetBrains_Mono] font-bold rounded focus:ring-2 focus:ring-[#c3f400] focus:border-transparent outline-none text-[#c3f400] placeholder:opacity-30 disabled:opacity-50"
                                            />
                                            <button type="submit" disabled={!ready || !manualBib.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#c3f400] text-[#161e00] px-4 py-1.5 rounded font-[JetBrains_Mono] font-semibold text-[14px] hover:brightness-110 active:scale-95 transition disabled:opacity-40">
                                                {t('บันทึก', 'LOG')}
                                            </button>
                                        </form>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {!scanning ? (
                                            <button onClick={startScanning} disabled={!ready} className="flex items-center justify-center gap-2 bg-[#1f1f24] border border-[#444933] py-3 rounded hover:bg-[#35343a] transition font-[JetBrains_Mono] text-[14px] active:scale-95 disabled:opacity-40">
                                                <span className="vps-symbol text-[18px]">photo_camera</span>{t('เปิดกล้อง', 'CAMERA')}
                                            </button>
                                        ) : (
                                            <button onClick={stopScanning} className="flex items-center justify-center gap-2 bg-[#93000a] border border-[#ffb4ab]/40 text-[#ffdad6] py-3 rounded hover:brightness-110 transition font-[JetBrains_Mono] text-[14px] active:scale-95">
                                                <span className="vps-symbol text-[18px]">stop</span>{t('หยุด', 'STOP')}
                                            </button>
                                        )}
                                        <button onClick={() => setSettingsOpen(true)} className="flex items-center justify-center gap-2 bg-[#1f1f24] border border-[#444933] py-3 rounded hover:bg-[#35343a] transition font-[JetBrains_Mono] text-[14px] active:scale-95">
                                            <span className="vps-symbol text-[18px]">tune</span>{t('ตั้งค่า', 'CONFIG')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Last scanned card */}
                            {last && (
                                <div className="bg-[#1b1b20] rounded-lg border border-[#444933] p-4" style={{ borderLeft: `4px solid ${statusBar[last.status]}` }}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <span className="text-[12px] font-[JetBrains_Mono] uppercase tracking-widest" style={{ color: statusBar[last.status] }}>{last.message}</span>
                                            <h3 className="text-[24px] font-[JetBrains_Mono] font-bold">BIB {last.bib}</h3>
                                        </div>
                                        <span className="vps-symbol text-[32px]" style={{ color: statusBar[last.status] }}>{statusIcon[last.status]}</span>
                                    </div>
                                    <div className="space-y-1.5 text-[14px]">
                                        <div className="flex justify-between border-b border-[#444933]/40 pb-1">
                                            <span className="text-[#c4c9ac]">{t('นักวิ่ง', 'ATHLETE')}</span>
                                            <span className="font-semibold">{last.name || '—'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#444933]/40 pb-1">
                                            <span className="text-[#c4c9ac]">{t('จุด', 'CHECKPOINT')}</span>
                                            <span className="font-[JetBrains_Mono] text-[#c3f400]">{checkpoint}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#444933]/40 pb-1">
                                            <span className="text-[#c4c9ac]">{t('เวลา', 'TIME')}</span>
                                            <span className="font-[JetBrains_Mono]">{last.time}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ===== Right: Stats + live results ===== */}
                        <div className={`lg:col-span-8 flex flex-col gap-4 lg:gap-6 lg:h-full lg:overflow-hidden ${mobileView === 'results' || mobileView === 'history' ? '' : 'hidden lg:flex'}`}>
                            {/* Stats bar */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3 shrink-0">
                                {[
                                    { label: t('ผู้เข้าร่วม', 'PARTICIPANTS'), value: stats.total, color: '#e4e1e9' },
                                    { label: t('ผ่านแล้ว', 'PASSED'), value: stats.passed, color: '#c3f400' },
                                    { label: t('คงเหลือ', 'REMAINING'), value: stats.remaining, color: '#adc6ff' },
                                    { label: t('สแกนรอบนี้', 'THIS SESSION'), value: successCount, color: '#c3f400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-[#1b1b20] border border-[#444933] p-4 rounded-lg">
                                        <p className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac]">{s.label}</p>
                                        <p className="text-[24px] font-[JetBrains_Mono] font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Live results table */}
                            <div className="bg-[#1b1b20] border border-[#444933] rounded-lg flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                <div className="p-4 bg-[#1f1f24] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-[#444933]">
                                    <h3 className="font-[JetBrains_Mono] text-[16px] font-semibold uppercase tracking-tight flex items-center gap-2">
                                        <span className="vps-symbol text-[#c3f400] text-[18px]">leaderboard</span>
                                        {t('ผลสด', 'Live Results')}{checkpoint ? ` · ${checkpoint}` : ''}
                                    </h3>
                                    <div className="relative">
                                        <span className="vps-symbol absolute left-2 top-1/2 -translate-y-1/2 text-[#c4c9ac] text-[18px]">search</span>
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('ค้นหาชื่อ หรือ BIB', 'Search athlete or BIB...')} className="bg-[#0e0e13] border border-[#8e9379] pl-9 pr-3 py-1.5 text-[14px] rounded focus:ring-1 focus:ring-[#c3f400] outline-none w-full sm:w-64" />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto vps-scroll">
                                    {!eventId ? (
                                        <div className="p-10 text-center text-[#c4c9ac]">{t('เลือกอีเวนต์เพื่อดูผลสด', 'Select an event to see live results')}</div>
                                    ) : leaderboard.length === 0 ? (
                                        <div className="p-10 text-center text-[#c4c9ac]">{t('ยังไม่มีข้อมูลผู้เข้าร่วม', 'No participants yet')}</div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 bg-[#2a292f] z-10">
                                                <tr className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac] border-b border-[#444933]">
                                                    <th className="px-3 py-3 w-12 text-center">{t('อันดับ', 'RANK')}</th>
                                                    <th className="px-3 py-3">BIB</th>
                                                    <th className="px-3 py-3">{t('ชื่อนักวิ่ง', 'ATHLETE')}</th>
                                                    <th className="px-3 py-3 hidden sm:table-cell">{t('เพศ/รุ่น', 'GEN/CAT')}</th>
                                                    <th className="px-3 py-3 hidden md:table-cell">{t('จุดล่าสุด', 'LAST CP')}</th>
                                                    <th className="px-3 py-3">{t('เวลา', 'NET TIME')}</th>
                                                    <th className="px-3 py-3 text-right hidden sm:table-cell">{t('เพซ', 'PACE')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#444933]/30">
                                                {leaderboard.slice(0, 200).map(p => {
                                                    const isFinished = String(p.status || '').toLowerCase() === 'finished';
                                                    return (
                                                        <tr key={p._id || p.bib} className="vps-zebra hover:bg-[#35343a] transition-colors">
                                                            <td className="px-3 py-3 text-center font-[JetBrains_Mono] text-[16px]" style={{ color: (p.overallRank && p.overallRank <= 3) ? '#c3f400' : '#e4e1e9' }}>{p.overallRank ?? '—'}</td>
                                                            <td className="px-3 py-3 font-[JetBrains_Mono] font-bold">{p.bib || '—'}</td>
                                                            <td className="px-3 py-3">
                                                                <div className="font-semibold text-[#e4e1e9] leading-tight">{participantName(p, language)}</div>
                                                                {p.ageGroup && <div className="text-[11px] text-[#c4c9ac]">{p.ageGroup}</div>}
                                                            </td>
                                                            <td className="px-3 py-3 text-[14px] hidden sm:table-cell text-[#c4c9ac]">{[p.gender, p.category].filter(Boolean).join(' / ') || '—'}</td>
                                                            <td className="px-3 py-3 hidden md:table-cell">
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={isFinished ? { background: 'rgba(195,244,0,0.15)', color: '#c3f400' } : { background: '#35343a', color: '#c4c9ac' }}>{p.latestCheckpoint || t('ยังไม่ผ่าน', 'PENDING')}</span>
                                                            </td>
                                                            <td className="px-3 py-3 font-[JetBrains_Mono] text-[#e4e1e9]">{p.netTimeStr || p.gunTimeStr || '—'}</td>
                                                            <td className="px-3 py-3 text-right font-[JetBrains_Mono] text-[14px] text-[#adc6ff] hidden sm:table-cell">{p.netPace || p.gunPace || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                                <div className="bg-[#1b1b20] p-2 border-t border-[#444933] flex justify-between items-center px-4">
                                    <span className="text-[13px] text-[#c4c9ac]">{t('แสดง', 'Showing')} {Math.min(leaderboard.length, 200)} / {participants.length} {t('คน', 'participants')}</span>
                                    <span className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac]">{now.toLocaleTimeString('th-TH')}</span>
                                </div>
                            </div>

                            {/* Recent scans (this session) */}
                            <div className="bg-[#1b1b20] border border-[#444933] rounded-lg overflow-hidden shrink-0">
                                <div className="p-3 bg-[#1f1f24] border-b border-[#444933] flex items-center gap-2">
                                    <span className="vps-symbol text-[#c3f400] text-[18px]">history</span>
                                    <h3 className="font-[JetBrains_Mono] text-[14px] font-semibold uppercase tracking-tight">{t('สแกนล่าสุด', 'Recent Activity')} ({log.length})</h3>
                                </div>
                                {log.length === 0 ? (
                                    <div className="p-6 text-center text-[#c4c9ac] text-[14px]">{t('ยังไม่มีการสแกน', 'No scans yet')}</div>
                                ) : (
                                    <div className="max-h-64 overflow-auto vps-scroll">
                                        {log.map(e => (
                                            <div key={e.id} className="flex items-center justify-between p-3 border-l-4" style={{ borderColor: statusBar[e.status], background: 'rgba(255,255,255,0.01)' }}>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="vps-symbol text-[20px]" style={{ color: statusBar[e.status] }}>{statusIcon[e.status]}</span>
                                                    <span className="font-[JetBrains_Mono] text-[18px] font-bold text-[#c3f400]">{e.bib}</span>
                                                    <span className="text-[14px] text-[#e4e1e9] truncate">{e.name || <span className="text-[#c4c9ac]">{e.message}</span>}</span>
                                                </div>
                                                <span className="text-[12px] font-[JetBrains_Mono] text-[#c4c9ac] whitespace-nowrap">{e.time}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* ---------- Mobile bottom nav ---------- */}
            <nav className="lg:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center px-2 pb-2 pt-1 bg-[#1f1f24] border-t border-[#444933]">
                {([
                    { id: 'scanner', icon: 'qr_code_scanner', label: t('สแกน', 'Scanner') },
                    { id: 'manual', icon: 'keyboard', label: t('กรอกเอง', 'Manual') },
                    { id: 'history', icon: 'history', label: t('ประวัติ', 'History') },
                    { id: 'results', icon: 'leaderboard', label: t('ผลสด', 'Results') },
                ] as { id: MobileView; icon: string; label: string }[]).map(item => {
                    const active = mobileView === item.id;
                    return (
                        <button key={item.id} onClick={() => { setMobileView(item.id); if (item.id === 'manual') setTimeout(() => document.querySelector<HTMLInputElement>('#qr-scan-region')?.scrollIntoView(), 0); }}
                            className={`flex flex-col items-center justify-center rounded-full px-4 py-1 transition active:scale-90 ${active ? 'bg-[#c3f400] text-[#161e00]' : 'text-[#c4c9ac]'}`}>
                            <span className="vps-symbol" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
                            <span className="text-[12px] font-[JetBrains_Mono]">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <div className="lg:hidden h-16 shrink-0" />

            {/* ---------- Settings sheet / modal ---------- */}
            {settingsOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setSettingsOpen(false)}>
                    <div className="bg-[#2a292f] w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 flex flex-col gap-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="font-[JetBrains_Mono] text-[20px] font-bold">{t('ตั้งค่าจุดสแกน', 'Checkpoint Settings')}</h2>
                            <button onClick={() => setSettingsOpen(false)} className="text-[#c4c9ac] hover:text-[#e4e1e9]"><span className="vps-symbol">close</span></button>
                        </div>

                        <div>
                            <label className={labelClass}>{t('แคมเปญ (ปักดาว)', 'Campaign (starred)')}</label>
                            <div className="flex items-center gap-2 bg-[#0e0e13] border border-[#444933] rounded px-4 py-3 text-[14px] font-semibold" style={{ color: campaign ? '#e4e1e9' : '#8e9379' }}>
                                <span className="vps-symbol text-[#c3f400] text-[18px]">star</span>
                                {campaign ? ((language === 'th' ? campaign.nameTh : campaign.nameEn) || campaign.name) : t('ยังไม่ได้ปักดาวแคมเปญ', 'No starred campaign')}
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>{t('อีเวนต์', 'Event')}</label>
                            <div className="relative">
                                <select value={eventId} onChange={e => setEventId(e.target.value)} disabled={scanning || !campaignId} className={selectClass}>
                                    <option value="">{t('— เลือกอีเวนต์ —', '— Select event —')}</option>
                                    {events.map(ev => (
                                        <option key={ev._id} value={ev._id}>{eventLabel(ev, language)}{ev.status ? ` (${ev.status})` : ''}</option>
                                    ))}
                                </select>
                                <span className="vps-symbol absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#c4c9ac]">arrow_drop_down</span>
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>{t('จุด Checkpoint', 'Checkpoint')}</label>
                            <div className="flex flex-wrap gap-2">
                                {eventCheckpoints.length === 0 && <span className="text-[14px] text-[#8e9379]">{t('เลือกอีเวนต์ก่อน', 'Select an event first')}</span>}
                                {eventCheckpoints.map(c => {
                                    const active = checkpoint === c.name;
                                    return (
                                        <button key={c._id} disabled={scanning} onClick={() => setCheckpoint(c.name)}
                                            className={`px-4 py-2 rounded-full font-[JetBrains_Mono] text-[14px] transition disabled:opacity-50 ${active ? 'bg-[#c3f400] text-[#161e00] font-semibold' : 'border border-[#8e9379] text-[#e4e1e9] hover:bg-[#35343a]'}`}>
                                            {c.name}{typeof c.kmCumulative === 'number' ? ` · ${c.kmCumulative}km` : ''}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <button onClick={() => setSettingsOpen(false)} disabled={!ready}
                            className="w-full bg-[#c3f400] text-[#161e00] py-4 rounded-xl font-[JetBrains_Mono] font-semibold mt-1 active:scale-[0.98] transition disabled:opacity-40">
                            {ready ? t('บันทึก', 'SAVE CHANGES') : t('เลือกอีเวนต์และจุดให้ครบ', 'SELECT EVENT & CHECKPOINT')}
                        </button>
                    </div>
                </div>
            )}

            {/* ---------- Toast ---------- */}
            {toast && (
                <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-lg font-semibold shadow-2xl text-[#161e00]" style={{ background: toast.type === 'success' ? '#c3f400' : '#ffb4ab' }}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
