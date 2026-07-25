'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../AdminLayout';
import { useAuth } from '@/lib/auth-context';
import { DragSlider, DragColorPicker } from '@/components/editor-controls';
import {
    BIB_FIELD_PALETTE, BIB_FONTS, BIB_FONT_HREF,
    ElementContent, elementBoxStyle, isElementHidden,
    defaultBibCheck2Layout, normalizeLayout,
    makeTextElement, makeShapeElement, makePhotoElement, makeQrElement, makeImageElement,
    type BibCheck2Layout, type BibCheck2Canvas, type BibCheck2Element,
    type BibField, type Orientation, type RenderContext,
} from '@/lib/bibcheck2';

// ─── Image compression (keeps the saved JSON under the nginx 1 MB body limit) ──

function canvasToJpeg(img: HTMLImageElement, w: number, h: number, quality: number): string {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
}

async function compressImage(file: File, maxWidth: number, maxBytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const raw = reader.result as string;
            // PNGs small enough already (logos with transparency) — keep as-is.
            if (file.type === 'image/png' && raw.length <= maxBytes) return resolve(raw);
            const img = new Image();
            img.onload = () => {
                const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
                const w = Math.round(img.width * ratio);
                const h = Math.round(img.height * ratio);
                let quality = 0.72;
                let out = canvasToJpeg(img, w, h, quality);
                while (out.length > maxBytes && quality > 0.3) {
                    quality = Math.round((quality - 0.08) * 100) / 100;
                    out = canvasToJpeg(img, w, h, quality);
                }
                resolve(out);
            };
            img.onerror = () => reject(new Error('image decode failed'));
            img.src = raw;
        };
        reader.onerror = () => reject(new Error('file read failed'));
        reader.readAsDataURL(file);
    });
}

// ─── Templates (localStorage — reusable across events, same idea as E-Slip 2) ──

interface BibTemplate { id: string; name: string; savedAt: number; layout: BibCheck2Layout; }
const TEMPLATES_KEY = 'bibcheck2_templates';

function loadTemplates(): BibTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
        const arr = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}
function persistTemplates(list: BibTemplate[]) {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

// ─── Drag state ───────────────────────────────────────────────────────────────

type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const RESIZE_HANDLES: { dir: ResizeDir; style: React.CSSProperties }[] = [
    { dir: 'nw', style: { top: -6, left: -6, cursor: 'nw-resize' } },
    { dir: 'n', style: { top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
    { dir: 'ne', style: { top: -6, right: -6, cursor: 'ne-resize' } },
    { dir: 'e', style: { top: '50%', right: -6, transform: 'translateY(-50%)', cursor: 'e-resize' } },
    { dir: 'se', style: { bottom: -6, right: -6, cursor: 'se-resize' } },
    { dir: 's', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
    { dir: 'sw', style: { bottom: -6, left: -6, cursor: 'sw-resize' } },
    { dir: 'w', style: { top: '50%', left: -6, transform: 'translateY(-50%)', cursor: 'w-resize' } },
];

interface DragState {
    type: 'move' | 'resize';
    elemId: string;
    dir?: ResizeDir;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
}

const SIZE_PRESETS: { label: string; w: number; h: number; orientation: Orientation }[] = [
    { label: '1920 × 1080 (Full HD)', w: 1920, h: 1080, orientation: 'landscape' },
    { label: '1280 × 720 (HD)', w: 1280, h: 720, orientation: 'landscape' },
    { label: '1600 × 900', w: 1600, h: 900, orientation: 'landscape' },
    { label: '1080 × 1920 (Full HD)', w: 1080, h: 1920, orientation: 'portrait' },
    { label: '720 × 1280 (HD)', w: 720, h: 1280, orientation: 'portrait' },
    { label: '1080 × 1440 (3:4)', w: 1080, h: 1440, orientation: 'portrait' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BibCheck2Page() {
    const router = useRouter();
    const { token } = useAuth();

    const [campaign, setCampaign] = useState<{ _id: string; name: string; slug?: string } | null>(null);
    const [layout, setLayout] = useState<BibCheck2Layout>(() => defaultBibCheck2Layout());
    const [orientation, setOrientation] = useState<Orientation>('landscape');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [preview, setPreview] = useState(false);
    const [snapGrid, setSnapGrid] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [fitScale, setFitScale] = useState(0.4);
    const [zoom, setZoom] = useState(1);
    const [templates, setTemplates] = useState<BibTemplate[]>([]);
    const [templateMsg, setTemplateMsg] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const orientationRef = useRef(orientation);
    orientationRef.current = orientation;
    const snapRef = useRef(snapGrid);
    snapRef.current = snapGrid;

    const canvas = layout[orientation];
    const scale = fitScale * zoom;
    const scaleRef = useRef(scale);
    scaleRef.current = scale;

    // ── History ──
    const historyRef = useRef<{ past: BibCheck2Layout[]; future: BibCheck2Layout[]; lastTs: number }>({ past: [], future: [], lastTs: 0 });

    const snapshot = useCallback(() => {
        const h = historyRef.current;
        const now = Date.now();
        if (!(h.past.length > 0 && now - h.lastTs < 350)) {
            h.past.push(JSON.parse(JSON.stringify(layoutRef.current)));
            if (h.past.length > 100) h.past.shift();
        }
        h.future = [];
        h.lastTs = now;
    }, []);

    const undo = useCallback(() => {
        const h = historyRef.current;
        if (!h.past.length) return;
        const prev = h.past.pop()!;
        h.future.unshift(JSON.parse(JSON.stringify(layoutRef.current)));
        setLayout(prev);
        setSelectedId(null);
    }, []);

    const redo = useCallback(() => {
        const h = historyRef.current;
        if (!h.future.length) return;
        const next = h.future.shift()!;
        h.past.push(JSON.parse(JSON.stringify(layoutRef.current)));
        setLayout(next);
        setSelectedId(null);
    }, []);

    /** Apply a change to the currently-edited canvas only. */
    const updateCanvas = useCallback((fn: (c: BibCheck2Canvas) => BibCheck2Canvas) => {
        setLayout(prev => ({ ...prev, [orientationRef.current]: fn(prev[orientationRef.current]) }));
    }, []);

    // ── Load campaign + saved design ──
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured?full=true', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    if (data.bibCheck2Layout) setLayout(normalizeLayout(data.bibCheck2Layout));
                }
            } catch (err) {
                console.error('Failed to load campaign:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    useEffect(() => { setTemplates(loadTemplates()); }, []);

    // ── Fit-to-viewport scale ──
    useEffect(() => {
        const update = () => {
            const node = containerRef.current;
            if (!node) return;
            const w = node.clientWidth - 64;
            const h = node.clientHeight - 64;
            if (w <= 0 || h <= 0) return;
            setFitScale(Math.min(w / canvas.canvasWidth, h / canvas.canvasHeight, 1));
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [canvas.canvasWidth, canvas.canvasHeight]);

    // ── Global pointer move/up for drag & resize ──
    useEffect(() => {
        const snapVal = (v: number) => (snapRef.current ? Math.round(v / 5) * 5 : Math.round(v));
        const onMove = (e: PointerEvent) => {
            const ds = dragRef.current;
            if (!ds) return;
            e.preventDefault();
            const dx = (e.clientX - ds.startX) / scaleRef.current;
            const dy = (e.clientY - ds.startY) / scaleRef.current;

            updateCanvas(c => ({
                ...c,
                elements: c.elements.map(el => {
                    if (el.id !== ds.elemId) return el;
                    if (ds.type === 'move') {
                        return {
                            ...el,
                            x: snapVal(Math.max(-el.width / 2, Math.min(c.canvasWidth - el.width / 2, ds.origX + dx))),
                            y: snapVal(Math.max(-el.height / 2, Math.min(c.canvasHeight - el.height / 2, ds.origY + dy))),
                        };
                    }
                    let { origX: x, origY: y, origW: w, origH: h } = ds;
                    const min = 8;
                    switch (ds.dir) {
                        case 'e': w = Math.max(min, ds.origW + dx); break;
                        case 'w': x = ds.origX + dx; w = Math.max(min, ds.origW - dx); break;
                        case 's': h = Math.max(min, ds.origH + dy); break;
                        case 'n': y = ds.origY + dy; h = Math.max(min, ds.origH - dy); break;
                        case 'se': w = Math.max(min, ds.origW + dx); h = Math.max(min, ds.origH + dy); break;
                        case 'sw': x = ds.origX + dx; w = Math.max(min, ds.origW - dx); h = Math.max(min, ds.origH + dy); break;
                        case 'ne': w = Math.max(min, ds.origW + dx); y = ds.origY + dy; h = Math.max(min, ds.origH - dy); break;
                        case 'nw': x = ds.origX + dx; w = Math.max(min, ds.origW - dx); y = ds.origY + dy; h = Math.max(min, ds.origH - dy); break;
                    }
                    return { ...el, x: snapVal(x), y: snapVal(y), width: snapVal(w), height: snapVal(h) };
                }),
            }));
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [updateCanvas]);

    const startMove = useCallback((e: React.PointerEvent, elemId: string) => {
        e.stopPropagation();
        const el = layoutRef.current[orientationRef.current].elements.find(x => x.id === elemId);
        if (!el) return;
        setSelectedId(elemId);
        snapshot();
        dragRef.current = { type: 'move', elemId, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.width, origH: el.height };
    }, [snapshot]);

    const startResize = useCallback((e: React.PointerEvent, elemId: string, dir: ResizeDir) => {
        e.stopPropagation();
        e.preventDefault();
        const el = layoutRef.current[orientationRef.current].elements.find(x => x.id === elemId);
        if (!el) return;
        snapshot();
        dragRef.current = { type: 'resize', elemId, dir, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.width, origH: el.height };
    }, [snapshot]);

    // ── Element operations ──
    const pushElement = useCallback((make: (c: BibCheck2Canvas) => BibCheck2Element) => {
        snapshot();
        const created = make(layoutRef.current[orientationRef.current]);
        updateCanvas(c => ({ ...c, elements: [...c.elements, created] }));
        setSelectedId(created.id);
    }, [snapshot, updateCanvas]);

    const updateElement = useCallback((id: string, patch: Partial<BibCheck2Element>) => {
        snapshot();
        updateCanvas(c => ({ ...c, elements: c.elements.map(el => (el.id === id ? { ...el, ...patch } : el)) }));
    }, [snapshot, updateCanvas]);

    const deleteSelected = useCallback(() => {
        setSelectedId(cur => {
            if (!cur) return cur;
            snapshot();
            updateCanvas(c => ({ ...c, elements: c.elements.filter(el => el.id !== cur) }));
            return null;
        });
    }, [snapshot, updateCanvas]);

    const duplicateSelected = useCallback(() => {
        const id = selectedId;
        if (!id) return;
        const cur = layoutRef.current[orientationRef.current];
        const src = cur.elements.find(el => el.id === id);
        if (!src) return;
        snapshot();
        const clone: BibCheck2Element = {
            ...src,
            id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: src.x + 20, y: src.y + 20,
        };
        updateCanvas(c => ({ ...c, elements: [...c.elements, clone] }));
        setSelectedId(clone.id);
    }, [selectedId, snapshot, updateCanvas]);

    const nudgeSelected = useCallback((dx: number, dy: number) => {
        const id = selectedId;
        if (!id) return;
        snapshot();
        updateCanvas(c => ({
            ...c,
            elements: c.elements.map(el => (el.id === id ? { ...el, x: el.x + dx, y: el.y + dy } : el)),
        }));
    }, [selectedId, snapshot, updateCanvas]);

    const alignSelected = useCallback((mode: 'h-center' | 'v-center' | 'left' | 'right' | 'top' | 'bottom') => {
        const id = selectedId;
        if (!id) return;
        snapshot();
        updateCanvas(c => ({
            ...c,
            elements: c.elements.map(el => {
                if (el.id !== id) return el;
                switch (mode) {
                    case 'h-center': return { ...el, x: Math.round((c.canvasWidth - el.width) / 2) };
                    case 'v-center': return { ...el, y: Math.round((c.canvasHeight - el.height) / 2) };
                    case 'left': return { ...el, x: 40 };
                    case 'right': return { ...el, x: c.canvasWidth - el.width - 40 };
                    case 'top': return { ...el, y: 40 };
                    case 'bottom': return { ...el, y: c.canvasHeight - el.height - 40 };
                }
            }),
        }));
    }, [selectedId, snapshot, updateCanvas]);

    const moveLayer = useCallback((id: string, dir: 'up' | 'down') => {
        snapshot();
        updateCanvas(c => {
            const idx = c.elements.findIndex(el => el.id === id);
            if (idx < 0) return c;
            const arr = [...c.elements];
            if (dir === 'up' && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
            else if (dir === 'down' && idx > 0) [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
            return { ...c, elements: arr };
        });
    }, [snapshot, updateCanvas]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
            const mod = e.metaKey || e.ctrlKey;

            if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { if (inField) return; e.preventDefault(); undo(); return; }
            if (mod && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { if (inField) return; e.preventDefault(); redo(); return; }
            if (inField) return;

            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) { e.preventDefault(); deleteSelected(); return; }
            if (mod && (e.key === 'd' || e.key === 'D') && selectedId) { e.preventDefault(); duplicateSelected(); return; }
            if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                const step = e.shiftKey ? 10 : 1;
                e.preventDefault();
                if (e.key === 'ArrowUp') nudgeSelected(0, -step);
                if (e.key === 'ArrowDown') nudgeSelected(0, step);
                if (e.key === 'ArrowLeft') nudgeSelected(-step, 0);
                if (e.key === 'ArrowRight') nudgeSelected(step, 0);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, deleteSelected, duplicateSelected, nudgeSelected, undo, redo]);

    // ── Paste image from clipboard ──
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
                    compressImage(file, 900, 300_000)
                        .then(data => pushElement(c => makeImageElement(data, c)))
                        .catch(() => {});
                    return;
                }
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [pushElement]);

    // ── Save ──
    const handleSave = async () => {
        if (!campaign?._id) {
            setSaveError('ไม่พบกิจกรรม — กรุณากดดาวเลือกกิจกรรมก่อน');
            return;
        }
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!activeToken) {
            setSaveError('ไม่พบ session — กรุณา logout แล้ว login ใหม่');
            return;
        }
        setSaving(true); setSaved(false); setSaveError(null);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
                body: JSON.stringify({ bibCheck2Layout: layout }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 4000);
            } else if (res.status === 413) {
                setSaveError('ไฟล์ใหญ่เกินไป (413) — ลดขนาด/จำนวนรูปในดีไซน์');
            } else if (res.status === 401) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_user');
                setSaveError('Session หมดอายุ — กำลังไปหน้า login...');
                setTimeout(() => router.push('/login'), 1500);
            } else if (res.status === 403) {
                setSaveError('ไม่มีสิทธิ์ — เฉพาะ admin เท่านั้น');
            } else {
                const txt = await res.text().catch(() => `HTTP ${res.status}`);
                setSaveError(`บันทึกไม่สำเร็จ: ${res.status} — ${txt.slice(0, 120)}`);
            }
        } catch (err) {
            setSaveError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Templates ──
    const flashTemplateMsg = (msg: string) => { setTemplateMsg(msg); setTimeout(() => setTemplateMsg(null), 3000); };

    const saveAsTemplate = () => {
        const name = window.prompt('ตั้งชื่อเทมเพลต:', campaign?.name || 'Check BIB 2 Template');
        if (!name?.trim()) return;
        const next = [{ id: `tpl-${Date.now()}`, name: name.trim(), savedAt: Date.now(), layout: JSON.parse(JSON.stringify(layoutRef.current)) }, ...templates];
        setTemplates(next);
        persistTemplates(next);
        flashTemplateMsg('✓ บันทึกเทมเพลตแล้ว');
    };

    const applyTemplate = (tpl: BibTemplate) => {
        snapshot();
        setLayout(normalizeLayout(JSON.parse(JSON.stringify(tpl.layout))));
        setSelectedId(null);
        flashTemplateMsg(`✓ โหลด "${tpl.name}" แล้ว (อย่าลืมกดบันทึก)`);
    };

    const deleteTemplate = (id: string) => {
        const next = templates.filter(t => t.id !== id);
        setTemplates(next);
        persistTemplates(next);
    };

    const exportTemplate = () => {
        const blob = new Blob([JSON.stringify({ kind: 'rfid-bibcheck2-template', version: 1, layout: layoutRef.current }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bibcheck2-${(campaign?.name || 'template').replace(/[^a-z0-9ก-๙_-]+/gi, '-').slice(0, 60)}.json`;
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
            if (json?.kind !== 'rfid-bibcheck2-template' || !json?.layout) {
                flashTemplateMsg('✕ ไฟล์เทมเพลตไม่ถูกต้อง');
                return;
            }
            snapshot();
            setLayout(normalizeLayout(json.layout));
            setSelectedId(null);
            flashTemplateMsg('✓ นำเข้าเทมเพลตแล้ว (อย่าลืมกดบันทึก)');
        } catch {
            flashTemplateMsg('✕ อ่านไฟล์เทมเพลตไม่ได้');
        }
    };

    const copyToOtherOrientation = () => {
        const from = orientation;
        const to: Orientation = from === 'landscape' ? 'portrait' : 'landscape';
        if (!window.confirm(`คัดลอกดีไซน์ ${from === 'landscape' ? 'แนวนอน → แนวตั้ง' : 'แนวตั้ง → แนวนอน'}?\nดีไซน์เดิมของ ${to === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'} จะถูกทับ`)) return;
        snapshot();
        setLayout(prev => {
            const src = prev[from];
            const dst = prev[to];
            // Rescale positions so elements land in roughly the same relative spot.
            const sx = dst.canvasWidth / src.canvasWidth;
            const sy = dst.canvasHeight / src.canvasHeight;
            const s = Math.min(sx, sy);
            return {
                ...prev,
                [to]: {
                    ...dst,
                    background: JSON.parse(JSON.stringify(src.background)),
                    elements: src.elements.map(el => ({
                        ...el,
                        id: `${el.id}-copy`,
                        x: Math.round(el.x * sx),
                        y: Math.round(el.y * sy),
                        width: Math.round(el.width * sx),
                        height: Math.round(el.height * sy),
                        fontSize: Math.max(8, Math.round(el.fontSize * s)),
                    })),
                },
            };
        });
        flashTemplateMsg(`✓ คัดลอกไป${to === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}แล้ว`);
    };

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;
        const data = await compressImage(file, 1400, 400_000);
        snapshot();
        updateCanvas(c => ({ ...c, background: { ...c.background, type: 'image', imageData: data } }));
    };

    const handleElementImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!file) return;
        const data = await compressImage(file, 900, 300_000);
        pushElement(c => makeImageElement(data, c));
    };

    const selectedEl = canvas.elements.find(el => el.id === selectedId) ?? null;

    const ctx: RenderContext = {
        runner: null,
        campaign: campaign ? { _id: campaign._id, name: campaign.name, slug: campaign.slug } : null,
        qrValue: typeof window !== 'undefined' ? `${window.location.origin}/upload/preview` : '',
        photoUploaded: false,
        editor: true,
    };

    const payloadKb = Math.round(JSON.stringify(layout).length / 1024);
    const scanUrl = campaign ? `/scanning-custom/${campaign.slug || campaign._id}` : '';

    const breadcrumb = [{ label: 'เช็คบิบ2', labelEn: 'Check BIB 2' }];

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={breadcrumb}>
                <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8' }}>กำลังโหลด...</p>
                    <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={breadcrumb}>
            <link href={BIB_FONT_HREF} rel="stylesheet" />
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .bc2-elem:hover { outline: 1px dashed rgba(14,165,233,0.7); outline-offset: 1px; }
                .bc2-panel input[type=color] { width: 32px; height: 30px; padding: 2px; border-radius: 6px; border: 1px solid #e2e8f0; cursor: pointer; }
                .bc2-hidden-input { display: none; }
            `}</style>

            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', fontFamily: "'Prompt', sans-serif" }}>

                {/* ── Top bar ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0284c7' }}>🎨 เช็คบิบ2 — Check BIB 2</span>
                    {campaign && <span style={{ fontSize: 12, color: '#94a3b8' }}>{campaign.name}</span>}

                    {/* Orientation switch */}
                    <div style={{ display: 'flex', gap: 0, marginLeft: 8, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                        {(['landscape', 'portrait'] as const).map(o => (
                            <button type="button" key={o} onClick={() => { setOrientation(o); setSelectedId(null); setZoom(1); }}
                                style={{
                                    padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: orientation === o ? '#0ea5e9' : '#fff',
                                    color: orientation === o ? '#fff' : '#64748b', fontFamily: 'inherit',
                                }}>
                                {o === 'landscape' ? '🖥️ แนวนอน' : '📱 แนวตั้ง'}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" onClick={undo} title="Undo (Ctrl/Cmd+Z)" style={topBtn}>↶</button>
                        <button type="button" onClick={redo} title="Redo (Ctrl/Cmd+Y)" style={topBtn}>↷</button>
                    </div>

                    {/* Zoom */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button type="button" onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))} style={topBtn}>−</button>
                        <span style={{ fontSize: 12, color: '#64748b', width: 52, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                        <button type="button" onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.25) * 100) / 100))} style={topBtn}>+</button>
                        <button type="button" onClick={() => setZoom(1)} style={{ ...topBtn, fontSize: 11 }}>พอดีจอ</button>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: payloadKb > 900 ? '#dc2626' : '#94a3b8', fontWeight: payloadKb > 900 ? 700 : 400 }}>
                            {payloadKb} KB
                        </span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: '#64748b', userSelect: 'none' }}>
                            <input type="checkbox" checked={snapGrid} onChange={e => setSnapGrid(e.target.checked)} />
                            Snap 5px
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: '#64748b', userSelect: 'none' }}>
                            <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />
                            Preview
                        </label>
                        {scanUrl && (
                            <a href={scanUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '7px 14px', borderRadius: 8, background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                                🚀 เปิดหน้าสแกน
                            </a>
                        )}
                        <button type="button" onClick={handleSave} disabled={saving} style={{
                            padding: '8px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                            background: saving ? '#94a3b8' : '#0284c7', color: '#fff', border: 'none',
                            cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                        }}>
                            {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
                        </button>
                        {saved && <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓ บันทึกแล้ว</span>}
                        {saveError && <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', maxWidth: 320 }}>{saveError}</span>}
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* Left panel */}
                    <div className="bc2-panel" style={{ width: 232, borderRight: '1px solid #e2e8f0', background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>

                        {/* Canvas size */}
                        <Section title="ขนาด Canvas">
                            <select
                                value={`${canvas.canvasWidth}x${canvas.canvasHeight}`}
                                onChange={e => {
                                    const [w, h] = e.target.value.split('x').map(Number);
                                    snapshot();
                                    updateCanvas(c => ({ ...c, canvasWidth: w, canvasHeight: h }));
                                }}
                                style={inputStyle()}
                            >
                                {SIZE_PRESETS.filter(p => p.orientation === orientation).map(p => (
                                    <option key={p.label} value={`${p.w}x${p.h}`}>{p.label}</option>
                                ))}
                                {!SIZE_PRESETS.some(p => p.w === canvas.canvasWidth && p.h === canvas.canvasHeight) && (
                                    <option value={`${canvas.canvasWidth}x${canvas.canvasHeight}`}>
                                        {canvas.canvasWidth} × {canvas.canvasHeight} (กำหนดเอง)
                                    </option>
                                )}
                            </select>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <input type="number" value={canvas.canvasWidth} title="กว้าง"
                                    onChange={e => updateCanvas(c => ({ ...c, canvasWidth: Math.max(100, Number(e.target.value) || 100) }))}
                                    style={inputStyle()} />
                                <input type="number" value={canvas.canvasHeight} title="สูง"
                                    onChange={e => updateCanvas(c => ({ ...c, canvasHeight: Math.max(100, Number(e.target.value) || 100) }))}
                                    style={inputStyle()} />
                            </div>
                            <button type="button" onClick={copyToOtherOrientation}
                                style={{ ...ghostBtn, marginTop: 8, width: '100%' }}>
                                ⇄ คัดลอกไป{orientation === 'landscape' ? 'แนวตั้ง' : 'แนวนอน'}
                            </button>
                        </Section>

                        {/* Background */}
                        <Section title="พื้นหลัง">
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                {(['color', 'image'] as const).map(t => (
                                    <button type="button" key={t}
                                        onClick={() => { snapshot(); updateCanvas(c => ({ ...c, background: { ...c.background, type: t } })); }}
                                        style={{
                                            flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                                            background: canvas.background.type === t ? '#0ea5e9' : '#e2e8f0',
                                            color: canvas.background.type === t ? '#fff' : '#64748b', fontFamily: 'inherit',
                                        }}>
                                        {t === 'color' ? '🎨 สี' : '🖼 รูป'}
                                    </button>
                                ))}
                            </div>
                            <DragColorPicker
                                value={canvas.background.color}
                                onChange={v => { snapshot(); updateCanvas(c => ({ ...c, background: { ...c.background, color: v } })); }}
                            />
                            {canvas.background.type === 'image' && (
                                <div style={{ marginTop: 10 }}>
                                    <label style={{ ...ghostBtn, display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                                        📁 เลือกรูปพื้นหลัง
                                        <input type="file" accept="image/*" className="bc2-hidden-input" onChange={handleBgUpload} />
                                    </label>
                                    {canvas.background.imageData && (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={canvas.background.imageData} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                                                <button type="button"
                                                    onClick={() => { snapshot(); updateCanvas(c => ({ ...c, background: { ...c.background, imageData: '' } })); }}
                                                    style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                    ลบรูป
                                                </button>
                                            </div>
                                            <LabeledSlider
                                                label="ความเข้มรูป"
                                                min={0} max={100}
                                                value={Math.round((canvas.background.imageOpacity ?? 1) * 100)}
                                                suffix="%"
                                                onChange={v => { snapshot(); updateCanvas(c => ({ ...c, background: { ...c.background, imageOpacity: v / 100 } })); }}
                                            />
                                        </>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* Add elements */}
                        <Section title="เพิ่ม Element">
                            <button type="button" onClick={() => pushElement(makePhotoElement)} style={{ ...addBtn('#0ea5e9'), marginBottom: 6 }}>
                                🧑 รูปนักวิ่ง (Photo)
                            </button>
                            <button type="button" onClick={() => pushElement(makeQrElement)} style={{ ...addBtn('#16a34a'), marginBottom: 6 }}>
                                📱 QR อัปโหลดรูป
                            </button>
                            <button type="button" onClick={() => pushElement(makeShapeElement)} style={{ ...addBtn('#f59e0b'), marginBottom: 6 }}>
                                ▭ กล่อง/เส้น (Shape)
                            </button>
                            <label style={{ ...addBtn('#8b5cf6'), display: 'block', marginBottom: 10, cursor: 'pointer' }}>
                                🖼 อัปโหลดรูปภาพ
                                <input type="file" accept="image/*" className="bc2-hidden-input" onChange={handleElementImageUpload} />
                            </label>

                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                                Ctrl/Cmd+V วางรูป • Ctrl/Cmd+Z undo • Ctrl/Cmd+D duplicate • ลูกศร = ขยับ 1px (Shift = 10px) • Backspace = ลบ
                            </div>

                            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>ข้อมูลนักวิ่ง</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {BIB_FIELD_PALETTE.map(p => (
                                    <button type="button" key={p.field}
                                        onClick={() => pushElement(c => makeTextElement(p.field, p.field === 'static' ? p.sample : '', c))}
                                        style={fieldBtn}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f0f9ff'; e.currentTarget.style.borderColor = '#0ea5e9'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                    >
                                        + {p.label}
                                    </button>
                                ))}
                            </div>
                        </Section>

                        {/* Templates */}
                        <Section title="🧩 เทมเพลต">
                            <button type="button" onClick={saveAsTemplate} style={{ ...addBtn('#0284c7'), marginBottom: 6 }}>
                                💾 บันทึกเป็นเทมเพลต
                            </button>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <button type="button" onClick={exportTemplate} style={{ ...ghostBtn, flex: 1 }}>⬇ Export</button>
                                <label style={{ ...ghostBtn, flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                                    ⬆ Import
                                    <input type="file" accept="application/json,.json" className="bc2-hidden-input" onChange={importTemplate} />
                                </label>
                            </div>
                            <button type="button"
                                onClick={() => {
                                    if (!window.confirm('รีเซ็ตกลับเป็นดีไซน์เริ่มต้น? (ยังไม่บันทึกจนกว่าจะกดบันทึก)')) return;
                                    snapshot();
                                    setLayout(defaultBibCheck2Layout());
                                    setSelectedId(null);
                                }}
                                style={{ ...ghostBtn, width: '100%', color: '#ef4444', borderColor: '#fecaca', marginBottom: 8 }}>
                                ↺ รีเซ็ตดีไซน์เริ่มต้น
                            </button>
                            {templateMsg && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: templateMsg.startsWith('✕') ? '#ef4444' : '#16a34a', marginBottom: 8 }}>{templateMsg}</div>
                            )}
                            {templates.length ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {templates.map(t => (
                                        <div key={t.id} style={{ display: 'flex', gap: 4 }}>
                                            <button type="button" onClick={() => applyTemplate(t)} title="โหลดเทมเพลตนี้"
                                                style={{ ...fieldBtn, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                🧩 {t.name}
                                            </button>
                                            <button type="button" onClick={() => deleteTemplate(t.id)} title="ลบเทมเพลต"
                                                style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid #fecaca', background: '#fff5f5', color: '#ef4444', fontFamily: 'inherit' }}>🗑</button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                                    ยังไม่มีเทมเพลต — ออกแบบเสร็จแล้วกด “บันทึกเป็นเทมเพลต” เพื่อใช้ซ้ำในงานอื่น
                                </div>
                            )}
                        </Section>
                    </div>

                    {/* Canvas stage */}
                    <div ref={containerRef}
                        onPointerDown={() => setSelectedId(null)}
                        style={{ flex: 1, overflow: 'auto', background: '#334155', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 32 }}>
                        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', lineHeight: 1, flexShrink: 0 }}>
                            <div style={{
                                position: 'relative',
                                width: canvas.canvasWidth,
                                height: canvas.canvasHeight,
                                background: canvas.background.color || '#ffffff',
                                overflow: 'hidden',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                                userSelect: 'none',
                            }}>
                                {canvas.background.type === 'image' && canvas.background.imageData && (
                                    <div style={{
                                        position: 'absolute', inset: 0, zIndex: 0,
                                        backgroundImage: `url(${canvas.background.imageData})`,
                                        backgroundSize: 'cover', backgroundPosition: 'center',
                                        opacity: canvas.background.imageOpacity ?? 1, pointerEvents: 'none',
                                    }} />
                                )}

                                {canvas.elements.map(el => {
                                    if (preview && isElementHidden(el, ctx)) return null;
                                    const isSelected = el.id === selectedId && !preview;
                                    const box = elementBoxStyle(el);
                                    const hiddenAtRuntime = !preview && isElementHidden(el, ctx);
                                    return (
                                        <div key={el.id} className={preview ? undefined : 'bc2-elem'}
                                            onPointerDown={preview ? undefined : e => startMove(e, el.id)}
                                            style={{
                                                ...box,
                                                cursor: preview ? 'default' : 'move',
                                                outline: isSelected ? '2px solid #0ea5e9' : 'none',
                                                outlineOffset: 1,
                                                opacity: hiddenAtRuntime ? Math.min(0.35, el.opacity) : el.opacity,
                                            }}>
                                            <ElementContent el={el} ctx={ctx} />

                                            {isSelected && RESIZE_HANDLES.map(h => (
                                                <div key={h.dir} onPointerDown={e => startResize(e, el.id, h.dir)}
                                                    style={{
                                                        position: 'absolute',
                                                        width: Math.max(10, 12 / scale), height: Math.max(10, 12 / scale),
                                                        background: '#fff', border: `${Math.max(1.5, 2 / scale)}px solid #0ea5e9`,
                                                        borderRadius: 2, zIndex: 999, ...h.style,
                                                    }} />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right properties panel */}
                    <div className="bc2-panel" style={{ width: 268, borderLeft: '1px solid #e2e8f0', background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>
                        {selectedEl ? (
                            <PropertiesPanel
                                el={selectedEl}
                                update={patch => updateElement(selectedEl.id, patch)}
                                onDelete={deleteSelected}
                                onDuplicate={duplicateSelected}
                                onMoveLayer={dir => moveLayer(selectedEl.id, dir)}
                                onAlign={alignSelected}
                            />
                        ) : (
                            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13, lineHeight: 1.7 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>☝️</div>
                                คลิก element บน canvas เพื่อแก้ไข<br />
                                หรือกดปุ่มทางซ้ายเพื่อเพิ่มของใหม่
                                <div style={{ marginTop: 18, textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 11, color: '#64748b' }}>
                                    <div style={{ fontWeight: 800, color: '#0284c7', marginBottom: 6 }}>ℹ️ วิธีใช้</div>
                                    1. ออกแบบทั้ง <b>แนวนอน</b> และ <b>แนวตั้ง</b> (สลับที่แถบบน)<br />
                                    2. กด <b>บันทึก</b><br />
                                    3. เปิด <b>หน้าสแกน</b> บนเครื่องที่ต่อ RFID reader<br />
                                    4. หน้าสแกนจะย่อ/ขยายดีไซน์ให้พอดีจออัตโนมัติ
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

const topBtn: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
    background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
    padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
    border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontFamily: 'inherit', fontWeight: 600,
};

const fieldBtn: React.CSSProperties = {
    textAlign: 'left', padding: '6px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
    border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontFamily: 'inherit', transition: '0.15s',
};

function addBtn(color: string): React.CSSProperties {
    return {
        width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 12,
        cursor: 'pointer', border: `1px dashed ${color}`, background: `${color}12`, color,
        fontFamily: 'inherit', fontWeight: 700,
    };
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
    return {
        width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e2e8f0',
        borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box', ...extra,
    };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
            {children}
        </div>
    );
}

function LabeledSlider({ label, min, max, step = 1, value, onChange, suffix = '' }: {
    label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; suffix?: string;
}) {
    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <DragSlider min={min} max={max} step={step} value={value} onChange={onChange} />
                </div>
                <span style={{ fontSize: 11, color: '#374151', width: 42, textAlign: 'right' }}>{value}{suffix}</span>
            </div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', width: 72, flexShrink: 0, textAlign: 'right' }}>{label}</label>
            <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>
    );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', marginBottom: 8, userSelect: 'none' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            {label}
        </label>
    );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ el, update, onDelete, onDuplicate, onMoveLayer, onAlign }: {
    el: BibCheck2Element;
    update: (patch: Partial<BibCheck2Element>) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onMoveLayer: (dir: 'up' | 'down') => void;
    onAlign: (mode: 'h-center' | 'v-center' | 'left' | 'right' | 'top' | 'bottom') => void;
}) {
    const isText = el.type === 'text';
    const typeLabel =
        el.type === 'photo' ? 'รูปนักวิ่ง' :
        el.type === 'qr' ? 'QR อัปโหลดรูป' :
        el.type === 'shape' ? 'กล่อง/เส้น' :
        el.type === 'image' ? 'รูปภาพ' :
        (BIB_FIELD_PALETTE.find(p => p.field === el.field)?.label || el.field);

    return (
        <div style={{ padding: 14, fontFamily: "'Prompt', sans-serif" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Properties — {typeLabel}
            </div>

            {isText && (
                <>
                    <Row label="Field">
                        <select value={el.field} onChange={e => update({ field: e.target.value as BibField })} style={inputStyle()}>
                            {BIB_FIELD_PALETTE.map(p => <option key={p.field} value={p.field}>{p.label}</option>)}
                        </select>
                    </Row>
                    {el.field === 'static' && (
                        <Row label="ข้อความ">
                            <input value={el.staticText} onChange={e => update({ staticText: e.target.value })} style={inputStyle()} />
                        </Row>
                    )}
                    <Row label="Prefix">
                        <input value={el.prefix} onChange={e => update({ prefix: e.target.value })} placeholder="BIB " style={inputStyle()} />
                    </Row>
                    <Row label="Suffix">
                        <input value={el.suffix} onChange={e => update({ suffix: e.target.value })} placeholder=" KM" style={inputStyle()} />
                    </Row>
                </>
            )}

            {(el.type === 'image' || el.type === 'photo') && (
                <Row label="Fit">
                    <select value={el.objectFit || 'cover'} onChange={e => update({ objectFit: e.target.value as 'cover' | 'contain' | 'fill' })} style={inputStyle()}>
                        <option value="cover">Cover (เต็มกรอบ)</option>
                        <option value="contain">Contain (เห็นทั้งรูป)</option>
                        <option value="fill">Fill (ยืด)</option>
                    </select>
                </Row>
            )}

            {el.type === 'image' && el.imageData && (
                <div style={{ marginBottom: 12, padding: 8, background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={el.imageData} alt="" style={{ width: '100%', maxHeight: 100, objectFit: 'contain', display: 'block' }} />
                </div>
            )}

            {el.type === 'photo' && (
                <Check label="แสดงรูปแทน (silhouette) เมื่อยังไม่มีรูป" checked={el.showPlaceholder !== false} onChange={v => update({ showPlaceholder: v })} />
            )}

            {el.type === 'qr' && (
                <>
                    <Check label="ซ่อน QR เมื่ออัปโหลดรูปแล้ว" checked={el.hideWhenPhoto !== false} onChange={v => update({ hideWhenPhoto: v })} />
                    <Row label="สี QR">
                        <DragColorPicker value={el.qrFgColor || '#0f172a'} onChange={v => update({ qrFgColor: v })} />
                    </Row>
                    <Row label="พื้น QR">
                        <DragColorPicker value={el.qrBgColor || '#ffffff'} onChange={v => update({ qrBgColor: v })} />
                    </Row>
                </>
            )}

            <div style={divider} />

            {/* Geometry */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                {(['x', 'y', 'width', 'height'] as const).map(k => (
                    <label key={k} style={{ fontSize: 11, color: '#94a3b8' }}>
                        {k.toUpperCase()}
                        <input type="number" value={Math.round(el[k])} onChange={e => update({ [k]: Number(e.target.value) } as Partial<BibCheck2Element>)} style={inputStyle({ marginTop: 2 })} />
                    </label>
                ))}
            </div>

            <Row label="จัดตำแหน่ง">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                    <button type="button" onClick={() => onAlign('left')} title="ชิดซ้าย" style={ghostBtn}>⇤</button>
                    <button type="button" onClick={() => onAlign('h-center')} title="กึ่งกลางแนวนอน" style={ghostBtn}>↔</button>
                    <button type="button" onClick={() => onAlign('right')} title="ชิดขวา" style={ghostBtn}>⇥</button>
                    <button type="button" onClick={() => onAlign('top')} title="ชิดบน" style={ghostBtn}>⤒</button>
                    <button type="button" onClick={() => onAlign('v-center')} title="กึ่งกลางแนวตั้ง" style={ghostBtn}>↕</button>
                    <button type="button" onClick={() => onAlign('bottom')} title="ชิดล่าง" style={ghostBtn}>⤓</button>
                </div>
            </Row>

            {isText && (
                <>
                    <div style={divider} />
                    <Row label="ฟอนต์">
                        <select value={el.fontFamily || 'Prompt'} onChange={e => update({ fontFamily: e.target.value })} style={inputStyle()}>
                            {BIB_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </Row>
                    <LabeledSlider label="ขนาดตัวอักษร" min={8} max={260} value={el.fontSize} onChange={v => update({ fontSize: v })} />
                    <div style={{ height: 8 }} />
                    <Row label="น้ำหนัก">
                        <select value={el.fontWeight} onChange={e => update({ fontWeight: e.target.value })} style={inputStyle()}>
                            {['400', '500', '600', '700', '800', '900'].map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </Row>
                    <Row label="สีตัวอักษร">
                        <DragColorPicker value={el.color} onChange={v => update({ color: v })} />
                    </Row>
                    <Row label="แนวนอน">
                        <div style={{ display: 'flex', gap: 4 }}>
                            {(['left', 'center', 'right'] as const).map(a => (
                                <button type="button" key={a} onClick={() => update({ align: a })}
                                    style={{
                                        flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer',
                                        background: el.align === a ? '#0ea5e9' : '#e2e8f0', color: el.align === a ? '#fff' : '#374151', fontFamily: 'inherit',
                                    }}>
                                    {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                                </button>
                            ))}
                        </div>
                    </Row>
                    <Row label="แนวตั้ง">
                        <div style={{ display: 'flex', gap: 4 }}>
                            {(['top', 'middle', 'bottom'] as const).map(a => (
                                <button type="button" key={a} onClick={() => update({ verticalAlign: a })}
                                    style={{
                                        flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer',
                                        background: el.verticalAlign === a ? '#0ea5e9' : '#e2e8f0', color: el.verticalAlign === a ? '#fff' : '#374151', fontFamily: 'inherit',
                                    }}>
                                    {a === 'top' ? '⤒' : a === 'middle' ? '↕' : '⤓'}
                                </button>
                            ))}
                        </div>
                    </Row>
                    <Row label="สไตล์">
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" onClick={() => update({ italic: !el.italic })}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', fontStyle: 'italic', background: el.italic ? '#0ea5e9' : '#e2e8f0', color: el.italic ? '#fff' : '#374151', fontFamily: 'inherit' }}>I</button>
                            <button type="button" onClick={() => update({ uppercase: !el.uppercase })}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer', background: el.uppercase ? '#0ea5e9' : '#e2e8f0', color: el.uppercase ? '#fff' : '#374151', fontFamily: 'inherit' }}>AA</button>
                        </div>
                    </Row>
                    <LabeledSlider label="ระยะห่างตัวอักษร" min={0} max={30} value={el.letterSpacing} onChange={v => update({ letterSpacing: v })} />
                    <LabeledSlider label="ความสูงบรรทัด" min={0.8} max={2.5} step={0.05} value={el.lineHeight ?? 1.15} onChange={v => update({ lineHeight: v })} />
                    <div style={{ height: 10 }} />
                    <Check label="ย่อฟอนต์อัตโนมัติให้พอดีกล่อง" checked={!!el.autoFit} onChange={v => update({ autoFit: v })} />
                    <Check label="ซ่อนเมื่อไม่มีข้อมูล" checked={!!el.hideIfEmpty} onChange={v => update({ hideIfEmpty: v })} />
                </>
            )}

            <div style={divider} />

            <Row label="สีพื้น">
                <DragColorPicker value={el.backgroundColor || ''} onChange={v => update({ backgroundColor: v })} allowClear />
            </Row>
            <LabeledSlider label="มุมโค้ง" min={0} max={400} value={el.borderRadius} onChange={v => update({ borderRadius: v })} />
            <LabeledSlider label="ความหนาเส้นขอบ" min={0} max={24} value={el.borderWidth ?? 0} onChange={v => update({ borderWidth: v })} />
            {!!el.borderWidth && (
                <Row label="สีเส้นขอบ">
                    <DragColorPicker value={el.borderColor || '#cbd5e1'} onChange={v => update({ borderColor: v })} />
                </Row>
            )}
            <LabeledSlider label="ระยะขอบใน" min={0} max={80} value={el.padding ?? 0} onChange={v => update({ padding: v })} />
            <LabeledSlider label="ความทึบ" min={0} max={100} value={Math.round(el.opacity * 100)} suffix="%" onChange={v => update({ opacity: v / 100 })} />
            <LabeledSlider label="ลำดับชั้น (z)" min={0} max={99} value={el.zIndex} onChange={v => update({ zIndex: v })} />

            <div style={divider} />

            <Row label="Layer">
                <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => onMoveLayer('up')} style={{ ...ghostBtn, flex: 1 }}>↑ ขึ้น</button>
                    <button type="button" onClick={() => onMoveLayer('down')} style={{ ...ghostBtn, flex: 1 }}>↓ ลง</button>
                </div>
            </Row>

            <button type="button" onClick={onDuplicate} style={{ ...ghostBtn, width: '100%', padding: '8px 0', marginTop: 4 }}>
                ⧉ ทำสำเนา (Ctrl+D)
            </button>
            <button type="button" onClick={onDelete} style={{
                width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 8, border: '1px solid #fecaca',
                background: '#fff5f5', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
                🗑 ลบ Element
            </button>
        </div>
    );
}

const divider: React.CSSProperties = { borderTop: '1px solid #e2e8f0', margin: '12px 0' };
