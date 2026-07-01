'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../AdminLayout';
import { useAuth } from '@/lib/auth-context';
import { authHeaders } from '@/lib/authHeaders';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey =
    | 'eventName' | 'bib' | 'runnerName' | 'firstName' | 'lastName'
    | 'category' | 'distance' | 'gender' | 'ageGroup'
    | 'overallRank' | 'genderRank' | 'categoryRank'
    | 'gunTime' | 'netTime' | 'pace' | 'award' | 'targetBand'
    | 'eventDate' | 'location' | 'static';

export interface ESlipV2Element {
    id: string;
    type?: 'text' | 'image' | 'splits';
    field: FieldKey;
    staticText: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: string;
    color: string;
    align: 'left' | 'center' | 'right';
    prefix: string;
    suffix: string;
    backgroundColor: string;
    borderRadius: number;
    opacity: number;
    zIndex: number;
    italic: boolean;
    uppercase: boolean;
    letterSpacing: number;
    imageData?: string;
    objectFit?: 'cover' | 'contain' | 'fill';
    // Splits-table only
    header1?: string;
    header2?: string;
    header3?: string;
    rowGap?: number;
    colGap?: number;
}

export interface ESlipV2Layout {
    canvasWidth: number;
    canvasHeight: number;
    background: {
        type: 'color' | 'image';
        color: string;
        imageData: string;
        imageOpacity?: number;
    };
    elements: ESlipV2Element[];
}

// A saved E-Slip 2 template (stored in localStorage so layouts can be reused
// across events without rebuilding — same idea as the certificate templates).
export interface ESlipV2Template {
    id: string;
    name: string;
    savedAt: number;
    layout: ESlipV2Layout;
}

const TEMPLATES_STORAGE_KEY = 'eslip2_templates';

function loadTemplates(): ESlipV2Template[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function persistTemplates(list: ESlipV2Template[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(list));
    } catch {
        /* quota / private-mode — ignore */
    }
}

type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface DragState {
    type: 'move' | 'resize';
    elemId: string;
    dir?: ResizeDir;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
}

// ─── Field Palette ────────────────────────────────────────────────────────────

const FIELD_PALETTE: { field: FieldKey; label: string; defaultText: string }[] = [
    { field: 'eventName', label: 'ชื่องาน', defaultText: 'ACTION MARATHON 2025' },
    { field: 'bib', label: 'BIB Number', defaultText: '1234' },
    { field: 'runnerName', label: 'ชื่อ-นามสกุล', defaultText: 'นักวิ่ง ทดสอบ' },
    { field: 'category', label: 'ประเภท/ระยะ', defaultText: '21KM' },
    { field: 'gender', label: 'เพศ', defaultText: 'Male' },
    { field: 'ageGroup', label: 'กลุ่มอายุ', defaultText: '30-39' },
    { field: 'overallRank', label: 'Overall Rank', defaultText: '42' },
    { field: 'genderRank', label: 'Gender Rank', defaultText: '20' },
    { field: 'categoryRank', label: 'Category Rank', defaultText: '15' },
    { field: 'gunTime', label: 'Gun Time', defaultText: '02:15:33' },
    { field: 'netTime', label: 'Net Time', defaultText: '02:14:01' },
    { field: 'pace', label: 'Avg Pace', defaultText: '6:22' },
    { field: 'award', label: '🏆 Award', defaultText: 'Age Group 3' },
    { field: 'targetBand', label: '🎯 Sub (เป้าหมาย)', defaultText: 'sub 45' },
    { field: 'eventDate', label: 'วันที่งาน', defaultText: '25 Jan 2025' },
    { field: 'location', label: 'สถานที่', defaultText: 'กรุงเทพมหานคร' },
    { field: 'static', label: 'ข้อความ Static', defaultText: 'OFFICIAL RESULT' },
];

// ─── Mock preview data ────────────────────────────────────────────────────────

const MOCK_DATA: Record<FieldKey, string> = {
    eventName: 'ACTION MARATHON 2025',
    bib: '1234',
    runnerName: 'สมชาย ใจดี',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    category: '21 KM',
    distance: '21',
    gender: 'Male',
    ageGroup: '30-39',
    overallRank: '42',
    genderRank: '20',
    categoryRank: '15',
    gunTime: '02:15:33',
    netTime: '02:14:01',
    pace: "6'22\"",
    award: 'Age Group 3',
    targetBand: 'sub 45',
    eventDate: '25 Jan 2025',
    location: 'กรุงเทพมหานคร',
    static: '',
};

// ─── Default layout ────────────────────────────────────────────────────────────

function defaultLayout(): ESlipV2Layout {
    return {
        canvasWidth: 380,
        canvasHeight: 700,
        background: { type: 'color', color: '#1e293b', imageData: '' },
        elements: [
            {
                id: 'el-0', field: 'eventName', staticText: '', x: 20, y: 40, width: 340, height: 44,
                fontSize: 20, fontWeight: '800', color: '#ffffff', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: true, letterSpacing: 1,
            },
            {
                id: 'el-1', field: 'bib', staticText: '', x: 140, y: 100, width: 100, height: 44,
                fontSize: 28, fontWeight: '800', color: '#ffffff', align: 'center',
                prefix: 'BIB ', suffix: '', backgroundColor: '#22c55e', borderRadius: 10, opacity: 1, zIndex: 2,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-2', field: 'runnerName', staticText: '', x: 20, y: 160, width: 340, height: 44,
                fontSize: 24, fontWeight: '800', color: '#ffffff', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-3', field: 'category', staticText: '', x: 20, y: 218, width: 160, height: 36,
                fontSize: 16, fontWeight: '600', color: '#94a3b8', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-4', field: 'gender', staticText: '', x: 200, y: 218, width: 160, height: 36,
                fontSize: 16, fontWeight: '600', color: '#94a3b8', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-5', field: 'netTime', staticText: '', x: 20, y: 290, width: 340, height: 60,
                fontSize: 40, fontWeight: '900', color: '#22c55e', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-6', field: 'static', staticText: 'Net Time', x: 20, y: 358, width: 340, height: 28,
                fontSize: 12, fontWeight: '700', color: '#64748b', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: true, letterSpacing: 2,
            },
            {
                id: 'el-7', field: 'overallRank', staticText: '', x: 20, y: 420, width: 100, height: 60,
                fontSize: 28, fontWeight: '800', color: '#ffffff', align: 'center',
                prefix: '', suffix: '', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-8', field: 'gunTime', staticText: '', x: 140, y: 420, width: 100, height: 60,
                fontSize: 20, fontWeight: '700', color: '#ffffff', align: 'center',
                prefix: '', suffix: '', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-9', field: 'pace', staticText: '', x: 260, y: 420, width: 100, height: 60,
                fontSize: 20, fontWeight: '700', color: '#ffffff', align: 'center',
                prefix: '', suffix: '', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, opacity: 1, zIndex: 1,
                italic: false, uppercase: false, letterSpacing: 0,
            },
            {
                id: 'el-10', field: 'static', staticText: 'ACTION TIMING OFFICIAL RESULT', x: 20, y: 650, width: 340, height: 24,
                fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.3)', align: 'center',
                prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
                italic: false, uppercase: true, letterSpacing: 3,
            },
        ],
    };
}

function makeElement(field: FieldKey, staticText: string): ESlipV2Element {
    return {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'text', field, staticText,
        x: 20, y: 200, width: 340, height: 48,
        fontSize: 18, fontWeight: '700', color: '#ffffff', align: 'center',
        prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 1,
        italic: false, uppercase: false, letterSpacing: 0,
    };
}

function makeSplitsElement(canvasW: number, canvasH: number): ESlipV2Element {
    const w = canvasW - 40;
    const h = 200;
    return {
        id: `el-splits-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'splits', field: 'static', staticText: '',
        x: 20, y: Math.max(0, canvasH - h - 16),
        width: w, height: h,
        fontSize: 13, fontWeight: '900', color: '#000000', align: 'left',
        prefix: '', suffix: '',
        backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 50,
        italic: false, uppercase: false, letterSpacing: 0,
        header1: 'CHECKPOINT', header2: 'TIME', header3: 'PACE',
        rowGap: 6, colGap: 4,
    };
}

function ensureSplitsElement(layout: ESlipV2Layout): ESlipV2Layout {
    if (layout.elements.some(e => e.type === 'splits')) return layout;
    return { ...layout, elements: [...layout.elements, makeSplitsElement(layout.canvasWidth, layout.canvasHeight)] };
}

function makeImageElement(imageData: string, canvasW: number, canvasH: number): ESlipV2Element {
    const w = Math.min(200, canvasW - 40);
    const h = Math.min(200, canvasH - 40);
    return {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'image', field: 'static', staticText: '',
        x: Math.max(0, Math.round((canvasW - w) / 2)),
        y: Math.max(0, Math.round((canvasH - h) / 2)),
        width: w, height: h,
        fontSize: 18, fontWeight: '400', color: '#ffffff', align: 'center',
        prefix: '', suffix: '', backgroundColor: '', borderRadius: 0, opacity: 1, zIndex: 5,
        italic: false, uppercase: false, letterSpacing: 0,
        imageData, objectFit: 'cover',
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFieldValue(field: FieldKey, staticText: string, preview: boolean): string {
    if (field === 'static') return staticText;
    if (preview) return MOCK_DATA[field] ?? field;
    return `{${field}}`;
}

const RESIZE_HANDLES: { dir: ResizeDir; style: React.CSSProperties }[] = [
    { dir: 'nw', style: { top: -5, left: -5, cursor: 'nw-resize' } },
    { dir: 'n',  style: { top: -5, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
    { dir: 'ne', style: { top: -5, right: -5, cursor: 'ne-resize' } },
    { dir: 'e',  style: { top: '50%', right: -5, transform: 'translateY(-50%)', cursor: 'e-resize' } },
    { dir: 'se', style: { bottom: -5, right: -5, cursor: 'se-resize' } },
    { dir: 's',  style: { bottom: -5, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
    { dir: 'sw', style: { bottom: -5, left: -5, cursor: 'sw-resize' } },
    { dir: 'w',  style: { top: '50%', left: -5, transform: 'translateY(-50%)', cursor: 'w-resize' } },
];

// ─── Drag Slider (pointer-event based, supports click + hold-and-drag) ───────

function DragSlider({ min, max, step = 1, value, onChange, color = '#8b5cf6', trackBackground }: {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (v: number) => void;
    color?: string;
    trackBackground?: string;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    // Always-fresh ref to onChange so window listeners use the latest closure.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const updateFromClientX = (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        let v = min + pct * (max - min);
        v = Math.round(v / step) * step;
        v = Math.max(min, Math.min(max, v));
        // Avoid float drift (e.g. 0.05 step → 0.150000000002)
        const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        if (decimals > 0) v = Number(v.toFixed(decimals));
        onChangeRef.current(v);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        // Don't stop propagation needlessly — but DO prevent default so the browser
        // doesn't start text-selection / native drag while the user is scrubbing.
        e.preventDefault();
        updateFromClientX(e.clientX);

        const onMove = (ev: PointerEvent) => {
            ev.preventDefault();
            updateFromClientX(ev.clientX);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            style={{
                position: 'relative',
                height: 22,
                width: '100%',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none',
            }}
        >
            <div style={{
                position: 'absolute', left: 0, right: 0, top: '50%', height: 8, marginTop: -4,
                background: trackBackground || '#e2e8f0', borderRadius: 4, pointerEvents: 'none',
            }} />
            {!trackBackground && (
                <div style={{
                    position: 'absolute', left: 0, top: '50%', height: 8, marginTop: -4,
                    width: `${pct}%`, background: color, borderRadius: 4, pointerEvents: 'none',
                }} />
            )}
            <div style={{
                position: 'absolute', left: `${pct}%`, top: '50%',
                width: 18, height: 18, marginLeft: -9, marginTop: -9,
                borderRadius: '50%', background: '#fff',
                border: `2px solid ${color}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
            }} />
        </div>
    );
}

// ─── Drag Color Picker (Hue + Saturation + Lightness sliders, all draggable) ─

function hexToHsl(hex: string): { h: number; s: number; l: number } {
    let h = 0, s = 0, l = 0;
    const m = (hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return { h: 0, s: 0, l: 100 };
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function DragColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    // Only parse hex; if rgba/named, fall back to a neutral default but keep raw text editable.
    const isHex = /^#[a-f\d]{6}$/i.test(value || '');
    const hsl = isHex ? hexToHsl(value) : { h: 0, s: 0, l: 100 };

    const setHsl = (patch: Partial<{ h: number; s: number; l: number }>) => {
        const next = { ...hsl, ...patch };
        onChange(hslToHex(next.h, next.s, next.l));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={isHex ? value : '#ffffff'} onChange={e => onChange(e.target.value)} />
                <input value={value} onChange={e => onChange(e.target.value)}
                    style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
            <div title="Hue" style={{ paddingTop: 2 }}>
                <DragSlider
                    min={0} max={360} value={hsl.h}
                    onChange={v => setHsl({ h: v })}
                    color="#0f172a"
                    trackBackground="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
                />
            </div>
            <div title="Saturation">
                <DragSlider
                    min={0} max={100} value={hsl.s}
                    onChange={v => setHsl({ s: v })}
                    color="#0f172a"
                    trackBackground={`linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`}
                />
            </div>
            <div title="Lightness">
                <DragSlider
                    min={0} max={100} value={hsl.l}
                    onChange={v => setHsl({ l: v })}
                    color="#0f172a"
                    trackBackground={`linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)`}
                />
            </div>
        </div>
    );
}

// ─── Main Editor Component ────────────────────────────────────────────────────

export default function ESlip2EditorPage() {
    const router = useRouter();
    const { token } = useAuth();
    const [campaign, setCampaign] = useState<{ _id: string; name: string } | null>(null);
    const [layout, setLayout] = useState<ESlipV2Layout>(() => ensureSplitsElement(defaultLayout()));
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [preview, setPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [scale, setScale] = useState(0.8);
    const [bgTab, setBgTab] = useState<'color' | 'image'>('color');
    const [templates, setTemplates] = useState<ESlipV2Template[]>([]);
    const [templateMsg, setTemplateMsg] = useState<string | null>(null);
    const templateImportRef = useRef<HTMLInputElement>(null);

    const canvasRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const layoutRef = useRef(layout);
    layoutRef.current = layout;

    // ── History (undo/redo) ──
    const historyRef = useRef<{ past: ESlipV2Layout[]; future: ESlipV2Layout[]; lastTs: number }>({ past: [], future: [], lastTs: 0 });
    const snapshot = useCallback(() => {
        const before = JSON.parse(JSON.stringify(layoutRef.current)) as ESlipV2Layout;
        const h = historyRef.current;
        // Coalesce rapid snapshots (within 350ms) — replace last entry instead of pushing
        const now = Date.now();
        if (h.past.length > 0 && now - h.lastTs < 350) {
            // skip; keep the older "before" state which is more useful for undo
        } else {
            h.past.push(before);
            if (h.past.length > 100) h.past.shift();
        }
        h.future = [];
        h.lastTs = now;
    }, []);
    const undo = useCallback(() => {
        const h = historyRef.current;
        if (h.past.length === 0) return;
        const prev = h.past.pop()!;
        h.future.unshift(JSON.parse(JSON.stringify(layoutRef.current)));
        if (h.future.length > 100) h.future.pop();
        setLayout(prev);
        setSelectedId(null);
    }, []);
    const redo = useCallback(() => {
        const h = historyRef.current;
        if (h.future.length === 0) return;
        const next = h.future.shift()!;
        h.past.push(JSON.parse(JSON.stringify(layoutRef.current)));
        setLayout(next);
        setSelectedId(null);
    }, []);

    // Load campaign + saved layout
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured?full=true');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    if (data.eslipV2Layout?.elements?.length) {
                        setLayout(ensureSplitsElement(data.eslipV2Layout as ESlipV2Layout));
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Auto-compute scale to fit canvas in container
    useEffect(() => {
        const update = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth - 32;
            setScale(Math.min(1, w / layout.canvasWidth));
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [layout.canvasWidth]);

    // Global pointer move/up for drag & resize
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const ds = dragRef.current;
            if (!ds) return;
            e.preventDefault();
            const dx = (e.clientX - ds.startX) / scale;
            const dy = (e.clientY - ds.startY) / scale;

            setLayout(prev => {
                const els = prev.elements.map(el => {
                    if (el.id !== ds.elemId) return el;
                    if (ds.type === 'move') {
                        return {
                            ...el,
                            x: Math.max(0, Math.min(prev.canvasWidth - el.width, ds.origX + dx)),
                            y: Math.max(0, Math.min(prev.canvasHeight - el.height, ds.origY + dy)),
                        };
                    }
                    // resize
                    let { origX: x, origY: y, origW: w, origH: h } = ds;
                    const minSize = 20;
                    switch (ds.dir) {
                        case 'e':  w = Math.max(minSize, ds.origW + dx); break;
                        case 'w':  x = ds.origX + dx; w = Math.max(minSize, ds.origW - dx); break;
                        case 's':  h = Math.max(minSize, ds.origH + dy); break;
                        case 'n':  y = ds.origY + dy; h = Math.max(minSize, ds.origH - dy); break;
                        case 'se': w = Math.max(minSize, ds.origW + dx); h = Math.max(minSize, ds.origH + dy); break;
                        case 'sw': x = ds.origX + dx; w = Math.max(minSize, ds.origW - dx); h = Math.max(minSize, ds.origH + dy); break;
                        case 'ne': w = Math.max(minSize, ds.origW + dx); y = ds.origY + dy; h = Math.max(minSize, ds.origH - dy); break;
                        case 'nw': x = ds.origX + dx; w = Math.max(minSize, ds.origW - dx); y = ds.origY + dy; h = Math.max(minSize, ds.origH - dy); break;
                    }
                    return { ...el, x, y, width: w, height: h };
                });
                return { ...prev, elements: els };
            });
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [scale]);

    const startMove = useCallback((e: React.PointerEvent, elemId: string) => {
        e.stopPropagation();
        const el = layoutRef.current.elements.find(el => el.id === elemId)!;
        setSelectedId(elemId);
        snapshot();
        dragRef.current = {
            type: 'move', elemId,
            startX: e.clientX, startY: e.clientY,
            origX: el.x, origY: el.y, origW: el.width, origH: el.height,
        };
    }, [snapshot]);

    const startResize = useCallback((e: React.PointerEvent, elemId: string, dir: ResizeDir) => {
        e.stopPropagation();
        e.preventDefault();
        const el = layoutRef.current.elements.find(el => el.id === elemId)!;
        snapshot();
        dragRef.current = {
            type: 'resize', elemId, dir,
            startX: e.clientX, startY: e.clientY,
            origX: el.x, origY: el.y, origW: el.width, origH: el.height,
        };
    }, [snapshot]);

    const addElement = (field: FieldKey, staticText: string) => {
        snapshot();
        const el = makeElement(field, staticText);
        setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
        setSelectedId(el.id);
    };

    const addSplitsElement = useCallback(() => {
        snapshot();
        const cur = layoutRef.current;
        const el = makeSplitsElement(cur.canvasWidth, cur.canvasHeight);
        setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
        setSelectedId(el.id);
    }, [snapshot]);

    const addImageElement = useCallback((dataUrl: string) => {
        snapshot();
        const cur = layoutRef.current;
        const el = makeImageElement(dataUrl, cur.canvasWidth, cur.canvasHeight);
        // Try to fit aspect ratio
        const img = new window.Image();
        img.onload = () => {
            const aspect = img.naturalWidth / img.naturalHeight;
            let w = el.width;
            let h = el.height;
            if (aspect > 1) {
                h = Math.round(w / aspect);
            } else {
                w = Math.round(h * aspect);
            }
            const fitted = { ...el, width: w, height: h, x: Math.round((cur.canvasWidth - w) / 2), y: Math.round((cur.canvasHeight - h) / 2) };
            setLayout(prev => ({ ...prev, elements: [...prev.elements, fitted] }));
            setSelectedId(fitted.id);
        };
        img.onerror = () => {
            setLayout(prev => ({ ...prev, elements: [...prev.elements, el] }));
            setSelectedId(el.id);
        };
        img.src = dataUrl;
    }, [snapshot]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => addImageElement(reader.result as string);
        reader.readAsDataURL(file);
    };

    const deleteSelected = useCallback(() => {
        setSelectedId(curId => {
            if (!curId) return curId;
            snapshot();
            setLayout(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== curId) }));
            return null;
        });
    }, [snapshot]);

    const duplicateSelected = useCallback(() => {
        const id = selectedId;
        if (!id) return;
        snapshot();
        const cur = layoutRef.current;
        const src = cur.elements.find(el => el.id === id);
        if (!src) return;
        const clone: ESlipV2Element = {
            ...src,
            id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: Math.min(cur.canvasWidth - src.width, src.x + 12),
            y: Math.min(cur.canvasHeight - src.height, src.y + 12),
        };
        setLayout(prev => ({ ...prev, elements: [...prev.elements, clone] }));
        setSelectedId(clone.id);
    }, [selectedId, snapshot]);

    const nudgeSelected = useCallback((dx: number, dy: number) => {
        const id = selectedId;
        if (!id) return;
        snapshot();
        setLayout(prev => ({
            ...prev,
            elements: prev.elements.map(el => {
                if (el.id !== id) return el;
                const x = Math.max(0, Math.min(prev.canvasWidth - el.width, el.x + dx));
                const y = Math.max(0, Math.min(prev.canvasHeight - el.height, el.y + dy));
                return { ...el, x, y };
            }),
        }));
    }, [selectedId, snapshot]);

    // Keyboard shortcuts — Canva-style
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const inField = t ? (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t as HTMLElement).isContentEditable) : false;
            const mod = e.metaKey || e.ctrlKey;

            // Undo / Redo work even when no element is selected
            if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                if (inField) return;
                e.preventDefault();
                undo();
                return;
            }
            if (mod && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
                if (inField) return;
                e.preventDefault();
                redo();
                return;
            }

            // Element-targeting shortcuts
            if (inField) return;

            // Delete
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
                e.preventDefault();
                deleteSelected();
                return;
            }
            // Duplicate
            if (mod && (e.key === 'd' || e.key === 'D') && selectedId) {
                e.preventDefault();
                duplicateSelected();
                return;
            }
            // Arrow-key nudge (Shift = 10px)
            if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const step = e.shiftKey ? 10 : 1;
                e.preventDefault();
                if (e.key === 'ArrowUp')    nudgeSelected(0, -step);
                if (e.key === 'ArrowDown')  nudgeSelected(0,  step);
                if (e.key === 'ArrowLeft')  nudgeSelected(-step, 0);
                if (e.key === 'ArrowRight') nudgeSelected(step,  0);
                return;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, deleteSelected, duplicateSelected, nudgeSelected, undo, redo]);

    // Paste an image from the clipboard onto the canvas
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it.kind === 'file' && it.type.startsWith('image/')) {
                    const file = it.getAsFile();
                    if (!file) continue;
                    e.preventDefault();
                    const reader = new FileReader();
                    reader.onload = () => addImageElement(reader.result as string);
                    reader.readAsDataURL(file);
                    return;
                }
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [addImageElement]);

    const updateElement = (id: string, patch: Partial<ESlipV2Element>) => {
        snapshot();
        setLayout(prev => ({
            ...prev,
            elements: prev.elements.map(el => el.id === id ? { ...el, ...patch } : el),
        }));
    };

    const moveLayer = (id: string, dir: 'up' | 'down') => {
        snapshot();
        setLayout(prev => {
            const idx = prev.elements.findIndex(el => el.id === id);
            if (idx < 0) return prev;
            const arr = [...prev.elements];
            if (dir === 'up' && idx < arr.length - 1) {
                [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
            } else if (dir === 'down' && idx > 0) {
                [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
            }
            return { ...prev, elements: arr };
        });
    };

    const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            snapshot();
            setLayout(prev => ({ ...prev, background: { ...prev.background, type: 'image', imageData: reader.result as string } }));
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        if (!campaign?._id) {
            setSaveError('ไม่พบ Campaign — กรุณากดดาวเลือกกิจกรรมก่อน');
            return;
        }
        // Use token from context first, fallback to localStorage
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!activeToken) {
            setSaveError('ไม่พบ session — กรุณา logout แล้ว login ใหม่');
            return;
        }
        setSaving(true);
        setSaved(false);
        setSaveError(null);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeToken}`,
                },
                body: JSON.stringify({ eslipV2Layout: layout, eslipMode: 'v2' }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 4000);
            } else if (res.status === 401) {
                // Clear stale token and redirect to login
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                }
                setSaveError('Session หมดอายุ — กำลัง redirect ไปหน้า login...');
                setTimeout(() => router.push('/login'), 1500);
            } else if (res.status === 403) {
                setSaveError('ไม่มีสิทธิ์ — เฉพาะ admin เท่านั้น');
            } else {
                const errText = await res.text().catch(() => `HTTP ${res.status}`);
                setSaveError(`บันทึกไม่สำเร็จ: ${res.status} — ${errText.slice(0, 120)}`);
            }
        } catch (err: any) {
            setSaveError(`เกิดข้อผิดพลาด: ${err?.message || err}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Templates (localStorage, reusable across events) ──
    useEffect(() => { setTemplates(loadTemplates()); }, []);

    const flashTemplateMsg = (msg: string) => {
        setTemplateMsg(msg);
        setTimeout(() => setTemplateMsg(null), 3000);
    };

    const saveAsTemplate = () => {
        const name = window.prompt('ตั้งชื่อเทมเพลต:', campaign?.name || 'E-Slip Template');
        if (!name || !name.trim()) return;
        const tpl: ESlipV2Template = {
            id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim(),
            savedAt: Date.now(),
            layout: JSON.parse(JSON.stringify(layoutRef.current)),
        };
        const next = [tpl, ...templates];
        setTemplates(next);
        persistTemplates(next);
        flashTemplateMsg('✓ บันทึกเทมเพลตแล้ว');
    };

    const applyTemplate = (tpl: ESlipV2Template) => {
        snapshot();
        setLayout(ensureSplitsElement(JSON.parse(JSON.stringify(tpl.layout))));
        setSelectedId(null);
        flashTemplateMsg(`✓ โหลดเทมเพลต "${tpl.name}" แล้ว (อย่าลืมกดบันทึก)`);
    };

    const deleteTemplate = (id: string) => {
        const next = templates.filter(t => t.id !== id);
        setTemplates(next);
        persistTemplates(next);
    };

    const exportTemplate = () => {
        const payload = { kind: 'rfid-eslip2-template', version: 1, layout: layoutRef.current };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safe = (campaign?.name || 'eslip2-template').replace(/[^a-z0-9ก-๙_-]+/gi, '-').slice(0, 60);
        link.download = `eslip2-template-${safe}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        flashTemplateMsg('✓ ดาวน์โหลดเทมเพลตแล้ว');
    };

    const importTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;
        try {
            const json = JSON.parse(await file.text());
            if (json?.kind !== 'rfid-eslip2-template' || !json?.layout?.elements) {
                flashTemplateMsg('✕ ไฟล์เทมเพลตไม่ถูกต้อง');
                return;
            }
            snapshot();
            setLayout(ensureSplitsElement(json.layout as ESlipV2Layout));
            setSelectedId(null);
            flashTemplateMsg('✓ นำเข้าเทมเพลตแล้ว (อย่าลืมกดบันทึก)');
        } catch {
            flashTemplateMsg('✕ อ่านไฟล์เทมเพลตไม่ได้');
        }
    };

    const selectedEl = layout.elements.find(el => el.id === selectedId) ?? null;

    // ─── Canvas background ──────────────────────────────────────────────────
    const isImageBg = layout.background.type === 'image' && !!layout.background.imageData;
    const bgImageOpacity = layout.background.imageOpacity ?? 1;

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'E-Slip', href: '/admin/eslip', labelEn: 'E-Slip' }, { label: 'E-Slip 2 Editor', labelEn: 'E-Slip 2 Editor' }]}>
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'E-Slip', href: '/admin/eslip', labelEn: 'E-Slip' }, { label: 'E-Slip 2 Editor', labelEn: 'E-Slip 2 Editor' }]}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .eslip2-elem:hover { outline: 1px dashed rgba(139,92,246,0.5); }
                input[type=color] { width: 32px; height: 32px; padding: 2px; border-radius: 6px; border: 1px solid #e2e8f0; cursor: pointer; }
            `}</style>

            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', fontFamily: "'Prompt', sans-serif" }}>

                {/* Top bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => router.push('/admin/eslip')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
                        ← กลับ
                    </button>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}>🎨 E-Slip 2 Editor</span>
                    {campaign && <span style={{ fontSize: 12, color: '#94a3b8' }}>{campaign.name}</span>}
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                        <button type="button" onClick={undo} title="Undo (Ctrl/Cmd+Z)"
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontFamily: 'inherit' }}>↶</button>
                        <button type="button" onClick={redo} title="Redo (Ctrl/Cmd+Y)"
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontFamily: 'inherit' }}>↷</button>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#64748b', userSelect: 'none' }}>
                            <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />
                            Preview Mode
                        </label>
                        <button type="button" onClick={handleSave} disabled={saving} style={{
                            padding: '8px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                            background: saving ? '#94a3b8' : '#7c3aed', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer',
                        }}>
                            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
                        </button>
                        {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓ บันทึกแล้ว</span>}
                        {saveError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', maxWidth: 280 }}>{saveError}</span>
                                {(saveError.includes('Session') || saveError.includes('login')) && (
                                    <button type="button" onClick={() => router.push('/login')}
                                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                                        → Login ใหม่
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Editor body */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* ── Left panel ── */}
                    <div style={{ width: 220, borderRight: '1px solid #e2e8f0', background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>

                        {/* Background */}
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>พื้นหลัง</div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                {(['color', 'image'] as const).map(t => (
                                    <button type="button" key={t} onClick={() => { setBgTab(t); setLayout(prev => ({ ...prev, background: { ...prev.background, type: t } })); }}
                                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: bgTab === t ? '#8b5cf6' : '#e2e8f0', color: bgTab === t ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
                                        {t === 'color' ? '🎨 สี' : '🖼 รูป'}
                                    </button>
                                ))}
                            </div>
                            {bgTab === 'color' && (
                                <DragColorPicker
                                    value={layout.background.color}
                                    onChange={(v) => { snapshot(); setLayout(prev => ({ ...prev, background: { ...prev.background, color: v } })); }}
                                />
                            )}
                            {bgTab === 'image' && (
                                <div>
                                    <label style={{ display: 'block', padding: '8px 0', fontSize: 12, cursor: 'pointer', color: '#7c3aed', textDecoration: 'underline' }}>
                                        📁 เลือกรูปภาพ
                                        <input type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
                                    </label>
                                    {layout.background.imageData && (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <img src={layout.background.imageData} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                                                <button type="button" onClick={() => { snapshot(); setLayout(prev => ({ ...prev, background: { ...prev.background, imageData: '' } })); }}
                                                    style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>ลบ</button>
                                            </div>
                                            <div style={{ marginTop: 10 }}>
                                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>ความเข้มรูป (Opacity)</div>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <DragSlider
                                                            min={0} max={100}
                                                            value={Math.round(((layout.background.imageOpacity ?? 1) * 100))}
                                                            onChange={(v) => {
                                                                snapshot();
                                                                setLayout(prev => ({ ...prev, background: { ...prev.background, imageOpacity: v / 100 } }));
                                                            }}
                                                        />
                                                    </div>
                                                    <input
                                                        type="number" min={0} max={100} step={1}
                                                        value={Math.round(((layout.background.imageOpacity ?? 1) * 100))}
                                                        onChange={e => {
                                                            const v = Math.max(0, Math.min(100, Number(e.target.value)));
                                                            snapshot();
                                                            setLayout(prev => ({ ...prev, background: { ...prev.background, imageOpacity: v / 100 } }));
                                                        }}
                                                        style={{ width: 52, fontSize: 12, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit' }}
                                                    />
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Canvas size */}
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>ขนาด Canvas</div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <label style={{ fontSize: 12, color: '#64748b', width: 20 }}>W</label>
                                <input type="number" value={layout.canvasWidth} onChange={e => setLayout(prev => ({ ...prev, canvasWidth: Number(e.target.value) }))}
                                    style={{ width: '100%', fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                                <label style={{ fontSize: 12, color: '#64748b', width: 20 }}>H</label>
                                <input type="number" value={layout.canvasHeight} onChange={e => setLayout(prev => ({ ...prev, canvasHeight: Number(e.target.value) }))}
                                    style={{ width: '100%', fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit' }} />
                            </div>
                        </div>

                        {/* Templates */}
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🧩 เทมเพลต</div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <button type="button" onClick={saveAsTemplate}
                                    style={{ flex: 1, padding: '7px 6px', borderRadius: 8, fontSize: 11, cursor: 'pointer', border: '1px dashed #7c3aed', background: '#f5f3ff', color: '#7c3aed', fontFamily: 'inherit', fontWeight: 700 }}>
                                    💾 บันทึกเป็นเทมเพลต
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <button type="button" onClick={exportTemplate}
                                    style={{ flex: 1, padding: '6px 6px', borderRadius: 8, fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontFamily: 'inherit', fontWeight: 600 }}>
                                    ⬇ Export
                                </button>
                                <label style={{ flex: 1, textAlign: 'center', padding: '6px 6px', borderRadius: 8, fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontFamily: 'inherit', fontWeight: 600 }}>
                                    ⬆ Import
                                    <input ref={templateImportRef} type="file" accept="application/json,.json" className="hidden" onChange={importTemplate} />
                                </label>
                            </div>
                            {templateMsg && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: templateMsg.startsWith('✕') ? '#ef4444' : '#16a34a', marginBottom: 8 }}>{templateMsg}</div>
                            )}
                            {templates.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {templates.map(t => (
                                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <button type="button" onClick={() => applyTemplate(t)} title="โหลดเทมเพลตนี้"
                                                style={{ flex: 1, textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                🧩 {t.name}
                                            </button>
                                            <button type="button" onClick={() => deleteTemplate(t.id)} title="ลบเทมเพลต"
                                                style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid #fecaca', background: '#fff5f5', color: '#ef4444', fontFamily: 'inherit' }}>🗑</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {templates.length === 0 && (
                                <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>ยังไม่มีเทมเพลตที่บันทึกไว้ — ออกแบบเสร็จแล้วกด “บันทึกเป็นเทมเพลต” เพื่อใช้ซ้ำในงานอื่น</div>
                            )}
                        </div>

                        {/* Add element palette */}
                        <div style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>เพิ่ม Element</div>
                            <label style={{
                                display: 'block', textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                                border: '1px dashed #8b5cf6', background: '#f5f3ff', color: '#7c3aed', fontFamily: 'inherit', marginBottom: 8, fontWeight: 700,
                            }}>
                                🖼 อัปโหลดรูปภาพ
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>
                            <button type="button" onClick={addSplitsElement}
                                style={{ width: '100%', display: 'block', textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px dashed #16a34a', background: '#f0fdf4', color: '#15803d', fontFamily: 'inherit', marginBottom: 8, fontWeight: 700 }}>
                                📊 เพิ่มตาราง Checkpoint Splits
                            </button>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                                Ctrl/Cmd+V วางรูป • Ctrl/Cmd+Z undo • Ctrl/Cmd+Y redo • Ctrl/Cmd+D duplicate • ลูกศร = ขยับ 1px (Shift+ลูกศร = 10px) • Backspace = ลบ
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {FIELD_PALETTE.map(p => (
                                    <button type="button" key={p.field} onClick={() => addElement(p.field, p.defaultText)}
                                        style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontFamily: 'inherit', transition: '0.15s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#8b5cf6'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; }}
                                    >
                                        + {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Canvas area ── */}
                    <div ref={containerRef} style={{ flex: 1, overflow: 'auto', background: '#334155', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 }}
                        onPointerDown={() => setSelectedId(null)}>
                        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', lineHeight: 1 }}>
                            <div
                                ref={canvasRef}
                                style={{
                                    position: 'relative',
                                    width: layout.canvasWidth,
                                    height: layout.canvasHeight,
                                    backgroundColor: isImageBg ? '#000' : layout.background.color,
                                    overflow: 'hidden',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                                    borderRadius: 20,
                                    cursor: 'default',
                                    userSelect: 'none',
                                }}
                            >
                                {isImageBg && (
                                    <div
                                        style={{
                                            position: 'absolute', inset: 0,
                                            backgroundImage: `url(${layout.background.imageData})`,
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            opacity: bgImageOpacity,
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}
                                {layout.elements.map(el => {
                                    const isSelected = el.id === selectedId && !preview;
                                    const isImage = el.type === 'image';
                                    const isSplits = el.type === 'splits';
                                    const displayText = (isImage || isSplits) ? '' : el.prefix + getFieldValue(el.field, el.staticText, preview) + el.suffix;
                                    return (
                                        <div
                                            key={el.id}
                                            className="eslip2-elem"
                                            onPointerDown={preview ? undefined : (e) => startMove(e, el.id)}
                                            style={{
                                                position: 'absolute',
                                                left: el.x, top: el.y,
                                                width: el.width, height: el.height,
                                                fontSize: el.fontSize,
                                                fontWeight: el.fontWeight,
                                                color: el.color,
                                                textAlign: el.align,
                                                fontStyle: el.italic ? 'italic' : 'normal',
                                                textTransform: el.uppercase ? 'uppercase' : 'none',
                                                letterSpacing: el.letterSpacing,
                                                backgroundColor: (isImage || isSplits) ? 'transparent' : (el.backgroundColor || 'transparent'),
                                                borderRadius: el.borderRadius,
                                                opacity: el.opacity,
                                                zIndex: el.zIndex,
                                                display: 'flex', alignItems: isSplits ? 'stretch' : 'center', justifyContent:
                                                    isSplits ? 'stretch' : (el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start'),
                                                cursor: preview ? 'default' : 'move',
                                                outline: isSelected ? '2px solid #8b5cf6' : 'none',
                                                outlineOffset: 1,
                                                padding: (isImage || isSplits) ? 0 : '0 4px',
                                                overflow: 'hidden',
                                                whiteSpace: isSplits ? 'normal' : 'nowrap',
                                                fontFamily: "'Prompt', sans-serif",
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            {isImage && el.imageData ? (
                                                <img
                                                    src={el.imageData}
                                                    alt=""
                                                    draggable={false}
                                                    style={{
                                                        width: '100%', height: '100%',
                                                        objectFit: el.objectFit || 'cover',
                                                        borderRadius: el.borderRadius,
                                                        pointerEvents: 'none',
                                                        userSelect: 'none',
                                                    }}
                                                />
                                            ) : isSplits ? (
                                                <SplitsTableElement el={el} rows={MOCK_SPLITS_ROWS} />
                                            ) : displayText}

                                            {/* Resize handles */}
                                            {isSelected && RESIZE_HANDLES.map(h => (
                                                <div
                                                    key={h.dir}
                                                    onPointerDown={(e) => startResize(e, el.id, h.dir)}
                                                    style={{
                                                        position: 'absolute',
                                                        width: 10, height: 10,
                                                        background: '#fff',
                                                        border: '2px solid #8b5cf6',
                                                        borderRadius: 2,
                                                        zIndex: 100,
                                                        ...h.style,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── Right panel: Properties ── */}
                    <div style={{ width: 260, borderLeft: '1px solid #e2e8f0', background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>
                        {selectedEl ? (
                            <PropertiesPanel
                                el={selectedEl}
                                update={(patch) => updateElement(selectedEl.id, patch)}
                                onDelete={deleteSelected}
                                onMoveLayer={(dir) => moveLayer(selectedEl.id, dir)}
                            />
                        ) : (
                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>☝️</div>
                                คลิกที่ element บน canvas เพื่อแก้ไข properties
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}

// ─── Properties Panel ──────────────────────────────────────────────────────────

function PropertiesPanel({ el, update, onDelete, onMoveLayer }: {
    el: ESlipV2Element;
    update: (patch: Partial<ESlipV2Element>) => void;
    onDelete: () => void;
    onMoveLayer: (dir: 'up' | 'down') => void;
}) {
    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', width: 80, flexShrink: 0, textAlign: 'right' }}>{label}</label>
            <div style={{ flex: 1 }}>{children}</div>
        </div>
    );

    const inp = (style?: React.CSSProperties): React.CSSProperties => ({
        width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e2e8f0',
        borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box', ...style,
    });

    const isImage = el.type === 'image';
    const isSplits = el.type === 'splits';

    return (
        <div style={{ padding: '14px 14px', fontFamily: "'Prompt', sans-serif" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Properties — {isSplits ? 'Checkpoint Splits' : isImage ? 'Image' : el.field === 'static' ? 'Static Text' : el.field}
            </div>

            {/* Splits headers */}
            {isSplits && (
                <>
                    <Row label="หัวคอลัมน์ 1">
                        <input value={el.header1 || ''} onChange={e => update({ header1: e.target.value })} style={inp()} placeholder="CHECKPOINT" />
                    </Row>
                    <Row label="หัวคอลัมน์ 2">
                        <input value={el.header2 || ''} onChange={e => update({ header2: e.target.value })} style={inp()} placeholder="TIME" />
                    </Row>
                    <Row label="หัวคอลัมน์ 3">
                        <input value={el.header3 || ''} onChange={e => update({ header3: e.target.value })} style={inp()} placeholder="PACE" />
                    </Row>
                    <Row label="ระยะห่างแถว">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <DragSlider min={0} max={20} value={el.rowGap ?? 6} onChange={(v) => update({ rowGap: v })} />
                            </div>
                            <span style={{ fontSize: 12, color: '#374151', width: 24 }}>{el.rowGap ?? 6}</span>
                        </div>
                    </Row>
                    <Row label="ระยะห่างคอลัมน์">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <DragSlider min={0} max={20} value={el.colGap ?? 4} onChange={(v) => update({ colGap: v })} />
                            </div>
                            <span style={{ fontSize: 12, color: '#374151', width: 24 }}>{el.colGap ?? 4}</span>
                        </div>
                    </Row>
                    <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />
                </>
            )}

            {/* Image preview */}
            {isImage && el.imageData && (
                <div style={{ marginBottom: 12, padding: 8, background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={el.imageData} alt="" style={{ width: '100%', maxHeight: 100, objectFit: 'contain', display: 'block' }} />
                </div>
            )}

            {/* Image fit */}
            {isImage && (
                <Row label="Fit">
                    <select value={el.objectFit || 'cover'} onChange={e => update({ objectFit: e.target.value as 'cover' | 'contain' | 'fill' })} style={inp()}>
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fill">Fill</option>
                    </select>
                </Row>
            )}

            {/* Static text input */}
            {!isImage && !isSplits && el.field === 'static' && (
                <Row label="ข้อความ">
                    <input value={el.staticText} onChange={e => update({ staticText: e.target.value })} style={inp()} />
                </Row>
            )}

            {/* Field */}
            {!isImage && !isSplits && (
                <Row label="Field">
                    <select value={el.field} onChange={e => update({ field: e.target.value as FieldKey })} style={inp()}>
                        {FIELD_PALETTE.map(p => <option key={p.field} value={p.field}>{p.label}</option>)}
                    </select>
                </Row>
            )}

            {/* Prefix / Suffix */}
            {!isImage && !isSplits && (
                <>
                    <Row label="Prefix">
                        <input value={el.prefix} onChange={e => update({ prefix: e.target.value })} style={inp()} placeholder="BIB " />
                    </Row>
                    <Row label="Suffix">
                        <input value={el.suffix} onChange={e => update({ suffix: e.target.value })} style={inp()} placeholder=" km" />
                    </Row>
                </>
            )}

            <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

            {/* Position */}
            <Row label="X">
                <input type="number" value={Math.round(el.x)} onChange={e => update({ x: Number(e.target.value) })} style={inp()} />
            </Row>
            <Row label="Y">
                <input type="number" value={Math.round(el.y)} onChange={e => update({ y: Number(e.target.value) })} style={inp()} />
            </Row>
            <Row label="Width">
                <input type="number" value={Math.round(el.width)} onChange={e => update({ width: Number(e.target.value) })} style={inp()} />
            </Row>
            <Row label="Height">
                <input type="number" value={Math.round(el.height)} onChange={e => update({ height: Number(e.target.value) })} style={inp()} />
            </Row>

            <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

            {/* Font size */}
            {!isImage && <Row label="Font Size">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <DragSlider min={8} max={80} value={el.fontSize} onChange={(v) => update({ fontSize: v })} />
                    </div>
                    <span style={{ fontSize: 12, color: '#374151', width: 24 }}>{el.fontSize}</span>
                </div>
            </Row>}

            {/* Font weight */}
            {!isImage && <Row label="Weight">
                <select value={el.fontWeight} onChange={e => update({ fontWeight: e.target.value })} style={inp()}>
                    {['400', '500', '600', '700', '800', '900'].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
            </Row>}

            {/* Text color */}
            {!isImage && <Row label="สีตัวอักษร">
                <DragColorPicker value={el.color} onChange={(v) => update({ color: v })} />
            </Row>}

            {/* Align */}
            {!isImage && !isSplits && <Row label="Align">
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['left', 'center', 'right'] as const).map(a => (
                        <button type="button" key={a} onClick={() => update({ align: a })}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 14, cursor: 'pointer', background: el.align === a ? '#8b5cf6' : '#e2e8f0', color: el.align === a ? '#fff' : '#374151', fontFamily: 'inherit' }}>
                            {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                        </button>
                    ))}
                </div>
            </Row>}

            {/* Style toggles */}
            {!isImage && <Row label="Style">
                <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => update({ italic: !el.italic })}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', background: el.italic ? '#8b5cf6' : '#e2e8f0', color: el.italic ? '#fff' : '#374151', fontStyle: 'italic', fontFamily: 'inherit' }}>I</button>
                    <button type="button" onClick={() => update({ uppercase: !el.uppercase })}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', background: el.uppercase ? '#8b5cf6' : '#e2e8f0', color: el.uppercase ? '#fff' : '#374151', fontFamily: 'inherit' }}>AA</button>
                </div>
            </Row>}

            {/* Letter spacing */}
            {!isImage && <Row label="Spacing">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <DragSlider min={0} max={20} value={el.letterSpacing} onChange={(v) => update({ letterSpacing: v })} />
                    </div>
                    <span style={{ fontSize: 12, color: '#374151', width: 24 }}>{el.letterSpacing}</span>
                </div>
            </Row>}

            {!isImage && <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />}

            {/* Background color */}
            {!isImage && !isSplits && <Row label="BG สี">
                <DragColorPicker value={el.backgroundColor || '#ffffff'} onChange={(v) => update({ backgroundColor: v })} />
            </Row>}

            {/* Border radius */}
            <Row label="Radius">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <DragSlider min={0} max={100} value={el.borderRadius} onChange={(v) => update({ borderRadius: v })} />
                    </div>
                    <span style={{ fontSize: 12, color: '#374151', width: 24 }}>{el.borderRadius}</span>
                </div>
            </Row>

            {/* Opacity */}
            <Row label="Opacity">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <DragSlider min={0} max={1} step={0.05} value={el.opacity} onChange={(v) => update({ opacity: v })} />
                    </div>
                    <span style={{ fontSize: 12, color: '#374151', width: 32 }}>{Math.round(el.opacity * 100)}%</span>
                </div>
            </Row>

            <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

            {/* Layer controls */}
            <Row label="Layer">
                <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => onMoveLayer('up')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>↑ ขึ้น</button>
                    <button type="button" onClick={() => onMoveLayer('down')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>↓ ลง</button>
                </div>
            </Row>

            {/* Delete */}
            <button type="button" onClick={onDelete} style={{
                width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 8, border: '1px solid #fecaca',
                background: '#fff5f5', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
                🗑 ลบ Element
            </button>
        </div>
    );
}

// ─── Splits Table Element (mock rows for editor preview) ─────────────────────

const MOCK_SPLITS_ROWS: { checkpoint: string; time: string; pace: string }[] = [
    { checkpoint: 'A1 (5 KM)',   time: '00:28:42', pace: '5:44' },
    { checkpoint: 'A2 (10 KM)',  time: '00:57:30', pace: '5:45' },
    { checkpoint: 'A3 (15 KM)',  time: '01:27:18', pace: '5:49' },
    { checkpoint: 'Finish (21 KM)', time: '02:03:55', pace: '5:54' },
];

function SplitsTableElement({ el, rows }: {
    el: ESlipV2Element;
    rows: { checkpoint: string; time: string; pace: string }[];
}) {
    const gap = el.rowGap ?? 6;
    const cgap = el.colGap ?? 4;
    const cellBase: React.CSSProperties = {
        fontSize: el.fontSize || 13,
        color: el.color || '#000',
        fontWeight: el.fontWeight || '900',
        padding: `${gap}px ${cgap}px`,
        fontFamily: "'Prompt', sans-serif",
        textTransform: el.uppercase ? 'uppercase' : 'none',
        fontStyle: el.italic ? 'italic' : 'normal',
        letterSpacing: el.letterSpacing || 0,
    };
    const headBase: React.CSSProperties = { ...cellBase, padding: `${gap + 2}px ${cgap}px` };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'transparent', pointerEvents: 'none' }}>
            <thead>
                <tr>
                    <th style={{ ...headBase, textAlign: 'left' }}>{el.header1 || 'CHECKPOINT'}</th>
                    <th style={{ ...headBase, textAlign: 'center' }}>{el.header2 || 'TIME'}</th>
                    <th style={{ ...headBase, textAlign: 'right' }}>{el.header3 || 'PACE'}</th>
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 ? (
                    <tr><td colSpan={3} style={{ ...cellBase, textAlign: 'center' }}>No checkpoint data</td></tr>
                ) : rows.map((r, i) => (
                    <tr key={i}>
                        <td style={{ ...cellBase, textAlign: 'left' }}>{r.checkpoint}</td>
                        <td style={{ ...cellBase, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.time}</td>
                        <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pace}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
