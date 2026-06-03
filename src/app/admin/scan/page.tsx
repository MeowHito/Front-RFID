'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

// ---------------------------------------------------------------------------
// QR / Barcode timing scanner
// ---------------------------------------------------------------------------
// Station staff opens this page on a phone/tablet, picks Campaign → Event →
// Checkpoint once, then continuously scans runners' bib QR/barcodes. Each scan
// looks up the runner, posts a timing record to POST /timing/scan (the same
// endpoint RFID readers use) and gives instant audio + visual feedback.
//
// The QR/barcode is assumed to encode the plain BIB number.
// ---------------------------------------------------------------------------

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
}

interface RaceEvent {
    _id: string;
    name?: string;
    nameTh?: string;
    nameEn?: string;
    status?: string;
    eventDate?: string;
}

interface Checkpoint {
    _id: string;
    name: string;
    eventId?: string;
    kmCumulative?: number;
    order?: number;
}

interface Runner {
    _id?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    category?: string;
}

type ScanStatus = 'success' | 'duplicate' | 'notfound' | 'error';

interface ScanEntry {
    id: string;
    bib: string;
    name: string;
    status: ScanStatus;
    message: string;
    time: string;
}

// Minimal subset of the html5-qrcode instance we use.
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

// Ignore repeat decodes of the same bib within this window (the camera fires
// many times per second while a code stays in frame).
const SCAN_COOLDOWN_MS = 4000;

function runnerName(r: Runner | null, lang: string): string {
    if (!r) return '';
    if (lang === 'th') {
        const th = [r.firstNameTh, r.lastNameTh].filter(Boolean).join(' ').trim();
        if (th) return th;
    }
    const en = [r.firstNameEn || r.firstName, r.lastNameEn || r.lastName].filter(Boolean).join(' ').trim();
    return en || [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
}

function eventLabel(e: RaceEvent, lang: string): string {
    return (lang === 'th' ? e.nameTh : e.nameEn) || e.name || e.nameTh || e.nameEn || e._id;
}

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

    const scannerRef = useRef<BarcodeScannerInstance | null>(null);
    const cooldownRef = useRef<Map<string, number>>(new Map());
    const scannedThisSessionRef = useRef<Set<string>>(new Set());
    const audioCtxRef = useRef<AudioContext | null>(null);
    // Keep latest selection accessible inside the scanner callback closure.
    const ctxRef = useRef({ campaignId: '', eventId: '', checkpoint: '' });
    ctxRef.current = { campaignId, eventId, checkpoint };

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

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
    const eventCheckpoints = (() => {
        if (!eventId) return checkpoints;
        const scoped = checkpoints.filter(c => !c.eventId || c.eventId === eventId);
        const named = scoped.length ? scoped : checkpoints;
        // de-dupe by name, preserve order
        const seen = new Set<string>();
        return named.filter(c => {
            if (!c.name || seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        });
    })();

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
        } catch {
            /* audio not available — ignore */
        }
    }, [soundOn]);

    const pushEntry = (entry: ScanEntry) => {
        setLast(entry);
        setLog(prev => [entry, ...prev].slice(0, 50));
    };

    // ----- core: process a decoded code -----
    const handleCode = useCallback(async (raw: string) => {
        const { campaignId: cId, eventId: eId, checkpoint: cp } = ctxRef.current;
        if (!eId || !cp) return;

        // QR encodes the plain bib; be lenient with surrounding whitespace.
        const bib = (raw || '').trim();
        if (!bib) return;

        // Cooldown: ignore the same bib re-decoded within the window.
        const now = Date.now();
        const lastSeen = cooldownRef.current.get(bib) || 0;
        if (now - lastSeen < SCAN_COOLDOWN_MS) return;
        cooldownRef.current.set(bib, now);

        // Already recorded this bib at this checkpoint in this session → skip the
        // network round-trip to avoid duplicate timing records.
        const sessionKey = `${eId}::${cp}::${bib}`;
        if (scannedThisSessionRef.current.has(sessionKey)) {
            beep(false);
            pushEntry({
                id: `${now}-${bib}`,
                bib,
                name: '',
                status: 'duplicate',
                message: t('สแกนแล้วที่จุดนี้', 'Already scanned here'),
                time: new Date().toLocaleTimeString('th-TH'),
            });
            return;
        }

        // Lookup runner (for the name) — scoped to the campaign.
        let runner: Runner | null = null;
        try {
            const params = new URLSearchParams({ code: bib });
            if (cId) params.set('campaignId', cId);
            const res = await fetch(`/api/runners/lookup?${params.toString()}`);
            const data = await res.json();
            runner = (data?.runner as Runner) || null;
        } catch {
            runner = null;
        }

        if (!runner) {
            beep(false);
            pushEntry({
                id: `${now}-${bib}`,
                bib,
                name: '',
                status: 'notfound',
                message: t('ไม่พบนักวิ่ง BIB นี้', 'No runner for this BIB'),
                time: new Date().toLocaleTimeString('th-TH'),
            });
            return;
        }

        // Record the scan via the shared timing endpoint.
        try {
            const res = await fetch('/api/timing/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: eId,
                    bib,
                    checkpoint: cp,
                    scanTime: new Date().toISOString(),
                    note: 'qrcode',
                }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(errText || `HTTP ${res.status}`);
            }
            scannedThisSessionRef.current.add(sessionKey);
            beep(true);
            pushEntry({
                id: `${now}-${bib}`,
                bib,
                name: runnerName(runner, language) || `BIB ${bib}`,
                status: 'success',
                message: t('บันทึกเวลาแล้ว', 'Time recorded'),
                time: new Date().toLocaleTimeString('th-TH'),
            });
        } catch (err) {
            // Allow a retry after an error by clearing the cooldown for this bib.
            cooldownRef.current.delete(bib);
            beep(false);
            pushEntry({
                id: `${now}-${bib}`,
                bib,
                name: runnerName(runner, language) || `BIB ${bib}`,
                status: 'error',
                message: t('บันทึกไม่สำเร็จ', 'Save failed') + (err instanceof Error && err.message ? ` — ${err.message}` : ''),
                time: new Date().toLocaleTimeString('th-TH'),
            });
        }
    }, [beep, language]);

    // ----- camera control -----
    const startScanning = useCallback(async () => {
        if (!eventId || !checkpoint) {
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

    // Stop the camera on unmount.
    useEffect(() => () => { void stopScanning(); }, [stopScanning]);

    const submitManual = (e: React.FormEvent) => {
        e.preventDefault();
        const bib = manualBib.trim();
        if (!bib) return;
        // Manual entry bypasses the cooldown so staff can re-key intentionally.
        cooldownRef.current.delete(bib);
        void handleCode(bib);
        setManualBib('');
    };

    const successCount = log.filter(e => e.status === 'success').length;
    const ready = !!eventId && !!checkpoint;

    const statusColor: Record<ScanStatus, string> = {
        success: '#16a34a',
        duplicate: '#f59e0b',
        notfound: '#dc2626',
        error: '#dc2626',
    };
    const statusIcon: Record<ScanStatus, string> = {
        success: 'circle-check',
        duplicate: 'circle-exclamation',
        notfound: 'circle-xmark',
        error: 'triangle-exclamation',
    };

    return (
        <AdminLayout>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 12px 40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <i className="fa-solid fa-qrcode" style={{ fontSize: 24, color: '#2563eb' }} />
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                        {t('สแกน QR / บาร์โค้ด จับเวลา', 'QR / Barcode Timing Scan')}
                    </h1>
                </div>

                {/* ---- setup ---- */}
                <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr' }}>
                        <div>
                            <span style={labelStyle}>{t('แคมเปญ (ที่ปักดาวไว้)', 'Campaign (starred)')}</span>
                            <div style={{ ...selectStyle, display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', color: campaign ? '#111827' : '#9ca3af', fontWeight: 700 }}>
                                <i className="fa-solid fa-star" style={{ color: '#f59e0b' }} />
                                {campaign ? ((language === 'th' ? campaign.nameTh : campaign.nameEn) || campaign.name) : t('ยังไม่ได้ปักดาวแคมเปญ', 'No starred campaign')}
                            </div>
                        </div>

                        <label style={{ display: 'block' }}>
                            <span style={labelStyle}>{t('อีเวนต์', 'Event')}</span>
                            <select value={eventId} onChange={e => setEventId(e.target.value)} disabled={scanning || !campaignId} style={selectStyle}>
                                <option value="">{t('— เลือกอีเวนต์ —', '— Select event —')}</option>
                                {events.map(ev => (
                                    <option key={ev._id} value={ev._id}>{eventLabel(ev, language)}{ev.status ? ` (${ev.status})` : ''}</option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: 'block' }}>
                            <span style={labelStyle}>{t('จุด Checkpoint', 'Checkpoint')}</span>
                            <select value={checkpoint} onChange={e => setCheckpoint(e.target.value)} disabled={scanning || !eventId} style={selectStyle}>
                                <option value="">{t('— เลือกจุด —', '— Select checkpoint —')}</option>
                                {eventCheckpoints.map(c => (
                                    <option key={c._id} value={c.name}>{c.name}{typeof c.kmCumulative === 'number' ? ` — ${c.kmCumulative} km` : ''}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        {!scanning ? (
                            <button onClick={startScanning} disabled={!ready} style={{ ...primaryBtn, opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}>
                                <i className="fa-solid fa-camera" style={{ marginRight: 8 }} />
                                {t('เริ่มสแกน', 'Start scanning')}
                            </button>
                        ) : (
                            <button onClick={stopScanning} style={{ ...primaryBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                                <i className="fa-solid fa-stop" style={{ marginRight: 8 }} />
                                {t('หยุดสแกน', 'Stop')}
                            </button>
                        )}
                        <button onClick={() => setSoundOn(s => !s)} style={toggleBtn} title={t('เปิด/ปิดเสียง', 'Toggle sound')}>
                            <i className={`fa-solid ${soundOn ? 'fa-volume-high' : 'fa-volume-xmark'}`} style={{ marginRight: 6 }} />
                            {soundOn ? t('เสียงเปิด', 'Sound on') : t('เสียงปิด', 'Sound off')}
                        </button>
                        <div style={{ marginLeft: 'auto', fontWeight: 800, color: '#16a34a' }}>
                            <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                            {successCount} {t('ครั้ง', 'scans')}
                        </div>
                    </div>
                </div>

                {/* ---- camera + last result ---- */}
                {scanning && (
                    <div style={{ background: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 16, position: 'relative' }}>
                        <div id="qr-scan-region" style={{ width: '100%' }} />
                        <div style={{ position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center', color: '#fff', fontWeight: 700, textShadow: '0 1px 4px #000', pointerEvents: 'none' }}>
                            {checkpoint} · {t('ส่องป้าย BIB ของนักวิ่ง', 'Aim at runner BIB code')}
                        </div>
                    </div>
                )}

                {/* big last-scan card */}
                {last && (
                    <div style={{ background: '#fff', borderLeft: `8px solid ${statusColor[last.status]}`, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <i className={`fa-solid fa-${statusIcon[last.status]}`} style={{ fontSize: 34, color: statusColor[last.status] }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>
                                BIB {last.bib}{last.name ? <span style={{ fontSize: 18, fontWeight: 700, color: '#374151', marginLeft: 10 }}>{last.name}</span> : null}
                            </div>
                            <div style={{ color: statusColor[last.status], fontWeight: 700, marginTop: 2 }}>{last.message}</div>
                        </div>
                        <div style={{ color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{last.time}</div>
                    </div>
                )}

                {/* manual fallback */}
                <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input
                        value={manualBib}
                        onChange={e => setManualBib(e.target.value)}
                        placeholder={t('พิมพ์เลข BIB เอง (สำรอง)', 'Type BIB manually (fallback)')}
                        inputMode="numeric"
                        disabled={!ready}
                        style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 16 }}
                    />
                    <button type="submit" disabled={!ready || !manualBib.trim()} style={{ ...toggleBtn, padding: '0 18px', opacity: ready && manualBib.trim() ? 1 : 0.5 }}>
                        {t('บันทึก', 'Record')}
                    </button>
                </form>

                {/* recent log */}
                <div style={{ background: '#fff', borderRadius: 14, padding: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                    <div style={{ padding: '8px 10px', fontWeight: 800, color: '#374151' }}>
                        {t('รายการล่าสุด', 'Recent scans')} ({log.length})
                    </div>
                    {log.length === 0 ? (
                        <div style={{ padding: '18px 10px', color: '#9ca3af', textAlign: 'center' }}>
                            {t('ยังไม่มีการสแกน', 'No scans yet')}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {log.map(e => (
                                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderTop: '1px solid #f3f4f6' }}>
                                    <i className={`fa-solid fa-${statusIcon[e.status]}`} style={{ color: statusColor[e.status], width: 18 }} />
                                    <div style={{ fontWeight: 800, minWidth: 70 }}>BIB {e.bib}</div>
                                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>
                                        {e.name || <span style={{ color: '#9ca3af' }}>{e.message}</span>}
                                    </div>
                                    <div style={{ color: '#9ca3af', fontWeight: 600, fontSize: 13 }}>{e.time}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 700, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
                    {toast.msg}
                </div>
            )}
        </AdminLayout>
    );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 16, background: '#fff' };
const primaryBtn: React.CSSProperties = { padding: '13px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' };
const toggleBtn: React.CSSProperties = { padding: '13px 16px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
