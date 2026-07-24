'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { parseGpx, GpxParseError } from '@/lib/gpx';
import ImageCropModal from '@/components/ImageCropModal';
import AdminLayout from '../../AdminLayout';

interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation: string;
    raceType: string;
    badgeColor: string;
    status: string;
    remoteEventNo?: string;
    itra: number | string;
    utmbIndex: string;
}

interface CreateEventForm {
    name: string;
    description: string;
    eventDate: string;
    location: string;
    pictureUrl: string;
    organizerName: string;
    organizerContact: string;
    organizerPhone: string;
    organizerEmail: string;
    organizerWebsite: string;
    eventManager: string;
    themeType: string;
    status: string;
    allowRFIDSync: boolean;
    rfidToken: string;
    raceId: string;
    partnerCode: string;
    raceTigerBaseUrl: string;
    cardColor: string;
    slug: string;
    categories: RaceCategory[];
}

const THEME_OPTIONS = [
    { value: 'road_race', label: 'Road Race (ถนน)', labelEn: 'Road Race' },
    { value: 'trail_run', label: 'Trail Run (เทรล)', labelEn: 'Trail Run' },
    { value: 'mountain_run', label: 'Mountain Run (ภูเขา)', labelEn: 'Mountain Run' },
    { value: 'lap_race', label: 'นับรอบ labs', labelEn: 'Lap Race' },
    { value: 'virtual_run', label: 'Virtual Run', labelEn: 'Virtual Run' },
    { value: 'marathon', label: 'Marathon', labelEn: 'Marathon' },
    { value: 'super_marathon', label: 'SuperMarathon', labelEn: 'SuperMarathon' },
    { value: 'half_marathon', label: 'Half Marathon', labelEn: 'Half Marathon' },
    { value: 'mini_marathon', label: 'Mini Marathon', labelEn: 'Mini Marathon' },
    { value: 'fun_run', label: 'Funrun', labelEn: 'Funrun' },
];

const normalizeThemeType = (value?: string): string => {
    switch ((value || '').trim().toLowerCase()) {
        case 'road':
        case 'road race':
        case 'road_race':
            return 'road_race';
        case 'trail':
        case 'trail run':
        case 'utmb':
        case 'trail_run':
            return 'trail_run';
        case 'mountain run':
        case 'mountain_run':
            return 'mountain_run';
        case 'lab':
        case 'lap':
        case 'laps':
        case 'lap race':
        case 'lap_race':
            return 'lap_race';
        case 'virtual run':
        case 'virtual_run':
            return 'virtual_run';
        case 'marathon':
            return 'marathon';
        case 'super marathon':
        case 'super_marathon':
        case 'supermarathon':
            return 'super_marathon';
        case 'half marathon':
        case 'half_marathon':
            return 'half_marathon';
        case 'mini marathon':
        case 'mini_marathon':
            return 'mini_marathon';
        case 'fun run':
        case 'fun_run':
        case 'funrun':
            return 'fun_run';
        default:
            return 'road_race';
    }
};

// Mirrors the backend slugify (campaigns.service.ts) so the URL preview matches
// what will actually be stored. Thai characters (ก-๙) are preserved.
const slugifyPreview = (value: string): string =>
    (value || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9฀-๿]+/g, '-')
        .replace(/^-+|-+$/g, '');

// Public host where the e-slip pages are served.
const ESLIP_HOST = 'live.action.in.th';

// ─── GPX route upload (one course line per race category) ────────────────────

interface RouteMeta {
    category: string;
    fileName?: string;
    distanceKm: number;
    elevationGainM?: number;
    pointCount?: number;
    rawPointCount?: number;
    checkpointMarks?: { name: string; km: number }[];
}

interface CampaignCheckpoint {
    _id: string;
    name: string;
    orderNum?: number;
    distanceMappings?: string[];
}

/**
 * Per-category GPX upload + the km position of each checkpoint along that line.
 * The statistics page (/admin/general-chart) uses both to paint runner density
 * onto the real course map.
 */
function GpxRoutesCard({ campaignId, categories, th, notify }: {
    campaignId: string | null;
    categories: RaceCategory[];
    th: boolean;
    notify: (msg: string) => void;
}) {
    const [routes, setRoutes] = useState<Record<string, RouteMeta>>({});
    const [checkpoints, setCheckpoints] = useState<CampaignCheckpoint[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    // Per category → per checkpoint name → km typed by the admin (kept as text
    // so a half-typed "12." doesn't get clobbered while editing).
    const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});

    const catNames = categories.map(c => (c.name || '').trim()).filter(Boolean);

    const loadRoutes = useCallback(async () => {
        if (!campaignId) return;
        try {
            const res = await fetch(`/api/routes?campaignId=${campaignId}&meta=true`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;
            const byCat: Record<string, RouteMeta> = {};
            const nextMarks: Record<string, Record<string, string>> = {};
            for (const r of data as RouteMeta[]) {
                if (!r?.category) continue;
                byCat[r.category] = r;
                nextMarks[r.category] = Object.fromEntries(
                    (r.checkpointMarks || []).map(m => [m.name, String(m.km)]),
                );
            }
            setRoutes(byCat);
            setMarks(prev => ({ ...nextMarks, ...prev }));
        } catch { /* leave the list empty; the card just shows "no route yet" */ }
    }, [campaignId]);

    useEffect(() => { loadRoutes(); }, [loadRoutes]);

    useEffect(() => {
        if (!campaignId) return;
        (async () => {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data: CampaignCheckpoint[] = await res.json();
                if (Array.isArray(data)) {
                    setCheckpoints([...data].sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999)));
                }
            } catch { setCheckpoints([]); }
        })();
    }, [campaignId]);

    const cpsFor = (cat: string) =>
        checkpoints.filter(cp => !cp.distanceMappings?.length || cp.distanceMappings.includes(cat));

    const handleFile = async (cat: string, file: File) => {
        if (!campaignId) return;
        setBusy(cat);
        try {
            const text = await file.text();
            const parsed = parseGpx(text);
            const res = await fetch('/api/routes', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    campaignId,
                    category: cat,
                    fileName: file.name,
                    coords: parsed.coords,
                    distanceKm: parsed.distanceKm,
                    elevationGainM: parsed.elevationGainM,
                    rawPointCount: parsed.rawPointCount,
                    bounds: parsed.bounds,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            notify(th ? `อัปโหลดเส้นทาง ${cat} สำเร็จ (${parsed.distanceKm.toFixed(1)} กม.)` : `Route for ${cat} uploaded (${parsed.distanceKm.toFixed(1)} km)`);
            setMarks(prev => ({ ...prev, [cat]: {} })); // a new line invalidates old km marks
            await loadRoutes();
            setExpanded(cat);
        } catch (err) {
            const msg = err instanceof GpxParseError
                ? err.message
                : (th ? 'อัปโหลดไม่สำเร็จ' : 'Upload failed');
            notify(msg);
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async (cat: string) => {
        if (!campaignId) return;
        setBusy(cat);
        try {
            const res = await fetch(`/api/routes?campaignId=${campaignId}&category=${encodeURIComponent(cat)}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error();
            notify(th ? `ลบเส้นทาง ${cat} แล้ว` : `Route for ${cat} removed`);
            setRoutes(prev => { const n = { ...prev }; delete n[cat]; return n; });
        } catch {
            notify(th ? 'ลบไม่สำเร็จ' : 'Delete failed');
        } finally {
            setBusy(null);
        }
    };

    const saveMarks = async (cat: string) => {
        if (!campaignId) return;
        setBusy(cat);
        try {
            const entries = Object.entries(marks[cat] || {})
                .map(([name, v]) => ({ name, km: parseFloat(v) }))
                .filter(m => Number.isFinite(m.km));
            const res = await fetch('/api/routes', {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ campaignId, category: cat, checkpointMarks: entries }),
            });
            if (!res.ok) throw new Error();
            notify(th ? `บันทึกตำแหน่ง CP ของ ${cat} แล้ว` : `Checkpoint positions saved for ${cat}`);
            await loadRoutes();
        } catch {
            notify(th ? 'บันทึกไม่สำเร็จ' : 'Save failed');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="ce-card" style={{ borderTop: '3px solid #7c3aed' }}>
            <div className="ce-card-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>{th ? 'เส้นทางวิ่ง GPX (แยกตามระยะ)' : 'Course GPX (per distance)'}</span>
            </div>

            <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.7, marginBottom: 14 }}>
                {th
                    ? 'อัปโหลดไฟล์ .gpx ของแต่ละระยะ เพื่อให้หน้าสถิติแสดง "แผนที่ความหนาแน่นนักวิ่ง" บนเส้นทางจริงได้ (ปุ่ม MAP ในหน้า /admin/general-chart)'
                    : 'Upload a .gpx per distance so the statistics page can paint runner density onto the real course (the MAP button on /admin/general-chart).'}
            </div>

            {!campaignId ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: '#92400e' }}>
                    {th
                        ? '⚠️ กด "บันทึกกิจกรรม" ก่อน แล้วเปิดหน้านี้ในโหมดแก้ไข จึงจะอัปโหลด GPX ได้ (ต้องมีรหัสกิจกรรมก่อน)'
                        : '⚠️ Save the event first, then reopen it in edit mode to upload GPX files.'}
                </div>
            ) : catNames.length === 0 ? (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: '#64748b' }}>
                    {th
                        ? 'ยังไม่มีระยะในตาราง "ข้อมูลตารางระยะทาง" — เพิ่มระยะก่อนแล้วบันทึก จึงจะอัปโหลด GPX ได้'
                        : 'No distances defined yet — add them in the table above and save first.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {catNames.map(cat => {
                        const r = routes[cat];
                        const isBusy = busy === cat;
                        const cps = cpsFor(cat);
                        const isOpen = expanded === cat;
                        return (
                            <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: r ? '#faf5ff' : '#fff', flexWrap: 'wrap' }}>
                                    <span style={{
                                        background: r ? '#7c3aed' : '#94a3b8', color: '#fff', fontWeight: 800,
                                        fontSize: 12, padding: '3px 10px', borderRadius: 6, minWidth: 54, textAlign: 'center',
                                    }}>{cat}</span>

                                    <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: '#475569' }}>
                                        {r ? (
                                            <>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                    📄 {r.fileName || 'route.gpx'}
                                                </div>
                                                <div style={{ color: '#94a3b8', marginTop: 2 }}>
                                                    {r.distanceKm.toFixed(2)} km
                                                    {r.elevationGainM ? ` · ▲ ${r.elevationGainM.toLocaleString()} m` : ''}
                                                    {r.pointCount ? ` · ${r.pointCount.toLocaleString()} ${th ? 'จุด' : 'pts'}` : ''}
                                                    {r.rawPointCount && r.pointCount && r.rawPointCount > r.pointCount
                                                        ? ` (${th ? 'ย่อจาก' : 'from'} ${r.rawPointCount.toLocaleString()})` : ''}
                                                </div>
                                            </>
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>{th ? 'ยังไม่มีเส้นทาง' : 'No route uploaded'}</span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {r && (
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(isOpen ? null : cat)}
                                                style={{
                                                    fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                                                    border: '1px solid #cbd5e1', background: '#fff', color: '#475569',
                                                    borderRadius: 6, padding: '5px 10px',
                                                }}
                                            >
                                                📍 {th ? 'ตำแหน่ง CP' : 'CP positions'} {isOpen ? '▲' : '▼'}
                                            </button>
                                        )}
                                        <label style={{
                                            fontSize: 11.5, fontWeight: 700, cursor: isBusy ? 'wait' : 'pointer',
                                            border: '1px solid #7c3aed', background: r ? '#fff' : '#7c3aed',
                                            color: r ? '#7c3aed' : '#fff', borderRadius: 6, padding: '5px 12px',
                                            opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap',
                                        }}>
                                            {isBusy
                                                ? (th ? 'กำลังอ่านไฟล์...' : 'Reading...')
                                                : r ? (th ? 'เปลี่ยนไฟล์' : 'Replace') : (th ? '⬆ อัปโหลด GPX' : '⬆ Upload GPX')}
                                            <input
                                                type="file"
                                                accept=".gpx,application/gpx+xml,text/xml"
                                                style={{ display: 'none' }}
                                                disabled={isBusy}
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) handleFile(cat, f);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </label>
                                        {r && (
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(cat)}
                                                disabled={isBusy}
                                                title={th ? 'ลบเส้นทางนี้' : 'Delete this route'}
                                                style={{
                                                    fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                                                    border: '1px solid #fecaca', background: '#fff', color: '#dc2626',
                                                    borderRadius: 6, padding: '5px 10px',
                                                }}
                                            >
                                                {th ? 'ลบ' : 'Delete'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {r && isOpen && (
                                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 14px', background: '#fff' }}>
                                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.6 }}>
                                            {th
                                                ? `ระบุว่าแต่ละ checkpoint อยู่กิโลเมตรที่เท่าไรของเส้นทาง (0 – ${r.distanceKm.toFixed(1)}) เว้นว่างไว้ได้ ระบบจะกระจายให้เท่าๆ กันแทน`
                                                : `Set each checkpoint's km along the route (0 – ${r.distanceKm.toFixed(1)}). Leave blank to spread them evenly.`}
                                        </div>
                                        {cps.length === 0 ? (
                                            <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                                {th ? 'ยังไม่มี checkpoint สำหรับระยะนี้' : 'No checkpoints for this distance yet'}
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                                                    {cps.map(cp => (
                                                        <div key={cp._id}>
                                                            <label className="ce-label" style={{ fontSize: 11 }}>{cp.name}</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    min={0}
                                                                    max={r.distanceKm}
                                                                    className="ce-input ce-input-sm"
                                                                    placeholder="—"
                                                                    value={marks[cat]?.[cp.name] ?? ''}
                                                                    onChange={(e) => setMarks(prev => ({
                                                                        ...prev,
                                                                        [cat]: { ...(prev[cat] || {}), [cp.name]: e.target.value },
                                                                    }))}
                                                                />
                                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>km</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => saveMarks(cat)}
                                                    disabled={isBusy}
                                                    style={{
                                                        marginTop: 12, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                                        cursor: 'pointer', border: 'none', background: '#7c3aed', color: '#fff',
                                                        borderRadius: 6, padding: '7px 16px', opacity: isBusy ? 0.6 : 1,
                                                    }}
                                                >
                                                    {th ? 'บันทึกตำแหน่ง CP' : 'Save CP positions'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function CreateEventForm() {
    const { language } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('edit');
    const isEdit = !!editId;

    const [saving, setSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [slugCopied, setSlugCopied] = useState(false);

    const copyEslipUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Fallback for insecure contexts where navigator.clipboard is unavailable
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch { /* ignore */ }
            document.body.removeChild(ta);
        }
        setSlugCopied(true);
        setTimeout(() => setSlugCopied(false), 1800);
    };
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [rawImage, setRawImage] = useState<string>('');
    const [thumbnail, setThumbnail] = useState<string>('');

    // Generate a tiny blurry thumbnail (~1KB) from a base64 image using Canvas
    const generateThumbnail = (base64: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 16;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, 32, 16);
                    resolve(canvas.toDataURL('image/jpeg', 0.3));
                } else {
                    resolve('');
                }
            };
            img.onerror = () => resolve('');
            img.src = base64;
        });
    };
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [raceTigerUrl, setRaceTigerUrl] = useState('');

    const normalizeStartTime = (value: string | undefined): string => {
        const raw = (value || '').trim();
        if (!raw) return '';

        // Already in datetime-local format (YYYY-MM-DDThh:mm)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
            return raw.slice(0, 16);
        }

        // Full ISO date with time (e.g. 2025-02-15T06:00:00.000Z)
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            const yyyy = parsed.getFullYear();
            const MM = String(parsed.getMonth() + 1).padStart(2, '0');
            const dd = String(parsed.getDate()).padStart(2, '0');
            const hh = String(parsed.getHours()).padStart(2, '0');
            const mm = String(parsed.getMinutes()).padStart(2, '0');
            return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
        }

        // Time-only (hh:mm) — no date info
        const m = raw.match(/(\d{1,2}):(\d{2})/);
        if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

        return '';
    };

    const [form, setForm] = useState<CreateEventForm>({
        name: '',
        description: '',
        eventDate: '',
        location: '',
        pictureUrl: '',
        organizerName: '',
        organizerContact: '',
        organizerPhone: '',
        organizerEmail: '',
        organizerWebsite: '',
        eventManager: '',
        themeType: 'road_race',
        status: 'upcoming',
        allowRFIDSync: false,
        rfidToken: '',
        raceId: '',
        partnerCode: '',
        raceTigerBaseUrl: '',
        cardColor: '',
        slug: '',
        categories: [],
    });

    // Load campaign data when editing
    useEffect(() => {
        if (!editId) return;
        setLoadingEdit(true);
        fetch(`/api/campaigns/${editId}?full=true`)
            .then(res => res.json())
            .then(data => {
                const campaign = data;
                setForm({
                    name: campaign.name || '',
                    description: campaign.description || '',
                    eventDate: campaign.eventDate ? campaign.eventDate.slice(0, 10) : '',
                    location: campaign.location || '',
                    pictureUrl: campaign.pictureUrl || '',
                    organizerName: campaign.organizerName || '',
                    organizerContact: campaign.organizerContact || '',
                    organizerPhone: campaign.organizerPhone || '',
                    organizerEmail: campaign.organizerEmail || '',
                    organizerWebsite: campaign.organizerWebsite || '',
                    eventManager: campaign.eventManager || '',
                    themeType: normalizeThemeType(campaign.themeType),
                    status: campaign.status || 'upcoming',
                    allowRFIDSync: campaign.allowRFIDSync ?? false,
                    rfidToken: campaign.rfidToken || '',
                    raceId: campaign.raceId || '',
                    partnerCode: campaign.partnerCode || '',
                    raceTigerBaseUrl: campaign.raceTigerBaseUrl || '',
                    cardColor: campaign.cardColor || '',
                    slug: campaign.slug || '',
                    categories: (campaign.categories || []).map((cat: RaceCategory) => ({
                        name: cat.name || '',
                        distance: cat.distance || '',
                        startTime: normalizeStartTime(cat.startTime),
                        cutoff: cat.cutoff || '',
                        elevation: cat.elevation || '',
                        raceType: cat.raceType || '',
                        badgeColor: cat.badgeColor || '#dc2626',
                        status: cat.status || 'live',
                        remoteEventNo: cat.remoteEventNo || '',
                        itra: cat.itra ?? '',
                        utmbIndex: cat.utmbIndex || '',
                    })),
                });
                if (campaign.rfidToken && campaign.raceId) {
                    const base = campaign.raceTigerBaseUrl || 'https://wx.racetigertiming.com';
                    const pc = campaign.partnerCode || '000001';
                    const reconstructed = `${base}/Dif/bio?pc=${pc}&rid=${campaign.raceId}&token=${campaign.rfidToken}&page=1`;
                    setRaceTigerUrl(reconstructed);
                }
            })
            .catch(err => console.error('Failed to load campaign:', err))
            .finally(() => setLoadingEdit(false));
    }, [editId]);

    const updateField = (field: keyof CreateEventForm, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Category management
    const addCategory = () => {
        setForm(prev => ({
            ...prev,
            categories: [...prev.categories, {
                name: '', distance: '', startTime: '', cutoff: '',
                elevation: '', raceType: '', badgeColor: '#dc2626',
                status: 'live', remoteEventNo: '', itra: '', utmbIndex: '',
            }]
        }));
    };

    const removeCategory = (idx: number) => {
        setForm(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== idx)
        }));
    };

    const handleRaceTigerUrlPaste = (url: string) => {
        setRaceTigerUrl(url);
        if (!url.trim()) return;
        try {
            const parsed = new URL(url.trim());
            const rid = parsed.searchParams.get('rid');
            const token = parsed.searchParams.get('token');
            const pc = parsed.searchParams.get('pc');
            // Extract base URL (e.g. https://wx.racetigertiming.com)
            const baseUrl = `${parsed.protocol}//${parsed.hostname}`;
            if (rid || token || pc) {
                setForm(prev => ({
                    ...prev,
                    ...(rid ? { raceId: rid } : {}),
                    ...(token ? { rfidToken: token } : {}),
                    ...(pc ? { partnerCode: pc } : {}),
                    raceTigerBaseUrl: baseUrl,
                    allowRFIDSync: true,
                }));
            }
        } catch {
            // not a valid URL, ignore
        }
    };

    const updateCategory = (idx: number, field: keyof RaceCategory, value: string | number) => {
        setForm(prev => ({
            ...prev,
            categories: prev.categories.map((cat, i) =>
                i === idx ? { ...cat, [field]: value } : cat
            )
        }));
    };

    // Image upload — open interactive crop modal
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target?.result as string);
                setCropModalOpen(true);
            };
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    // Save
    const handleSave = async () => {
        if (!form.name || !form.eventDate || !form.location) {
            setToastMessage(language === 'th' ? 'กรุณากรอกชื่อ วันที่ และสถานที่' : 'Please fill in name, date, and location');
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        if (form.allowRFIDSync && (!form.rfidToken.trim() || !form.raceId.trim())) {
            setToastMessage(language === 'th' ? 'กรุณากรอก RFID Token และ Race ID' : 'Please provide RFID token and Race ID');
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        setSaving(true);
        try {
            // Send pictureUrl (base64 is OK — body limit is 10MB)
            const pictureUrl = form.pictureUrl || undefined;
            // Clean up categories: convert itra to number, filter out empty entries
            const cleanCategories = form.categories
                .filter(cat => cat.name || cat.distance) // skip totally empty rows
                .map(cat => ({
                    name: cat.name || 'Unnamed',
                    distance: cat.distance || '0 KM',
                    startTime: cat.startTime || '06:00',
                    cutoff: cat.cutoff || '-',
                    badgeColor: cat.badgeColor || '#dc2626',
                    ...(cat.elevation && { elevation: cat.elevation }),
                    ...(cat.raceType && { raceType: cat.raceType }),
                    ...(cat.status && { status: cat.status }),
                    ...(cat.remoteEventNo?.trim() && { remoteEventNo: cat.remoteEventNo.trim() }),
                    ...(cat.itra && { itra: Number(cat.itra) || undefined }),
                    ...(cat.utmbIndex && { utmbIndex: cat.utmbIndex }),
                }));
            const payload: Record<string, unknown> = {
                name: form.name,
                eventDate: form.eventDate,
            };
            if (form.description) payload.description = form.description;
            if (form.location) payload.location = form.location;
            if (pictureUrl) payload.pictureUrl = pictureUrl;
            if (thumbnail) payload.thumbnail = thumbnail;
            if (form.organizerName) payload.organizerName = form.organizerName;
            if (form.status) payload.status = form.status;
            payload.allowRFIDSync = form.allowRFIDSync;
            if (form.rfidToken.trim()) payload.rfidToken = form.rfidToken.trim();
            if (form.raceId.trim()) payload.raceId = form.raceId.trim();
            if (form.partnerCode.trim()) payload.partnerCode = form.partnerCode.trim();
            if (form.raceTigerBaseUrl.trim()) payload.raceTigerBaseUrl = form.raceTigerBaseUrl.trim();
            if (form.cardColor.trim()) payload.cardColor = form.cardColor.trim();
            if (form.slug.trim()) payload.slug = form.slug.trim();
            if (form.themeType) payload.themeType = form.themeType;
            if (cleanCategories.length > 0) payload.categories = cleanCategories;
            // Use API proxy route to work on both localhost and Vercel
            const url = isEdit ? `/api/campaigns/${editId}` : '/api/campaigns';
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('Backend error:', errData);
                throw new Error(`Failed: ${res.status}`);
            }
            setToastMessage(language === 'th'
                ? (isEdit ? 'บันทึกการแก้ไขสำเร็จ!' : 'สร้างกิจกรรมสำเร็จ!')
                : (isEdit ? 'Changes saved!' : 'Event created successfully!'));
            setTimeout(() => {
                router.push('/admin/events');
            }, 1500);
        } catch (error) {
            console.error('Failed to save event:', error);
            setToastMessage(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Failed to save event');
        } finally {
            setSaving(false);
            setTimeout(() => setToastMessage(null), 3000);
        }
    };

    if (loadingEdit) {
        return (
            <AdminLayout
                breadcrumbItems={[
                    { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                    { label: 'กำลังโหลด...', labelEn: 'Loading...' }
                ]}
                pageTitle=""
            >
                <div className="text-center py-16 text-gray-400">
                    {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                { label: isEdit ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่', labelEn: isEdit ? 'Edit Event' : 'Create New Event' }
            ]}
        >
            <div className="admin-card">
                {/* Page Header */}
                <div className="create-event-header">
                    <h1 className="create-event-title">
                        {language === 'th'
                            ? (isEdit ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่')
                            : (isEdit ? 'Edit Event' : 'Create New Event')
                        }
                    </h1>
                    <div className="create-event-actions">
                        <button className="btn-ce btn-ce-cancel" onClick={() => router.push('/admin/events')}>
                            {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </button>
                        <button className="btn-ce btn-ce-save" onClick={handleSave} disabled={saving}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            {saving
                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (language === 'th' ? 'บันทึกกิจกรรม' : 'Save Event')
                            }
                        </button>
                    </div>
                </div>

                {/* Card 1: Images & Media (Warning/Yellow) */}
                <div className="ce-card ce-card-warning">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f39c12" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>{language === 'th' ? 'รูปภาพและสื่อ (Images & Media)' : 'Images & Media'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group">
                            <label className="ce-label">
                                {language === 'th' ? 'ภาพหน้าปกกิจกรรม' : 'Event Cover Image'}
                            </label>
                            <div
                                className="ce-upload-box"
                                onClick={() => document.getElementById('cover-upload')?.click()}
                                style={{ aspectRatio: '16/8', minHeight: 'auto', padding: form.pictureUrl ? 0 : 20 }}
                            >
                                {form.pictureUrl ? (
                                    <img src={form.pictureUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <>
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                                            <polyline points="16 16 12 12 8 16" />
                                            <line x1="12" y1="12" x2="12" y2="21" />
                                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                        </svg>
                                        <span>{language === 'th' ? 'คลิกอัปโหลดรูปหน้าปก (16:8)' : 'Click to upload cover (16:8)'}</span>
                                    </>
                                )}
                            </div>
                            <input id="cover-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                        </div>

                    </div>
                </div>

                {/* Card 2: General Info (Info/Blue) */}
                <div className="ce-card ce-card-info">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00c0ef" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>{language === 'th' ? 'ข้อมูลทั่วไป (General Info)' : 'General Info'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">{language === 'th' ? 'ชื่ออีเว้นท์แบบเต็ม' : 'Full Event Name'} *</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อกิจกรรม' : 'Enter event name'}
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ประเภทธีม' : 'Theme Type'}</label>
                            <select
                                className="ce-select"
                                value={form.themeType}
                                onChange={(e) => updateField('themeType', e.target.value)}
                            >
                                {THEME_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {language === 'th' ? opt.label : opt.labelEn}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'สีแถบ Card หน้าแรก' : 'Homepage Card Strip Color'}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="color"
                                    value={form.cardColor || '#dc2626'}
                                    onChange={(e) => updateField('cardColor', e.target.value)}
                                    style={{ width: 36, height: 36, border: '1px solid #d2d6de', borderRadius: 4, cursor: 'pointer', padding: 2 }}
                                />
                                <input
                                    type="text"
                                    className="ce-input"
                                    placeholder="#dc2626"
                                    value={form.cardColor}
                                    onChange={(e) => updateField('cardColor', e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'วันที่จัดงาน' : 'Event Date'} *</label>
                            <input
                                type="date"
                                className="ce-input"
                                value={form.eventDate}
                                onChange={(e) => updateField('eventDate', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'สถานที่จัด' : 'Location'} *</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุสถานที่/พิกัด' : 'Enter location'}
                                value={form.location}
                                onChange={(e) => updateField('location', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">{language === 'th' ? 'URL E-Slip (ลิงก์ผลการแข่งขันนักวิ่ง)' : 'E-Slip URL (runner result link)'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'เช่น buriram-10-thunder-speed-2026' : 'e.g. buriram-10-thunder-speed-2026'}
                                value={form.slug}
                                onChange={(e) => updateField('slug', e.target.value)}
                            />
                            {(() => {
                                const effectiveSlug = slugifyPreview(form.slug || form.name) || 'your-event';
                                return (
                                    <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.7, color: '#475569' }}>
                                        <div style={{ marginBottom: 4 }}>
                                            {language === 'th'
                                                ? 'ลิงก์ E-Slip ของนักวิ่งแต่ละคนจะเป็น:'
                                                : "Each runner's E-Slip link will be:"}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <code style={{
                                                display: 'inline-block', background: '#f1f5f9', border: '1px solid #e2e8f0',
                                                borderRadius: 6, padding: '5px 9px', fontSize: 12.5, color: '#0f172a',
                                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all',
                                            }}>
                                                {ESLIP_HOST}/{effectiveSlug}/
                                                <span style={{ background: '#fde68a', color: '#78350f', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                                    xxxx
                                                </span>
                                            </code>
                                            <button
                                                type="button"
                                                onClick={() => copyEslipUrl(`https://${ESLIP_HOST}/${effectiveSlug}/`)}
                                                title={language === 'th' ? 'คัดลอกลิงก์ (แล้วเติมเลข BIB ต่อท้าย)' : 'Copy link (then append the BIB number)'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                                                    background: slugCopied ? '#16a34a' : '#fff', color: slugCopied ? '#fff' : '#334155',
                                                    border: `1px solid ${slugCopied ? '#16a34a' : '#cbd5e1'}`, borderRadius: 6,
                                                    padding: '5px 10px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {slugCopied ? (
                                                    <>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                        {language === 'th' ? 'คัดลอกแล้ว' : 'Copied'}
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                                        {language === 'th' ? 'คัดลอก' : 'Copy'}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: 6, color: '#b45309' }}>
                                            {language === 'th'
                                                ? '⚠️ ส่วน xxxx ให้เปลี่ยนเป็นเลข BIB ของนักวิ่งแต่ละคน เช่น '
                                                : '⚠️ Replace xxxx with each runner\'s BIB number, e.g. '}
                                            <code style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 5px' }}>
                                                {ESLIP_HOST}/{effectiveSlug}/1234
                                            </code>
                                        </div>
                                        {language === 'th' && (
                                            <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 11.5 }}>
                                                เว้นว่างไว้ได้ ระบบจะสร้างลิงก์อัตโนมัติจากชื่ออีเว้นท์
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">{language === 'th' ? 'รายละเอียดและวัตถุประสงค์' : 'Description & Objectives'}</label>
                            <textarea
                                className="ce-textarea"
                                placeholder={language === 'th' ? 'ข้อมูลเบื้องต้นของงาน...' : 'Basic event information...'}
                                value={form.description}
                                onChange={(e) => updateField('description', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Card 3: Distance Table (Success/Green) */}
                <div className="ce-card ce-card-success">
                    <div className="ce-card-header justify-between">
                        <div className="flex items-center gap-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00a65a" strokeWidth="2">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>{language === 'th' ? 'ข้อมูลตารางระยะทาง' : 'Distance Categories Table'}</span>
                        </div>
                        <button type="button" className="btn-ce-add" onClick={addCategory}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {language === 'th' ? 'เพิ่มแถว' : 'Add Row'}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="ce-distance-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 130 }}>{language === 'th' ? 'Remote Event No' : 'Remote Event No'}</th>
                                    <th style={{ width: 120 }}>{language === 'th' ? 'ระยะทาง' : 'Distance'}</th>
                                    <th style={{ width: 80 }}>Badge</th>
                                    <th style={{ width: 190 }}>{language === 'th' ? 'วันเวลาปล่อยตัว' : 'Start Date & Time'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'เวลาคัดออฟ' : 'Cutoff'}</th>
                                    <th style={{ width: 90 }}>ITRA Score</th>
                                    <th style={{ width: 100 }}>UTMB Index</th>
                                    <th style={{ width: 120, textAlign: 'right' }}>{language === 'th' ? 'ความสูง' : 'Elevation'}</th>
                                    <th style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-5 text-gray-400">
                                            {language === 'th' ? 'ยังไม่มีประเภท — กดปุ่ม "เพิ่มแถว"' : 'No categories yet — click "Add Row"'}
                                        </td>
                                    </tr>
                                ) : (
                                    form.categories.map((cat, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.remoteEventNo || ''}
                                                    onChange={(e) => updateCategory(idx, 'remoteEventNo', e.target.value)}
                                                    placeholder={language === 'th' ? 'Project Number' : 'Project Number'}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.distance}
                                                    onChange={(e) => updateCategory(idx, 'distance', e.target.value)}
                                                    placeholder="175 KM"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-badge-input"
                                                    value={cat.name}
                                                    onChange={(e) => updateCategory(idx, 'name', e.target.value)}
                                                    placeholder="100M"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="datetime-local"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.startTime}
                                                    onChange={(e) => updateCategory(idx, 'startTime', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.cutoff}
                                                    onChange={(e) => updateCategory(idx, 'cutoff', e.target.value)}
                                                    placeholder={language === 'th' ? '48 ชม.' : '48 hrs'}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.itra}
                                                    onChange={(e) => updateCategory(idx, 'itra', e.target.value)}
                                                    placeholder="💎 6"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.utmbIndex}
                                                    onChange={(e) => updateCategory(idx, 'utmbIndex', e.target.value)}
                                                    placeholder="⚡ 100M"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm text-right"
                                                    value={cat.elevation}
                                                    onChange={(e) => updateCategory(idx, 'elevation', e.target.value)}
                                                    placeholder="10,400 m+"
                                                />
                                            </td>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                                                    onClick={() => removeCategory(idx)}
                                                    title={language === 'th' ? 'ลบแถวนี้' : 'Delete row'}
                                                >
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Card 3b: Course GPX per distance */}
                <GpxRoutesCard
                    campaignId={editId}
                    categories={form.categories}
                    th={language === 'th'}
                    notify={(msg) => {
                        setToastMessage(msg);
                        setTimeout(() => setToastMessage(null), 3000);
                    }}
                />

                {/* Card 4: Organizer (Danger/Red) */}
                <div className="ce-card ce-card-danger">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dd4b39" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{language === 'th' ? 'ผู้จัดงาน' : 'Organizer'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ออแกไนเซอร์' : 'Organizer'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อออแกไนเซอร์' : 'Enter organizer name'}
                                value={form.organizerName}
                                onChange={(e) => updateField('organizerName', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ผู้จัดอีเว้นท์' : 'Event Manager'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อผู้จัด' : 'Enter event manager'}
                                value={form.eventManager}
                                onChange={(e) => updateField('eventManager', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ชื่อผู้ติดต่อ' : 'Contact Name'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerContact}
                                onChange={(e) => updateField('organizerContact', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerPhone}
                                onChange={(e) => updateField('organizerPhone', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'อีเมล' : 'Email'}</label>
                            <input
                                type="email"
                                className="ce-input"
                                value={form.organizerEmail}
                                onChange={(e) => updateField('organizerEmail', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'เฟสบุ๊ค / เว็บไซต์' : 'Facebook / Website'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerWebsite}
                                onChange={(e) => updateField('organizerWebsite', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Card 5: RFID Sync */}
                <div className="ce-card ce-card-info">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00c0ef" strokeWidth="2">
                            <path d="M2 12a10 10 0 0 1 20 0" />
                            <path d="M5 12a7 7 0 0 1 14 0" />
                            <path d="M8 12a4 4 0 0 1 8 0" />
                            <circle cx="12" cy="16" r="1.5" />
                        </svg>
                        <span>{language === 'th' ? 'เชื่อมต่อ RFID (RaceTiger)' : 'RFID Integration (RaceTiger)'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">
                                {language === 'th' ? 'วาง URL จากเว็บ RaceTiger (Auto-fill)' : 'Paste RaceTiger URL (Auto-fill)'}
                            </label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder="https://rqs.racetigertiming.com/Dif/bio?pc=000001&rid=...&token=...&page=1"
                                value={raceTigerUrl}
                                onPaste={(e) => {
                                    const text = e.clipboardData.getData('text');
                                    handleRaceTigerUrlPaste(text);
                                }}
                                onChange={(e) => handleRaceTigerUrlPaste(e.target.value)}
                            />
                            <div className="text-xs text-gray-500 mt-1.5 flex flex-col gap-1">
                                <span>
                                    {language === 'th'
                                        ? '📋 วาง URL ใดก็ได้จากเว็บ RaceTiger — ระบบจะดึง Race ID, Token และ Partner Code ให้อัตโนมัติ'
                                        : '📋 Paste any URL from RaceTiger — Race ID, Token and Partner Code will be extracted automatically'}
                                </span>
                                <span className="text-gray-400">
                                    {language === 'th' ? 'เมื่อกด "Import Events from RaceTiger" ระบบจะดึงข้อมูลจาก 3 endpoint อัตโนมัติ:' : 'When clicking "Import Events from RaceTiger", the system fetches from 3 endpoints automatically:'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'📁 '}<code className="bg-gray-100 px-1 rounded">/Dif/info</code>
                                    {language === 'th' ? ' → ระยะทาง / ชื่อ Event' : ' → distances / event names'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'🏃 '}<code className="bg-gray-100 px-1 rounded">/Dif/bio</code>
                                    {language === 'th' ? ' → รายชื่อนักวิ่ง (Runners)' : ' → runner list (participants)'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'📍 '}<code className="bg-gray-100 px-1 rounded">/Dif/splitScore</code>
                                    {language === 'th' ? ' → ชื่อ Checkpoint ตามจริง' : ' → real checkpoint names'}
                                </span>
                            </div>
                            {/* Show extracted values immediately after URL is pasted */}
                            {(form.partnerCode || form.raceId || form.rfidToken) && (
                                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-xs flex flex-col gap-1">
                                    <span className="font-bold text-green-700">
                                        ✅ {language === 'th' ? 'ดึงค่าจาก URL สำเร็จ:' : 'Extracted from URL:'}
                                    </span>
                                    {form.raceTigerBaseUrl && (
                                        <span className="text-green-800">
                                            <strong>Base URL:</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.raceTigerBaseUrl}</code>
                                            <span className="text-gray-500 ml-1.5">
                                                {language === 'th' ? '— server ของ RaceTiger' : '— RaceTiger server'}
                                            </span>
                                        </span>
                                    )}
                                    {form.partnerCode && (
                                        <span className="text-green-800">
                                            <strong>Partner Code (pc):</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.partnerCode}</code>
                                            <span className="text-gray-500 ml-1.5">
                                                {language === 'th' ? '— รหัสพาร์ทเนอร์ของงานนี้ใน RaceTiger' : "— your event's partner code in RaceTiger"}
                                            </span>
                                        </span>
                                    )}
                                    {form.raceId && (
                                        <span className="text-green-800">
                                            <strong>Race ID (rid):</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.raceId}</code>
                                        </span>
                                    )}
                                    {form.rfidToken && (
                                        <span className="text-green-800">
                                            <strong>Token:</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">
                                                {form.rfidToken.length > 20 ? form.rfidToken.slice(0, 20) + '…' : form.rfidToken}
                                            </code>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="ce-form-group ce-full">
                            <label className="ce-label flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.allowRFIDSync}
                                    onChange={(e) => updateField('allowRFIDSync', e.target.checked)}
                                />
                                <span>{language === 'th' ? 'เปิดใช้งานการซิงค์ RFID สำหรับกิจกรรมนี้' : 'Enable RFID sync for this campaign'}</span>
                            </label>
                        </div>

                        {form.allowRFIDSync && (
                            <>
                                <div className="ce-form-group">
                                    <label className="ce-label">RFID Token *</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder={language === 'th' ? 'ระบุ Event Token จากเว็บจีน' : 'Enter Event Token from RaceTiger'}
                                        value={form.rfidToken}
                                        onChange={(e) => updateField('rfidToken', e.target.value)}
                                    />
                                </div>
                                <div className="ce-form-group">
                                    <label className="ce-label">Race ID *</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder={language === 'th' ? 'ระบุ Race ID จากเว็บจีน' : 'Enter Race ID from RaceTiger'}
                                        value={form.raceId}
                                        onChange={(e) => updateField('raceId', e.target.value)}
                                    />
                                </div>
                                <div className="ce-form-group">
                                    <label className="ce-label">Partner Code (pc)</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder="000001"
                                        value={form.partnerCode}
                                        onChange={(e) => updateField('partnerCode', e.target.value)}
                                    />
                                    <span className="block text-xs text-gray-400 mt-0.5">
                                        {language === 'th'
                                            ? 'ค่า pc จาก URL ของ RaceTiger (ดึงอัตโนมัติเมื่อวาง URL ด้านบน)'
                                            : 'pc value from RaceTiger URL (auto-filled when pasting URL above)'}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Toast */}
                {toastMessage && (
                    <div className="toast-container">
                        <div className="toast toast-success">
                            <span className="toast-icon">✓</span>
                            <span className="toast-message">{toastMessage}</span>
                        </div>
                    </div>
                )}

                {/* Image Crop Modal */}
                <ImageCropModal
                    isOpen={cropModalOpen}
                    imageSrc={rawImage}
                    onCrop={async (croppedDataUrl) => {
                        setForm(prev => ({ ...prev, pictureUrl: croppedDataUrl }));
                        const thumb = await generateThumbnail(croppedDataUrl);
                        setThumbnail(thumb);
                        setCropModalOpen(false);
                    }}
                    onCancel={() => setCropModalOpen(false)}
                />
            </div>
        </AdminLayout>
    );
}

export default function CreateEventPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Loading...</div>}>
            <CreateEventForm />
        </Suspense>
    );
}
