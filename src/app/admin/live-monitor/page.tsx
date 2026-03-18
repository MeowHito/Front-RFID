'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; categories?: RaceCategory[]; }

interface TimingRecord {
    _id: string; bib: string; checkpoint: string; scanTime: string;
    rfidTag?: string; splitTime?: number; elapsedTime?: number; order?: number;
    runnerId: string;
}

interface StatusCount { _id: string; count: number; }

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(dateStr).toLocaleString('th-TH');
}

const STATUS_CONFIG: Record<string, { th: string; en: string; twBg: string; twBorder: string; twText: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', twBg: 'bg-slate-50', twBorder: 'border-slate-200', twText: 'text-slate-400' },
    in_progress: { th: 'กำลังวิ่ง', en: 'Running', twBg: 'bg-amber-50', twBorder: 'border-amber-200', twText: 'text-amber-500' },
    finished: { th: 'เข้าเส้นชัย', en: 'Finished', twBg: 'bg-green-50', twBorder: 'border-green-200', twText: 'text-green-500' },
    dnf: { th: 'ไม่จบ', en: 'DNF', twBg: 'bg-red-50', twBorder: 'border-red-200', twText: 'text-red-500' },
    dns: { th: 'ไม่เริ่ม', en: 'DNS', twBg: 'bg-gray-50', twBorder: 'border-gray-200', twText: 'text-gray-500' },
};

export default function LiveMonitorPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [recentScans, setRecentScans] = useState<TimingRecord[]>([]);
    const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
    const [scanning, setScanning] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [runnerMap, setRunnerMap] = useState<Record<string, any>>({});

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    const fetchData = useCallback(async () => {
        if (!campaign?._id) return;
        setScanning(true);
        try {
            const timingRes = await fetch(`/api/timing/event/${campaign._id}`, { cache: 'no-store' });
            if (timingRes.ok) {
                const records = await timingRes.json();
                setRecentScans(records.slice(0, 50));
                const runnerIds = [...new Set(records.map((r: TimingRecord) => r.runnerId).filter(Boolean))];
                const newMap: Record<string, any> = { ...runnerMap };
                for (const rid of runnerIds) {
                    if (!newMap[rid as string]) {
                        try {
                            const rRes = await fetch(`/api/runners/${rid}`, { cache: 'no-store' });
                            if (rRes.ok) newMap[rid as string] = await rRes.json();
                        } catch { /* skip */ }
                    }
                }
                setRunnerMap(newMap);
            }
            const statusRes = await fetch(`/api/runners/status/${campaign._id}`, { cache: 'no-store' });
            if (statusRes.ok) {
                const data = await statusRes.json();
                setStatusCounts(Array.isArray(data) ? data : []);
            }
        } catch { /* ignore */ }
        finally {
            setScanning(false);
            setLastRefresh(new Date());
        }
    }, [campaign, runnerMap]);

    useEffect(() => { if (campaign?._id) fetchData(); }, [campaign?._id]);

    useEffect(() => {
        if (autoRefresh && campaign?._id) {
            intervalRef.current = setInterval(fetchData, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, campaign?._id, fetchData]);

    const totalRunners = statusCounts.reduce((s, x) => s + x.count, 0);
    const getCount = (st: string) => statusCounts.find(x => x._id === st)?.count || 0;

    const filteredScans = selectedCategory === 'all'
        ? recentScans
        : recentScans.filter(sc => {
            const runner = runnerMap[sc.runnerId];
            return runner?.category === selectedCategory;
        });

    return (
        <AdminLayout breadcrumbItems={[{ label: 'Live Monitor', labelEn: 'Live Monitor' }]}>
            {loading ? (
                <div className="content-box p-8 text-center text-gray-400">
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box p-6">
                    <p className="text-gray-500 text-sm">
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* Status Cards */}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(135px,1fr))] gap-2.5 mb-4">
                        <div className="px-3.5 py-4 rounded-xl bg-sky-50 border-2 border-sky-200/30">
                            <div className="text-2xl font-extrabold text-sky-600">{totalRunners}</div>
                            <div className="text-[11px] text-gray-500 font-semibold">{language === 'th' ? '👥 ทั้งหมด' : '👥 Total'}</div>
                        </div>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <div key={key} className={`px-3.5 py-4 rounded-xl ${cfg.twBg} border-2 ${cfg.twBorder}`}>
                                <div className={`text-2xl font-extrabold ${cfg.twText}`}>{getCount(key)}</div>
                                <div className="text-[11px] text-gray-500 font-semibold">{language === 'th' ? cfg.th : cfg.en}</div>
                            </div>
                        ))}
                    </div>

                    {/* Progress Bar */}
                    {totalRunners > 0 && (
                        <div className="mb-4 rounded-xl overflow-hidden bg-gray-200 h-5 relative">
                            <div className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-1000 absolute left-0"
                                style={{ width: `${(getCount('finished') / totalRunners) * 100}%` }} />
                            <div className="h-full bg-amber-500/40 absolute left-0"
                                style={{ width: `${((getCount('finished') + getCount('in_progress')) / totalRunners) * 100}%` }} />
                            <div className="absolute w-full text-center leading-5 text-[11px] font-bold text-gray-700 z-10">
                                {Math.round((getCount('finished') / totalRunners) * 100)}% {language === 'th' ? 'เข้าเส้นชัย' : 'finished'}
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="content-box px-4 py-2.5 mb-4">
                        <div className="flex gap-2.5 items-center flex-wrap">
                            <select className="form-input w-44 text-[13px] px-2.5 py-1.5" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                                <option value="all">{language === 'th' ? 'ทุกระยะ' : 'All categories'}</option>
                                {(campaign.categories || []).map((cat, i) => (
                                    <option key={`${cat.name}-${i}`} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>
                            <button onClick={fetchData} disabled={scanning}
                                className="px-3.5 py-1.5 rounded-md border border-sky-600 bg-white text-sky-600 font-semibold text-xs cursor-pointer disabled:cursor-not-allowed flex items-center gap-1">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={scanning ? 'animate-spin' : ''}>
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                                </svg>
                                {scanning ? '...' : (language === 'th' ? 'รีเฟรช' : 'Refresh')}
                            </button>
                            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                                    className="accent-green-500" />
                                {language === 'th' ? 'รีเฟรชอัตโนมัติ (10 วินาที)' : 'Auto-refresh (10s)'}
                            </label>
                            <span className="ml-auto text-[11px] text-gray-400">
                                {language === 'th' ? 'อัพเดตล่าสุด:' : 'Last update:'} {lastRefresh.toLocaleTimeString('th-TH')}
                            </span>
                        </div>
                    </div>

                    {/* Recent Scans Feed */}
                    <div className="content-box p-0">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full inline-block ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="font-bold text-sm">
                                {language === 'th' ? 'การสแกนล่าสุด' : 'Recent Scans'}
                            </span>
                            <span className="text-[11px] text-gray-400 ml-1">({filteredScans.length})</span>
                        </div>

                        {filteredScans.length === 0 ? (
                            <div className="p-10 text-center">
                                <div className="text-5xl mb-2">📡</div>
                                <p className="text-gray-400 text-sm">
                                    {language === 'th' ? 'ยังไม่มีการสแกน' : 'No scans recorded yet'}
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-[500px] overflow-y-auto">
                                {filteredScans.map((scan, i) => {
                                    const runner = runnerMap[scan.runnerId];
                                    const isFinish = scan.checkpoint?.toUpperCase() === 'FINISH';
                                    const isStart = scan.checkpoint?.toUpperCase() === 'START';
                                    return (
                                        <div key={scan._id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 transition-colors ${i === 0 ? 'bg-yellow-50' : ''}`}>
                                            <div className={`px-2.5 py-1 rounded-md text-[11px] font-bold min-w-[60px] text-center ${
                                                isFinish ? 'bg-green-100 text-green-600' : isStart ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {scan.checkpoint}
                                            </div>
                                            <div className="font-extrabold text-base text-sky-600 min-w-[60px] text-center">
                                                {scan.bib}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-[13px]">
                                                    {runner ? `${runner.firstName || ''} ${runner.lastName || ''}`.trim() : scan.bib}
                                                </div>
                                                <div className="text-[11px] text-gray-400">
                                                    {runner?.category || ''} {runner?.gender || ''}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[13px] font-mono font-semibold text-gray-700">
                                                    {formatTime(scan.elapsedTime)}
                                                </div>
                                                <div className="text-[11px] text-gray-400">
                                                    {timeAgo(scan.scanTime)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* AI MC Panel */}
                    <AiMcPanel campaign={campaign} runnerMap={runnerMap} language={language} />
                </>
            )}
        </AdminLayout>
    );
}

/* ==================== AI MC Panel ==================== */

const MC_STYLES = [
    { key: 'fun', label: 'เชียร์สนุก', labelEn: 'Fun' },
    { key: 'formal', label: 'ทางการ', labelEn: 'Formal' },
    { key: 'sport', label: 'สปอร์ต', labelEn: 'Sport' },
    { key: 'regional_isan', label: 'อีสาน', labelEn: 'Isan' },
    { key: 'regional_south', label: 'ใต้', labelEn: 'Southern' },
    { key: 'regional_north', label: 'เหนือ', labelEn: 'Northern' },
];

const QUICK_TESTS = [
    { label: '🇹🇭 ทดสอบไทย', text: 'สวัสดีครับ ยินดีต้อนรับสู่งานวิ่งมาราธอน ขอให้ทุกท่านสนุกกับการแข่งขันครับ' },
    { label: '🏃 เชียร์', text: 'มาแล้วครับ นักกีฬาหมายเลข 1 กำลังวิ่งเข้าเส้นชัย สู้ๆ ครับ เก่งมาก!' },
    { label: '🇬🇧 English', text: 'Welcome to the marathon! Runner number one is approaching the finish line!' },
    { label: '🌾 อีสาน', text: 'มาแล้วเด้อ นักกีฬาหมายเลข 1 สู้ให้เบิดแฮง เก่งหลายเด้อ!' },
];

function AiMcPanel({ campaign, runnerMap, language }: { campaign: Campaign; runnerMap: Record<string, any>; language: string }) {
    const [collapsed, setCollapsed] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoiceIdx, setSelectedVoiceIdx] = useState(0);
    const [rate, setRate] = useState(1.0);
    const [pitch, setPitch] = useState(1.0);
    const [volume, setVolume] = useState(1.0);
    const [mcStyle, setMcStyle] = useState('fun');
    const [testBib, setTestBib] = useState('');
    const [generatedText, setGeneratedText] = useState('');
    const [generating, setGenerating] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [error, setError] = useState('');
    const [customText, setCustomText] = useState('');

    useEffect(() => {
        function loadVoices() {
            const v = window.speechSynthesis.getVoices();
            if (v.length > 0) {
                setVoices(v);
                const thaiIdx = v.findIndex(voice => voice.lang.startsWith('th'));
                if (thaiIdx >= 0) setSelectedVoiceIdx(thaiIdx);
            }
        }
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    const speak = useCallback((text: string) => {
        if (!text) return;
        // Cancel previous speech first
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        // Use requestAnimationFrame + setTimeout to ensure clean state
        requestAnimationFrame(() => {
            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(text);
                if (voices[selectedVoiceIdx]) utterance.voice = voices[selectedVoiceIdx];
                utterance.rate = rate;
                utterance.pitch = pitch;
                utterance.volume = volume;
                utterance.lang = voices[selectedVoiceIdx]?.lang || 'th-TH';
                utterance.onstart = () => setSpeaking(true);
                utterance.onend = () => setSpeaking(false);
                utterance.onerror = (e) => {
                    // Ignore 'interrupted' and 'canceled' errors — these are normal when cancel() is called
                    if (e.error === 'interrupted' || e.error === 'canceled') return;
                    console.warn('TTS error:', e.error);
                    setSpeaking(false);
                };
                window.speechSynthesis.speak(utterance);
            }, 150);
        });
    }, [voices, selectedVoiceIdx, rate, pitch, volume]);

    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
        setSpeaking(false);
    };

    const generateAndSpeak = useCallback(async () => {
        setError('');
        setGenerating(true);
        try {
            let runnerInfo: any = {};
            if (testBib.trim()) {
                const found = Object.values(runnerMap).find((r: any) => r.bib === testBib.trim());
                if (found) {
                    runnerInfo = found;
                } else {
                    try {
                        const params = new URLSearchParams({ campaignId: campaign._id, code: testBib.trim() });
                        const res = await fetch(`/api/runners/lookup?${params.toString()}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.runner) runnerInfo = data.runner;
                        }
                    } catch { /* skip */ }
                }
            }

            const payload = {
                runnerName: `${runnerInfo.firstName || ''} ${runnerInfo.lastName || ''}`.trim() || testBib.trim() || 'นักกีฬา',
                runnerNameTh: `${runnerInfo.firstNameTh || ''} ${runnerInfo.lastNameTh || ''}`.trim() || undefined,
                bib: runnerInfo.bib || testBib.trim() || '000',
                category: runnerInfo.category || '',
                gender: runnerInfo.gender || '',
                nationality: runnerInfo.nationality || 'THA',
                ageGroup: runnerInfo.ageGroup || '',
                team: runnerInfo.team || runnerInfo.teamName || '',
                style: mcStyle,
            };

            const res = await fetch('/api/ai-mc/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData?.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const txt = data.text || '';
            setGeneratedText(txt);
            if (txt) speak(txt);
        } catch (err: any) {
            setError(err?.message || 'Error generating text');
        } finally {
            setGenerating(false);
        }
    }, [testBib, runnerMap, campaign, mcStyle, speak]);

    const speakCustom = () => { if (customText.trim()) speak(customText.trim()); };

    const voiceLabel = (v: SpeechSynthesisVoice) => {
        const flag = v.lang.startsWith('th') ? '🇹🇭' : v.lang.startsWith('en') ? '🇬🇧' : '🌐';
        return `${flag} ${v.name} (${v.lang})`;
    };

    return (
        <div className="content-box mt-4 overflow-hidden">
            {/* Header */}
            <div onClick={() => setCollapsed(c => !c)}
                className="px-4 py-3.5 cursor-pointer flex items-center justify-between bg-gradient-to-r from-violet-500/5 to-purple-500/5 select-none border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                    <span className="text-[22px]">🎙️</span>
                    <span className="font-extrabold text-[15px] text-slate-800">
                        {language === 'th' ? 'AI MC (พิธีกร AI)' : 'AI MC (AI Announcer)'}
                    </span>
                    {speaking && (
                        <span className="text-[11px] font-bold text-violet-600 bg-violet-50 px-2.5 py-0.5 rounded-full animate-pulse">
                            🔊 {language === 'th' ? 'กำลังพูด...' : 'Speaking...'}
                        </span>
                    )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5"
                    className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {!collapsed && (
                <div className="p-4 space-y-4">
                    {/* Quick Tests */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200">
                        <div className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-1.5">
                            🔊 {language === 'th' ? 'ทดสอบเสียง — กดเลยได้ยินเลย!' : 'Quick Voice Test — Click to hear!'}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {QUICK_TESTS.map((t, i) => (
                                <button key={i} onClick={() => speak(t.text)} disabled={speaking}
                                    className="px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm transition-all">
                                    {t.label}
                                </button>
                            ))}
                            {speaking && (
                                <button onClick={stopSpeaking}
                                    className="px-3.5 py-2 rounded-lg border-2 border-red-400 bg-red-50 text-red-600 font-bold text-[13px] cursor-pointer">
                                    ⏹️ {language === 'th' ? 'หยุด' : 'Stop'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Voice + Sliders */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 mb-1 block">
                                🗣️ {language === 'th' ? 'เสียงพูด' : 'Voice'}
                            </label>
                            <select value={selectedVoiceIdx} onChange={e => setSelectedVoiceIdx(Number(e.target.value))}
                                className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs outline-none focus:border-violet-400">
                                {voices.map((v, i) => (
                                    <option key={i} value={i}>{voiceLabel(v)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                                    ⏩ {language === 'th' ? 'เร็ว' : 'Speed'} ({rate.toFixed(1)})
                                </label>
                                <input type="range" min="0.5" max="2" step="0.1" value={rate}
                                    onChange={e => setRate(Number(e.target.value))}
                                    className="w-full accent-violet-600" />
                            </div>
                            <div className="flex-1">
                                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                                    🎵 {language === 'th' ? 'เสียง' : 'Pitch'} ({pitch.toFixed(1)})
                                </label>
                                <input type="range" min="0.5" max="2" step="0.1" value={pitch}
                                    onChange={e => setPitch(Number(e.target.value))}
                                    className="w-full accent-violet-600" />
                            </div>
                            <div className="flex-1">
                                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                                    🔊 {language === 'th' ? 'ดัง' : 'Vol'} ({Math.round(volume * 100)}%)
                                </label>
                                <input type="range" min="0" max="1" step="0.1" value={volume}
                                    onChange={e => setVolume(Number(e.target.value))}
                                    className="w-full accent-violet-600" />
                            </div>
                        </div>
                    </div>

                    {/* MC Style */}
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1.5 block">
                            {language === 'th' ? '🎭 สไตล์ MC' : '🎭 MC Style'}
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                            {MC_STYLES.map(s => (
                                <button key={s.key} onClick={() => setMcStyle(s.key)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                        mcStyle === s.key
                                            ? 'bg-violet-600 text-white border-2 border-violet-600 shadow-md shadow-violet-300/40'
                                            : 'bg-white text-slate-600 border border-gray-200 hover:border-violet-300'
                                    }`}>
                                    {language === 'th' ? s.label : s.labelEn}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* BIB + Generate */}
                    <div className="flex gap-2.5 items-end p-3.5 rounded-xl bg-violet-50 border border-violet-200">
                        <div>
                            <label className="text-[11px] font-bold text-violet-800 mb-1 block">
                                BIB {language === 'th' ? 'หรือชื่อ' : 'or Name'}
                            </label>
                            <input type="text" value={testBib}
                                onChange={e => setTestBib(e.target.value)}
                                placeholder="e.g. 001"
                                onKeyDown={e => { if (e.key === 'Enter') generateAndSpeak(); }}
                                className="w-[140px] px-3 py-2 rounded-lg border-2 border-violet-500 text-base font-extrabold text-center font-mono outline-none focus:border-violet-600"
                            />
                        </div>
                        <button onClick={generateAndSpeak} disabled={generating}
                            className={`px-6 py-2.5 rounded-lg text-white font-extrabold text-sm flex items-center gap-2 transition-all ${
                                generating
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-violet-600 to-purple-500 shadow-lg shadow-violet-400/30 hover:shadow-xl cursor-pointer'
                            }`}>
                            {generating ? (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                                </svg> {language === 'th' ? 'กำลังสร้าง...' : 'Generating...'}</>
                            ) : (
                                <>🎙️ {language === 'th' ? 'สร้าง & พูด' : 'Generate & Speak'}</>
                            )}
                        </button>
                        {speaking && (
                            <button onClick={stopSpeaking}
                                className="px-4 py-2.5 rounded-lg border-2 border-red-400 bg-red-50 text-red-600 font-bold text-[13px] cursor-pointer">
                                ⏹️ {language === 'th' ? 'หยุด' : 'Stop'}
                            </button>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="px-3.5 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
                            ❌ {error}
                        </div>
                    )}

                    {/* Generated Text */}
                    {generatedText && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-300">
                            <div className="text-[11px] font-bold text-violet-600 mb-2 uppercase tracking-wider">
                                {language === 'th' ? '💬 ข้อความที่สร้าง' : '💬 Generated Text'}
                            </div>
                            <div className="text-base font-semibold text-slate-800 leading-relaxed">
                                {generatedText}
                            </div>
                            <div className="mt-3 flex gap-1.5">
                                <button onClick={() => speak(generatedText)} disabled={speaking}
                                    className="px-3.5 py-1 rounded-lg border border-violet-500 bg-white text-violet-600 text-[11px] font-bold disabled:cursor-not-allowed hover:bg-violet-50">
                                    🔁 {language === 'th' ? 'พูดอีกครั้ง' : 'Replay'}
                                </button>
                                <button onClick={generateAndSpeak} disabled={generating}
                                    className="px-3.5 py-1 rounded-lg border border-gray-200 bg-white text-slate-600 text-[11px] font-bold disabled:cursor-not-allowed hover:bg-gray-50">
                                    🎲 {language === 'th' ? 'สร้างใหม่' : 'Regenerate'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Custom Text */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-gray-200">
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">
                            ✍️ {language === 'th' ? 'พิมพ์ข้อความเอง แล้วกดพูด' : 'Type custom text and speak'}
                        </label>
                        <div className="flex gap-2">
                            <input type="text" value={customText}
                                onChange={e => setCustomText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') speakCustom(); }}
                                placeholder={language === 'th' ? 'พิมพ์ข้อความที่ต้องการทดสอบ...' : 'Type text to test...'}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-[13px] outline-none focus:border-violet-400"
                            />
                            <button onClick={speakCustom} disabled={!customText.trim() || speaking}
                                className={`px-4 py-2 rounded-lg text-white font-bold text-xs ${
                                    customText.trim() && !speaking
                                        ? 'bg-violet-600 hover:bg-violet-700 cursor-pointer'
                                        : 'bg-gray-400 cursor-not-allowed'
                                }`}>
                                🔊 {language === 'th' ? 'พูด' : 'Speak'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
