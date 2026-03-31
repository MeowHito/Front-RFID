'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';

interface Recording {
    _id: string;
    cameraId: string;
    cameraName: string;
    campaignId: string;
    checkpointName?: string;
    location?: string;
    deviceId?: string;
    startTime: string;
    endTime?: string;
    duration: number;
    fileSize: number;
    fileName: string;
    mimeType: string;
    recordingStatus: string;
}

interface StorageInfo { totalSize: number; count: number; }

function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
    return `${(b / 1073741824).toFixed(2)} GB`;
}

function fmtDuration(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function CctvRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [storage, setStorage] = useState<StorageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Player modal
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingName, setPlayingName] = useState('');
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Delete modal
    const [deleteTarget, setDeleteTarget] = useState<'one' | 'all' | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [recRes, storRes] = await Promise.all([
                fetch('/api/cctv-recordings', { cache: 'no-store', headers: authHeaders() }),
                fetch('/api/cctv-recordings/storage', { cache: 'no-store', headers: authHeaders() }),
            ]);
            const recData = await recRes.json();
            const storData = await storRes.json();
            setRecordings(Array.isArray(recData) ? recData : []);
            setStorage(storData);
        } catch { setRecordings([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(prev => prev.size === recordings.length ? new Set() : new Set(recordings.map(r => r._id)));
    };

    const openDelete = (id: string | null, kind: 'one' | 'all') => {
        setDeleteId(id);
        setDeleteTarget(kind);
        setConfirmText('');
    };

    const handleDelete = async () => {
        if (confirmText !== 'ยืนยัน') return;
        setDeleting(true);
        try {
            if (deleteTarget === 'all') {
                await fetch('/api/cctv-recordings', { method: 'DELETE', headers: authHeaders() });
                setSelected(new Set());
            } else if (deleteTarget === 'one' && deleteId) {
                await fetch(`/api/cctv-recordings/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
            }
            setDeleteTarget(null);
            setDeleteId(null);
            setConfirmText('');
            await load();
        } finally { setDeleting(false); }
    };

    const openPlayer = useCallback(async (rec: Recording) => {
        setPlayingId(rec._id);
        setPlayingName(`${rec.cameraName} — ${fmtDate(rec.startTime)}`);
        setVideoSrc(null);
        setVideoLoading(true);
        try {
            const res = await fetch(`/api/cctv-recordings/${rec._id}/stream`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                setVideoSrc(url);
            }
        } finally {
            setVideoLoading(false);
        }
    }, []);

    const closePlayer = () => {
        videoRef.current?.pause();
        if (videoSrc) URL.revokeObjectURL(videoSrc);
        setVideoSrc(null);
        setPlayingId(null);
    };

    const allSelected = recordings.length > 0 && selected.size === recordings.length;
    const STORAGE_LIMIT = 10 * 1073741824; // 10 GB display cap
    const storagePercent = storage ? Math.min((storage.totalSize / STORAGE_LIMIT) * 100, 100) : 0;

    return (
        <AdminLayout breadcrumbItems={[{ label: 'พื้นที่จัดเก็บวิดีโอ', labelEn: 'Video Storage' }]}>

            {/* ── Storage bar ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                        <h1 className="text-lg font-extrabold text-slate-900 m-0">
                            🗄️ {th ? 'พื้นที่จัดเก็บวิดีโอ CCTV' : 'CCTV Video Storage'}
                        </h1>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {th ? 'วิดีโอที่บันทึกจากการถ่ายทอดสด' : 'Recordings from live streams'}
                        </p>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                            {storage?.count ?? 0} {th ? 'ไฟล์' : 'files'}
                        </span>
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
                            {storage ? fmtBytes(storage.totalSize) : '—'}
                        </span>
                        <button
                            onClick={load}
                            className="text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            ↻ {th ? 'รีเฟรช' : 'Refresh'}
                        </button>
                    </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width: `${storagePercent}%`,
                            background: storagePercent > 80 ? '#ef4444' : storagePercent > 50 ? '#f59e0b' : '#22c55e',
                        }}
                    />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right">
                    {storage ? fmtBytes(storage.totalSize) : '0 B'} / 10 GB {th ? '(แสดงผล)' : '(display limit)'}
                </p>
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="w-4 h-4 accent-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-slate-700">
                            {allSelected ? (th ? 'ยกเลิกเลือกทั้งหมด' : 'Deselect All') : (th ? 'เลือกทั้งหมด' : 'Select All')}
                        </span>
                    </label>
                    {selected.size > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                            {selected.size} {th ? 'เลือกแล้ว' : 'selected'}
                        </span>
                    )}
                </div>
                {recordings.length > 0 && (
                    <button
                        onClick={() => openDelete(null, 'all')}
                        className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                        🗑️ {th ? 'ลบทั้งหมด' : 'Delete All'}
                    </button>
                )}
            </div>

            {/* ── Recording grid ── */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400 flex-col gap-3">
                    <div className="text-4xl">📹</div>
                    <div className="text-sm">{th ? 'กำลังโหลด...' : 'Loading...'}</div>
                </div>
            ) : recordings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
                    <div className="text-5xl mb-4">🎬</div>
                    <h3 className="text-base font-bold text-slate-700 mb-2">
                        {th ? 'ยังไม่มีวิดีโอ' : 'No recordings yet'}
                    </h3>
                    <p className="text-sm text-slate-400">
                        {th ? 'เริ่มถ่ายทอดสดจากหน้า /camera เพื่อบันทึกวิดีโออัตโนมัติ' : 'Start a live stream from /camera to record automatically'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {recordings.map(rec => {
                        const isSel = selected.has(rec._id);
                        return (
                            <div
                                key={rec._id}
                                className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${isSel ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {/* Thumbnail area */}
                                <div
                                    className="relative bg-slate-900 cursor-pointer group"
                                    style={{ aspectRatio: '16/9' }}
                                    onClick={() => openPlayer(rec)}
                                >
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                        <div className="text-4xl opacity-20">📹</div>
                                        <span className="text-xs text-slate-400 font-mono">{fmtDuration(rec.duration)}</span>
                                    </div>
                                    {/* Play overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                        <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                            <span className="text-slate-900 text-xl ml-0.5">▶</span>
                                        </div>
                                    </div>
                                    {/* Select checkbox */}
                                    <div className="absolute top-2 left-2" onClick={e => { e.stopPropagation(); toggleSelect(rec._id); }}>
                                        <input
                                            type="checkbox"
                                            checked={isSel}
                                            onChange={() => toggleSelect(rec._id)}
                                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                                        />
                                    </div>
                                    {/* File size badge */}
                                    <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {fmtBytes(rec.fileSize)}
                                    </div>
                                </div>

                                {/* Card body */}
                                <div className="p-3">
                                    <div className="font-bold text-sm text-slate-800 truncate">{rec.cameraName}</div>
                                    {rec.checkpointName && (
                                        <div className="text-xs text-orange-600 font-semibold mt-0.5 truncate">📍 {rec.checkpointName}</div>
                                    )}
                                    {rec.location && (
                                        <div className="text-xs text-slate-400 truncate">{rec.location}</div>
                                    )}
                                    <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                                        <span>🕐</span>
                                        <span>{fmtDate(rec.startTime)}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                        <button
                                            onClick={() => openPlayer(rec)}
                                            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                                        >
                                            ▶ {th ? 'เล่นวิดีโอ' : 'Play'}
                                        </button>
                                        <button
                                            onClick={() => openDelete(rec._id, 'one')}
                                            className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                                        >
                                            🗑️ {th ? 'ลบ' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Video Player Modal ── */}
            {playingId && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex flex-col"
                    onClick={closePlayer}
                >
                    <div
                        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-white font-bold text-sm truncate max-w-[80%]">{playingName}</div>
                        <button onClick={closePlayer} className="text-white text-2xl leading-none cursor-pointer bg-transparent border-none">✕</button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
                        {videoLoading && (
                            <div className="text-white text-sm animate-pulse">⏳ กำลังโหลดวิดีโอ...</div>
                        )}
                        {videoSrc && (
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                autoPlay
                                className="max-w-full max-h-full rounded-lg shadow-2xl"
                                style={{ maxHeight: 'calc(100vh - 80px)' }}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ── Delete Confirm Modal ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-5">
                            <div className="text-4xl mb-3">🗑️</div>
                            <h3 className="text-base font-extrabold text-slate-900 mb-1">
                                {deleteTarget === 'all'
                                    ? (th ? `ลบวิดีโอทั้งหมด ${recordings.length} ไฟล์` : `Delete all ${recordings.length} recordings?`)
                                    : (th ? 'ลบวิดีโอนี้?' : 'Delete this recording?')}
                            </h3>
                            <p className="text-xs text-slate-400">
                                {th ? 'การลบไม่สามารถย้อนกลับได้' : 'This action cannot be undone'}
                            </p>
                        </div>

                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                            {th ? 'พิมพ์ "ยืนยัน" เพื่อยืนยัน' : 'Type "ยืนยัน" to confirm'}
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder="ยืนยัน"
                            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-red-400 transition-colors mb-4"
                            autoFocus
                        />

                        <div className="flex gap-2.5">
                            <button
                                onClick={() => { setDeleteTarget(null); setConfirmText(''); }}
                                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                                {th ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={confirmText !== 'ยืนยัน' || deleting}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${confirmText === 'ยืนยัน' && !deleting ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                            >
                                {deleting ? (th ? 'กำลังลบ...' : 'Deleting...') : (th ? '🗑️ ลบ' : '🗑️ Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </AdminLayout>
    );
}
