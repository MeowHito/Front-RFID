'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import AdminLayout from '../AdminLayout';

// ============= TYPES =============
interface CertElement {
    id: string; content: string;
    x: number; y: number; width: number;
    fontSize: number; fontFamily: string; color: string;
    fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    opacity: number; letterSpacing: number;
    type?: 'text' | 'image'; src?: string; aspectRatio?: number;
}
interface Runner {
    _id: string; bib: string; firstName: string; lastName: string;
    firstNameTh?: string; lastNameTh?: string;
    gender: string; category: string; ageGroup?: string;
    netTime?: number; gunTime?: number; status: string;
    overallRank?: number; genderRank?: number; ageGroupRank?: number;
    finishTime?: string;
}
interface RaceCategory { name: string; distance?: string; }
interface Campaign {
    _id: string; name: string; nameTh?: string; nameEn?: string;
    eventDate?: string; categories?: RaceCategory[];
    certBackgroundImage?: string; certLayout?: CertElement[];
}
interface SnapLine { axis: 'x' | 'y'; pos: number; }
interface CtxMenu { x: number; y: number; elId?: string; }

// ============= CONSTANTS =============
const CANVAS_REF_W = 1200;
const CANVAS_ASPECT = 297 / 210;
const SNAP_THRESHOLD = 1.2;
const MAX_UNDO = 50;
const FONT_FAMILIES: [string, string][] = [
    ['Sarabun', 'Sarabun, sans-serif'], ['Prompt', 'Prompt, sans-serif'],
    ['Kanit', 'Kanit, sans-serif'], ['Playfair Display', 'Playfair Display, serif'],
    ['Georgia', 'Georgia, serif'], ['Arial', 'Arial, sans-serif'],
    ['Impact', 'Impact, sans-serif'], ['Courier New', 'Courier New, monospace'],
];
const DYNAMIC_FIELDS = [
    { label: 'Name (EN)', value: '{{name}}' },
    { label: 'Name (TH)', value: '{{name_th}}' },
    { label: 'BIB', value: '{{bib}}' },
    { label: 'Category', value: '{{category}}' },
    { label: 'Gender', value: '{{gender}}' },
    { label: 'Net Time', value: '{{time}}' },
    { label: 'Gun Time', value: '{{gun_time}}' },
    { label: 'Overall Rank', value: '{{rank}}' },
    { label: 'Gender Rank', value: '{{gender_rank}}' },
    { label: 'Age Rank', value: '{{age_rank}}' },
    { label: 'Event Name', value: '{{event_name}}' },
    { label: 'Event Date', value: '{{event_date}}' },
];
const FIELD_PREVIEWS: Record<string, string> = {
    '{{name}}': 'John Smith', '{{name_th}}': 'จอห์น สมิธ', '{{bib}}': '1234',
    '{{category}}': '100K', '{{gender}}': 'Male', '{{time}}': '10:30:00',
    '{{gun_time}}': '10:31:00', '{{rank}}': '42', '{{gender_rank}}': '15',
    '{{age_rank}}': '5', '{{event_name}}': 'Core X250', '{{event_date}}': '15 มีนาคม 2568',
};
const DEFAULT_ELEMENTS: CertElement[] = [
    { id: 'title', content: 'Certificate of Achievement', x: 50, y: 12, width: 80, fontSize: 44, fontFamily: 'Playfair Display, serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 3 },
    { id: 'event', content: '{{event_name}}', x: 50, y: 24, width: 75, fontSize: 20, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.85, letterSpacing: 1 },
    { id: 'presented', content: 'This certificate is presented to', x: 50, y: 34, width: 60, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'italic', textAlign: 'center', opacity: 0.65, letterSpacing: 0 },
    { id: 'name', content: '{{name}}', x: 50, y: 47, width: 70, fontSize: 48, fontFamily: 'Playfair Display, serif', color: '#ffffff', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'details', content: 'BIB: {{bib}}   |   {{category}}   |   {{gender}}', x: 50, y: 59, width: 65, fontSize: 15, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.8, letterSpacing: 0 },
    { id: 'time', content: '{{time}}', x: 50, y: 70, width: 40, fontSize: 38, fontFamily: 'Sarabun, sans-serif', color: '#d4af37', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 2 },
    { id: 'rank', content: 'Overall #{{rank}}  |  Gender #{{gender_rank}}  |  Age #{{age_rank}}', x: 50, y: 81, width: 70, fontSize: 13, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.6, letterSpacing: 0 },
    { id: 'date', content: '{{event_date}}', x: 15, y: 92, width: 24, fontSize: 12, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 0.55, letterSpacing: 0 },
];

const SIDEBAR_TOOLS = [
    { id: 'text', icon: 'Tt', label: 'TEXT' },
    { id: 'fields', icon: '{{}}', label: 'FIELDS' },
    { id: 'bg', icon: '🖼', label: 'BG' },
    { id: 'runners', icon: '🏅', label: 'RUNNERS' },
    { id: 'layers', icon: '◇', label: 'LAYERS' },
];

// ============= HELPERS =============
function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
function substituteFields(content: string, runner: Runner | null, campaign: Campaign | null): string {
    if (!runner) return content.replace(/\{\{[^}]+\}\}/g, m => FIELD_PREVIEWS[m] ?? m);
    const netTime = typeof runner.netTime === 'number' && runner.netTime > 0 ? formatTime(runner.netTime) : (runner.finishTime || '-');
    const gunTime = typeof runner.gunTime === 'number' && runner.gunTime > 0 ? formatTime(runner.gunTime) : '-';
    const map: Record<string, string> = {
        '{{name}}': `${runner.firstName} ${runner.lastName}`,
        '{{name_th}}': runner.firstNameTh ? `${runner.firstNameTh} ${runner.lastNameTh ?? ''}`.trim() : `${runner.firstName} ${runner.lastName}`,
        '{{bib}}': runner.bib ?? '-', '{{category}}': runner.category ?? '-',
        '{{gender}}': runner.gender === 'M' ? 'Male' : 'Female',
        '{{time}}': netTime, '{{gun_time}}': gunTime,
        '{{rank}}': runner.overallRank && runner.overallRank > 0 ? String(runner.overallRank) : '-', '{{gender_rank}}': runner.genderRank && runner.genderRank > 0 ? String(runner.genderRank) : '-',
        '{{age_rank}}': runner.ageGroupRank && runner.ageGroupRank > 0 ? String(runner.ageGroupRank) : '-',
        '{{event_name}}': campaign?.nameTh ?? campaign?.name ?? '-',
        '{{event_date}}': campaign?.eventDate ? new Date(campaign.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-',
    };
    return content.replace(/\{\{[^}]+\}\}/g, m => map[m] ?? m);
}
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function getElementHeight(el: CertElement): number {
    if (el.type !== 'image') return 0;
    return Math.max(4, Math.min(100, el.width * CANVAS_ASPECT / Math.max(0.1, el.aspectRatio || 1)));
}
function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
function computeSnaps(movingId: string, mx: number, my: number, els: CertElement[]): { snappedX: number; snappedY: number; lines: SnapLine[] } {
    let sx = mx, sy = my;
    const lines: SnapLine[] = [];
    // canvas center guides
    if (Math.abs(mx - 50) < SNAP_THRESHOLD) { sx = 50; lines.push({ axis: 'x', pos: 50 }); }
    if (Math.abs(my - 50) < SNAP_THRESHOLD) { sy = 50; lines.push({ axis: 'y', pos: 50 }); }
    for (const el of els) {
        if (el.id === movingId) continue;
        if (Math.abs(mx - el.x) < SNAP_THRESHOLD) { sx = el.x; lines.push({ axis: 'x', pos: el.x }); }
        if (Math.abs(my - el.y) < SNAP_THRESHOLD) { sy = el.y; lines.push({ axis: 'y', pos: el.y }); }
    }
    return { snappedX: sx, snappedY: sy, lines };
}

// ============= MAIN COMPONENT =============
export default function CertificatesPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [search, setSearch] = useState('');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
    const [generating, setGenerating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const limit = 30;

    // Canvas editor state
    const [elements, setElements] = useState<CertElement[]>(DEFAULT_ELEMENTS);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [bgImage, setBgImage] = useState('');
    const [bgColor, setBgColor] = useState('#1a1a2e');
    const [bgUploading, setBgUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [canvasW, setCanvasW] = useState(800);
    const canvasRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<{ id: string; startMX: number; startMY: number; startElX: number; startElY: number; canvasW: number; canvasH: number; mode: 'move' | 'resize'; startElW?: number } | null>(null);
    const runnerRequestRef = useRef(0);
    const [imageImporting, setImageImporting] = useState(false);
    const [clipboardEl, setClipboardEl] = useState<CertElement | null>(null);

    // Undo / Redo
    const [undoStack, setUndoStack] = useState<CertElement[][]>([]);
    const [redoStack, setRedoStack] = useState<CertElement[][]>([]);
    const pushUndo = useCallback((prev: CertElement[]) => {
        setUndoStack(s => [...s.slice(-(MAX_UNDO - 1)), prev]);
        setRedoStack([]);
    }, []);

    // Snap guides + context menu
    const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
    const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
    const [ctxSubmenu, setCtxSubmenu] = useState<'layer' | null>(null);
    const [activeTool, setActiveTool] = useState<string>('');

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const cloneElement = useCallback((el: CertElement): CertElement => ({
        ...el,
        id: uid(),
        x: Math.min(96, el.x + 2),
        y: Math.min(96, el.y + 2),
    }), []);

    const readImageFile = useCallback(async (file: File): Promise<{ dataUrl: string; aspectRatio: number }> => {
        let dataUrl: string;
        if (file.size > 5 * 1024 * 1024) {
            const { compressImage } = await import('@/lib/image-utils');
            dataUrl = await compressImage(file);
        } else {
            dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = ev => resolve(ev.target?.result as string);
                reader.onerror = () => reject(new Error('read failed'));
                reader.readAsDataURL(file);
            });
        }
        const aspectRatio = await new Promise<number>(resolve => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
            img.onerror = () => resolve(1);
            img.src = dataUrl;
        });
        return { dataUrl, aspectRatio };
    }, []);

    const addImageElement = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) { showToast('รองรับเฉพาะไฟล์รูป', 'error'); return; }
        setImageImporting(true);
        try {
            const { dataUrl, aspectRatio } = await readImageFile(file);
            const el: CertElement = {
                id: uid(),
                type: 'image',
                src: dataUrl,
                aspectRatio,
                content: '',
                x: 50,
                y: 50,
                width: aspectRatio >= 1 ? 28 : 18,
                fontSize: 20,
                fontFamily: 'Sarabun, sans-serif',
                color: '#ffffff',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textAlign: 'center',
                opacity: 1,
                letterSpacing: 0,
            };
            pushUndo(elements);
            setElements(prev => [...prev, el]);
            setSelectedId(el.id);
            setActiveTool('');
            showToast('เพิ่มรูปแล้ว', 'success');
        } catch {
            showToast('นำเข้ารูปไม่สำเร็จ', 'error');
        } finally {
            setImageImporting(false);
        }
    }, [elements, pushUndo, readImageFile]);

    const pasteCopiedElement = useCallback(() => {
        if (!clipboardEl) return;
        pushUndo(elements);
        const next = cloneElement(clipboardEl);
        setElements(prev => [...prev, next]);
        setSelectedId(next.id);
        setCtxMenu(null);
        setCtxSubmenu(null);
    }, [clipboardEl, cloneElement, elements, pushUndo]);

    const copyElement = useCallback((id: string) => {
        const el = elements.find(e => e.id === id);
        if (!el) return;
        setClipboardEl({ ...el });
        setCtxMenu(null);
        setCtxSubmenu(null);
        showToast('Copy แล้ว', 'success');
    }, [elements]);

    const duplicateElement = useCallback((id: string) => {
        const el = elements.find(e => e.id === id);
        if (!el) return;
        pushUndo(elements);
        const next = cloneElement(el);
        setElements(prev => [...prev, next]);
        setSelectedId(next.id);
        setCtxMenu(null);
        setCtxSubmenu(null);
    }, [cloneElement, elements, pushUndo]);

    const moveLayer = useCallback((id: string, mode: 'up' | 'down' | 'front' | 'back') => {
        pushUndo(elements);
        setElements(prev => {
            const idx = prev.findIndex(el => el.id === id);
            if (idx < 0) return prev;
            const next = [...prev];
            const [item] = next.splice(idx, 1);
            if (mode === 'front') next.push(item);
            else if (mode === 'back') next.unshift(item);
            else if (mode === 'up') next.splice(Math.min(next.length, idx + 1), 0, item);
            else next.splice(Math.max(0, idx - 1), 0, item);
            return next;
        });
        setCtxMenu(null);
        setCtxSubmenu(null);
    }, [elements, pushUndo]);

    const setElementAsBackground = useCallback((id: string) => {
        const el = elements.find(e => e.id === id);
        if (!el?.src) return;
        pushUndo(elements);
        setBgImage(el.src);
        setElements(prev => prev.filter(e => e.id !== id));
        setSelectedId(null);
        setCtxMenu(null);
        setCtxSubmenu(null);
    }, [elements, pushUndo]);

    useEffect(() => {
        const measure = () => { if (canvasRef.current) setCanvasW(canvasRef.current.clientWidth); };
        measure();
        const obs = new ResizeObserver(measure);
        if (canvasRef.current) obs.observe(canvasRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('no featured');
                const data = await res.json();
                if (data?._id) {
                    setCampaign(data);
                    if (data.categories?.length > 0) setSelectedCategory(data.categories[0].name);
                    if (data.certBackgroundImage) setBgImage(data.certBackgroundImage);
                    if (Array.isArray(data.certLayout) && data.certLayout.length > 0) setElements(data.certLayout);
                }
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || !selectedCategory) return;
        setRunnersLoading(true);
        try {
            const params = new URLSearchParams({ campaignId: campaign._id, category: selectedCategory, page: String(page), limit: String(limit), runnerStatus: 'finished', sortBy: 'netTime', sortOrder: 'asc' });
            if (search) params.append('search', search);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) { const d = await res.json(); setRunners(d.data || []); setTotal(d.total || 0); }
        } catch { setRunners([]); setTotal(0); }
        finally { setRunnersLoading(false); }
    }, [campaign, selectedCategory, page, search]);

    useEffect(() => { fetchRunners(); }, [fetchRunners]);

    const resolveRunnerRanks = useCallback(async (runner: Runner): Promise<Runner> => {
        if ((runner.overallRank && runner.overallRank > 0) || (runner.genderRank && runner.genderRank > 0) || (runner.ageGroupRank && runner.ageGroupRank > 0)) return runner;
        if (!campaign?._id || !selectedCategory) return runner;
        try {
            const params = new URLSearchParams({ campaignId: campaign._id, category: selectedCategory, page: '1', limit: '10000', sortBy: 'netTime', sortOrder: 'asc', skipStatusCounts: 'true' });
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) return runner;
            const data = await res.json();
            const finishedRunners = ((data?.data || []) as Runner[]).filter(r => (typeof r.netTime === 'number' && r.netTime > 0) || !!r.finishTime);
            const overallRank = finishedRunners.findIndex(r => r._id === runner._id) + 1;
            const genderRank = finishedRunners.filter(r => r.gender === runner.gender).findIndex(r => r._id === runner._id) + 1;
            const ageGroupRank = finishedRunners.filter(r => (r.ageGroup || '') === (runner.ageGroup || '')).findIndex(r => r._id === runner._id) + 1;
            return {
                ...runner,
                overallRank: runner.overallRank && runner.overallRank > 0 ? runner.overallRank : (overallRank > 0 ? overallRank : runner.overallRank),
                genderRank: runner.genderRank && runner.genderRank > 0 ? runner.genderRank : (genderRank > 0 ? genderRank : runner.genderRank),
                ageGroupRank: runner.ageGroupRank && runner.ageGroupRank > 0 ? runner.ageGroupRank : (ageGroupRank > 0 ? ageGroupRank : runner.ageGroupRank),
            };
        } catch {
            return runner;
        }
    }, [campaign, selectedCategory]);

    const handleSelectRunner = useCallback(async (runner: Runner) => {
        const requestId = ++runnerRequestRef.current;
        setSelectedRunner(runner);
        try {
            const detailRes = await fetch(`/api/runners/${runner._id}`, { cache: 'no-store' });
            const detail = detailRes.ok ? await detailRes.json() as Runner : runner;
            const resolved = await resolveRunnerRanks({ ...runner, ...detail });
            if (runnerRequestRef.current === requestId) setSelectedRunner(resolved);
        } catch {
            const resolved = await resolveRunnerRanks(runner);
            if (runnerRequestRef.current === requestId) setSelectedRunner(resolved);
        }
    }, [resolveRunnerRanks]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedId) {
                e.preventDefault();
                copyElement(selectedId);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                setUndoStack(prev => {
                    if (prev.length === 0) return prev;
                    const last = prev[prev.length - 1];
                    setRedoStack(r => [...r, elements]);
                    setElements(last);
                    return prev.slice(0, -1);
                });
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                setRedoStack(prev => {
                    if (prev.length === 0) return prev;
                    const last = prev[prev.length - 1];
                    setUndoStack(u => [...u, elements]);
                    setElements(last);
                    return prev.slice(0, -1);
                });
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                pushUndo(elements);
                setElements(prev => prev.filter(el => el.id !== selectedId));
                setSelectedId(null);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [copyElement, elements, selectedId, pushUndo]);

    useEffect(() => {
        const onPaste = async (e: ClipboardEvent) => {
            const items = Array.from(e.clipboardData?.items || []);
            const imgItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'));
            if (isTypingTarget(e.target)) return;
            if (imgItem) {
                const file = imgItem.getAsFile();
                if (!file) return;
                e.preventDefault();
                await addImageElement(file);
                return;
            }
            if (clipboardEl) {
                e.preventDefault();
                pasteCopiedElement();
            }
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [addImageElement, clipboardEl, pasteCopiedElement]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            if (drag.mode === 'resize') {
                const dw = ((e.clientX - drag.startMX) / drag.canvasW) * 100;
                setElements(prev => prev.map(el => el.id === drag.id ? { ...el, width: Math.max(5, Math.min(100, (drag.startElW ?? 20) + dw)) } : el));
            } else {
                const rawX = drag.startElX + ((e.clientX - drag.startMX) / drag.canvasW) * 100;
                const rawY = drag.startElY + ((e.clientY - drag.startMY) / drag.canvasH) * 100;
                const clampX = Math.max(0, Math.min(100, rawX));
                const clampY = Math.max(0, Math.min(100, rawY));
                setElements(prev => {
                    const { snappedX, snappedY, lines } = computeSnaps(drag.id, clampX, clampY, prev);
                    setSnapLines(lines);
                    return prev.map(el => el.id === drag.id ? { ...el, x: snappedX, y: snappedY } : el);
                });
            }
        };
        const onUp = () => {
            if (dragRef.current) {
                setSnapLines([]);
            }
            dragRef.current = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, []);

    const startDrag = (e: React.MouseEvent, id: string, mode: 'move' | 'resize') => {
        e.stopPropagation(); e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        pushUndo(elements);
        const rect = canvas.getBoundingClientRect();
        const el = elements.find(x => x.id === id);
        dragRef.current = { id, startMX: e.clientX, startMY: e.clientY, startElX: el?.x ?? 50, startElY: el?.y ?? 50, canvasW: rect.width, canvasH: rect.height, mode, startElW: el?.width };
        setSelectedId(id);
        setCtxMenu(null);
    };

    const addTextElement = (content = 'ข้อความใหม่') => {
        pushUndo(elements);
        const el: CertElement = { id: uid(), type: 'text', content, x: 50, y: 50, width: 40, fontSize: 20, fontFamily: 'Sarabun, sans-serif', color: '#ffffff', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center', opacity: 1, letterSpacing: 0 };
        setElements(prev => [...prev, el]);
        setSelectedId(el.id);
    };

    const deleteElement = (id: string) => { pushUndo(elements); setElements(prev => prev.filter(e => e.id !== id)); if (selectedId === id) setSelectedId(null); };
    const updateEl = (id: string, patch: Partial<CertElement>) => { pushUndo(elements); setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el)); };
    const totalPages = Math.ceil(total / limit);

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBgUploading(true);
        try {
            const { dataUrl } = await readImageFile(file);
            setBgImage(dataUrl);
        } catch { showToast('อัปโหลดรูปไม่ได้', 'error'); }
        finally { setBgUploading(false); }
    };

    const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await addImageElement(file);
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ certBackgroundImage: bgImage, certLayout: elements }) });
            if (res.ok) showToast('บันทึก Layout แล้ว', 'success');
            else showToast('Save failed', 'error');
        } catch { showToast('Error', 'error'); }
        finally { setSaving(false); }
    };

    const handlePrint = useCallback(async () => {
        if (!selectedRunner) { showToast('เลือกนักวิ่งก่อนพิมพ์', 'error'); return; }
        setGenerating(true);
        await new Promise(r => setTimeout(r, 100));
        try {
            const win = window.open('', '_blank');
            if (!win) { showToast('Browser blocked popup', 'error'); return; }
            const ps = 1122 / CANVAS_REF_W;
            const elHtml = elements.map(el => {
                if (el.type === 'image' && el.src) {
                    return `<img class="cert-image-el" src=${JSON.stringify(el.src)} alt="" style="left:${el.x}%;top:${el.y}%;width:${el.width}%;height:${getElementHeight(el)}%;opacity:${el.opacity};" />`;
                }
                const text = escapeHtml(substituteFields(el.content, selectedRunner, campaign)).replace(/\n/g, '<br>');
                return `<div class="cert-el" style="left:${el.x}%;top:${el.y}%;width:${el.width}%;font-size:${(el.fontSize * ps).toFixed(1)}px;font-family:${el.fontFamily};color:${el.color};font-weight:${el.fontWeight};font-style:${el.fontStyle};text-align:${el.textAlign};opacity:${el.opacity};letter-spacing:${(el.letterSpacing * ps).toFixed(1)}px;">${text}</div>`;
            }).join('');
            const bgLayer = bgImage ? `<img class="cert-bg-image" src=${JSON.stringify(bgImage)} alt="" />` : '';
            win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Prompt:wght@400;700&family=Kanit:wght@400;700&family=Playfair+Display:wght@400;700&display=swap"><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box;margin:0;padding:0}html,body{width:297mm;height:210mm;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:${bgColor}}body{font-family:Sarabun,sans-serif}.cert{width:297mm;height:210mm;position:relative;overflow:hidden;background:${bgColor}}.cert-bg-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}.cert-el,.cert-image-el{position:absolute;transform:translate(-50%,-50%);z-index:1}.cert-el{white-space:pre-wrap;word-break:break-word;line-height:1.3}.cert-image-el{object-fit:contain}</style></head><body><div class="cert">${bgLayer}${elHtml}</div><script>const done=()=>setTimeout(()=>window.print(),80);const fontReady=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();const imgs=[...document.images].filter(img=>!img.complete);Promise.all([fontReady,...imgs.map(img=>new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});}))]).then(done);if(imgs.length===0){fontReady.then(done);}</script></body></html>`);
            win.document.close();
        } catch { showToast('Error', 'error'); }
        finally { setGenerating(false); }
    }, [selectedRunner, elements, bgImage, bgColor, campaign]);

    const alignElement = (id: string, hAlign?: 'left' | 'center' | 'right', vAlign?: 'top' | 'middle' | 'bottom') => {
        pushUndo(elements);
        setElements(prev => prev.map(el => {
            if (el.id !== id) return el;
            const patch: Partial<CertElement> = {};
            if (hAlign === 'left') patch.x = el.width / 2;
            if (hAlign === 'center') patch.x = 50;
            if (hAlign === 'right') patch.x = 100 - el.width / 2;
            if (vAlign === 'top') patch.y = 5;
            if (vAlign === 'middle') patch.y = 50;
            if (vAlign === 'bottom') patch.y = 95;
            return { ...el, ...patch };
        }));
        setCtxMenu(null);
    };

    useEffect(() => {
        const close = () => { setCtxMenu(null); setCtxSubmenu(null); };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, []);

    const selectedEl = elements.find(e => e.id === selectedId) ?? null;
    const ctxEl = ctxMenu?.elId ? (elements.find(e => e.id === ctxMenu.elId) ?? null) : null;
    const scale = canvasW / CANVAS_REF_W;

    // ============= RENDER =============
    return (
        <AdminLayout breadcrumbItems={[{ label: 'ใบประกาศ', labelEn: 'Certificates' }]}>
            {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '10px 20px', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, background: toast.type === 'success' ? '#22c55e' : '#ef4444', boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>{toast.message}</div>}
            {ctxMenu && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999, background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                    {ctxMenu.elId && <>
                        <div style={{ padding: '4px 8px', fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1 }}>ALIGN POSITION</div>
                        {[{ l: '⭠ Left', h: 'left' as const }, { l: '↔ Center H', h: 'center' as const }, { l: '⭢ Right', h: 'right' as const }].map(a => (
                            <div key={a.l} onClick={() => alignElement(ctxMenu.elId!, a.h)} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{a.l}</div>
                        ))}
                        <div style={{ height: 1, background: '#334155', margin: '2px 0' }} />
                        {[{ l: '⭡ Top', v: 'top' as const }, { l: '↕ Center V', v: 'middle' as const }, { l: '⭣ Bottom', v: 'bottom' as const }].map(a => (
                            <div key={a.l} onClick={() => alignElement(ctxMenu.elId!, undefined, a.v)} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{a.l}</div>
                        ))}
                        <div style={{ height: 1, background: '#334155', margin: '2px 0' }} />
                        <div style={{ position: 'relative' }} onMouseEnter={() => setCtxSubmenu('layer')} onMouseLeave={() => setCtxSubmenu(null)}>
                            <div style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>🗂 Layers ▸</div>
                            {ctxSubmenu === 'layer' && (
                                <div style={{ position: 'absolute', left: 'calc(100% + 4px)', top: 0, background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                                    <div onClick={() => moveLayer(ctxMenu.elId!, 'up')} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }}>⬆ Move up 1 layer</div>
                                    <div onClick={() => moveLayer(ctxMenu.elId!, 'down')} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }}>⬇ Move down 1 layer</div>
                                    <div onClick={() => moveLayer(ctxMenu.elId!, 'front')} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }}>⏫ Bring to front</div>
                                    <div onClick={() => moveLayer(ctxMenu.elId!, 'back')} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }}>⏬ Send to back</div>
                                </div>
                            )}
                        </div>
                        <div onClick={() => duplicateElement(ctxMenu.elId!)} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>🧬 Duplicate</div>
                        <div onClick={() => copyElement(ctxMenu.elId!)} style={{ padding: '6px 12px', fontSize: 12, color: '#e2e8f0', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>📋 Copy</div>
                    </>}
                    <div onClick={pasteCopiedElement} style={{ padding: '6px 12px', fontSize: 12, color: clipboardEl ? '#e2e8f0' : '#64748b', cursor: clipboardEl ? 'pointer' : 'default', borderRadius: 4 }} onMouseEnter={e => { if (clipboardEl) e.currentTarget.style.background = '#334155'; }} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>📥 Paste</div>
                    {ctxEl?.type === 'image' && ctxEl.src && <div onClick={() => setElementAsBackground(ctxEl.id)} style={{ padding: '6px 12px', fontSize: 12, color: '#93c5fd', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>🖼 Set as background</div>}
                    {ctxMenu.elId && <>
                        <div style={{ height: 1, background: '#334155', margin: '2px 0' }} />
                        <div onClick={() => { deleteElement(ctxMenu.elId!); setCtxMenu(null); setCtxSubmenu(null); }} style={{ padding: '6px 12px', fontSize: 12, color: '#f87171', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => (e.currentTarget.style.background = '#334155')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>🗑 Delete</div>
                    </>}
                </div>
            )}

            {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading...</div>
            : !campaign ? <div style={{ padding: 24, color: '#666', fontSize: 14 }}>ยังไม่ได้เลือกกิจกรรมหลัก (set featured ที่หน้า Events)</div>
            : (
                <div style={{ display: 'flex', height: 'calc(100vh - 110px)', overflow: 'hidden', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f1f5f9' }}>

                    {/* LEFT DARK SIDEBAR */}
                    <div style={{ width: 56, background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 2, flexShrink: 0 }}>
                        {SIDEBAR_TOOLS.map(t => (
                            <button key={t.id} onClick={() => setActiveTool(activeTool === t.id ? '' : t.id)} style={{ width: 46, padding: '8px 0', background: activeTool === t.id ? '#334155' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 16, color: activeTool === t.id ? '#60a5fa' : '#94a3b8' }}>{t.icon}</span>
                                <span style={{ fontSize: 8, color: activeTool === t.id ? '#60a5fa' : '#64748b', fontWeight: 700, letterSpacing: 0.5 }}>{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* LEFT TOOL PANEL */}
                    {activeTool && (
                        <div style={{ width: 210, background: '#fff', borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 10, flexShrink: 0 }}>
                            {activeTool === 'text' && <>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#374151' }}>Text Elements</div>
                                <button onClick={() => { addTextElement(); setActiveTool(''); }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 11, background: '#f8fafc', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>➕ Add Text</button>
                                <button onClick={() => { addTextElement('HEADING'); setActiveTool(''); }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#f8fafc', cursor: 'pointer', fontWeight: 800, marginBottom: 4 }}>Add Heading</button>
                                <button onClick={() => imageInputRef.current?.click()} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px dashed #d1d5db', fontSize: 11, background: '#f8fafc', cursor: imageImporting ? 'wait' : 'pointer', fontWeight: 600, marginBottom: 4 }}>{imageImporting ? '⏳ Importing...' : '🖼 Import Image'}</button>
                                <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.5 }}>Ctrl+V เพื่อวางรูปจาก clipboard ได้</div>
                            </>}
                            {activeTool === 'fields' && <>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#374151' }}>Dynamic Fields</div>
                                {DYNAMIC_FIELDS.map(f => (
                                    <button key={f.value} onClick={() => { addTextElement(f.value); setActiveTool(''); }} style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: '1px dashed #93c5fd', fontSize: 11, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, marginBottom: 3, textAlign: 'left' }}>{f.label} <span style={{ opacity: 0.5 }}>{f.value}</span></button>
                                ))}
                            </>}
                            {activeTool === 'bg' && <>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#374151' }}>Background</div>
                                <label style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 2 }}>สีพื้นหลัง</label>
                                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 8 }} />
                                {bgImage && <div style={{ position: 'relative', marginBottom: 6 }}><img src={bgImage} alt="bg" style={{ width: '100%', borderRadius: 4, border: '1px solid #e5e7eb', aspectRatio: '297/210', objectFit: 'cover' }} /><button onClick={() => setBgImage('')} style={{ position: 'absolute', top: 2, right: 2, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕</button></div>}
                                <input type="file" id="cert-bg" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
                                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageImport} />
                                <label htmlFor="cert-bg" style={{ display: 'block', padding: '6px', borderRadius: 6, border: '1px dashed #d1d5db', background: '#f9fafb', cursor: bgUploading ? 'wait' : 'pointer', fontSize: 11, color: '#666', textAlign: 'center' }}>{bgUploading ? '⏳ กำลังอัปโหลด...' : bgImage ? 'เปลี่ยนรูป' : '📷 อัปโหลดภาพพื้นหลัง'}</label>
                                <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>แนะนำ A4 landscape (297×210mm)</p>
                            </>}
                            {activeTool === 'runners' && <>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#374151' }}>Runners</div>
                                <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setPage(1); }} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 10, marginBottom: 4 }}>
                                    {(campaign.categories || []).map((cat, i) => <option key={i} value={cat.name}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>)}
                                </select>
                                <input placeholder="🔍 BIB / ชื่อ" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 10, marginBottom: 4 }} />
                                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>{total} คน (finished)</div>
                                <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                                    {runnersLoading ? <div style={{ padding: 12, textAlign: 'center', color: '#999', fontSize: 10 }}>Loading...</div>
                                        : runners.map(r => (
                                            <div key={r._id} onClick={() => handleSelectRunner(r)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selectedRunner?._id === r._id ? '#eff6ff' : 'transparent', borderRadius: 4 }}>
                                                <div style={{ fontWeight: 800, fontSize: 11, color: '#2563eb', minWidth: 30, textAlign: 'center' }}>{r.bib}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.firstName} {r.lastName}</div>
                                                    <div style={{ fontSize: 8, color: '#94a3b8' }}>{formatTime(r.netTime)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: 6 }}>
                                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '2px 6px', borderRadius: 3, border: '1px solid #e5e7eb', fontSize: 9, cursor: 'pointer' }}>←</button>
                                        <span style={{ fontSize: 9, alignSelf: 'center', color: '#666' }}>{page}/{totalPages}</span>
                                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '2px 6px', borderRadius: 3, border: '1px solid #e5e7eb', fontSize: 9, cursor: 'pointer' }}>→</button>
                                    </div>}
                                </div>
                            </>}
                            {activeTool === 'layers' && <>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#374151' }}>Layers</div>
                                {[...elements].reverse().map((el, i) => (
                                    <div key={el.id} onClick={() => setSelectedId(el.id)} style={{ padding: '5px 8px', borderRadius: 5, cursor: 'pointer', marginBottom: 2, border: selectedId === el.id ? '1.5px solid #3b82f6' : '1px solid #e5e7eb', background: selectedId === el.id ? '#dbeafe' : '#fff', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <span style={{ fontWeight: 700, color: '#64748b', marginRight: 4 }}>{elements.length - i}.</span>
                                        {el.type === 'image' ? '[Image]' : el.content.substring(0, 30)}
                                    </div>
                                ))}
                            </>}
                        </div>
                    )}

                    {/* CENTER: Toolbar + Canvas */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ height: 40, background: '#1e293b', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0 }}>
                            <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, marginRight: 8 }}>Certificate Editor</span>
                            <button onClick={() => { if (undoStack.length === 0) return; const last = undoStack[undoStack.length - 1]; setRedoStack(r => [...r, elements]); setElements(last); setUndoStack(s => s.slice(0, -1)); }} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)" style={{ padding: '3px 6px', borderRadius: 4, border: 'none', background: undoStack.length > 0 ? '#334155' : 'transparent', color: undoStack.length > 0 ? '#e2e8f0' : '#475569', cursor: undoStack.length > 0 ? 'pointer' : 'default', fontSize: 14 }}>↩</button>
                            <button onClick={() => { if (redoStack.length === 0) return; const last = redoStack[redoStack.length - 1]; setUndoStack(u => [...u, elements]); setElements(last); setRedoStack(s => s.slice(0, -1)); }} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)" style={{ padding: '3px 6px', borderRadius: 4, border: 'none', background: redoStack.length > 0 ? '#334155' : 'transparent', color: redoStack.length > 0 ? '#e2e8f0' : '#475569', cursor: redoStack.length > 0 ? 'pointer' : 'default', fontSize: 14 }}>↪</button>
                            <div style={{ flex: 1 }} />
                            {selectedRunner && <span style={{ fontSize: 10, color: '#94a3b8' }}>Preview: {selectedRunner.bib} - {selectedRunner.firstName}</span>}
                            <button onClick={handlePrint} disabled={generating || !selectedRunner} title="Print" style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: !selectedRunner ? '#334155' : '#2563eb', color: !selectedRunner ? '#64748b' : '#fff', fontSize: 11, fontWeight: 700, cursor: !selectedRunner ? 'default' : 'pointer' }}>🖨 Preview</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '4px 14px', borderRadius: 5, border: 'none', background: saving ? '#334155' : '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '...' : 'Save Changes'}</button>
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#94a3b8', padding: 16 }}>
                            <div style={{ width: '100%', maxWidth: 820, maxHeight: '100%' }}>
                                <div ref={canvasRef} onClick={() => setSelectedId(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); setCtxSubmenu(null); }} style={{ position: 'relative', width: '100%', aspectRatio: '297/210', background: bgImage ? `url(${bgImage}) center/cover` : bgColor, borderRadius: 2, overflow: 'hidden', cursor: 'default', boxShadow: '0 4px 24px rgba(0,0,0,0.45)', userSelect: 'none' }}>

                                    {snapLines.map((sl, i) => sl.axis === 'x'
                                        ? <div key={`s${i}`} style={{ position: 'absolute', left: `${sl.pos}%`, top: 0, width: 1, height: '100%', background: '#f472b6', zIndex: 99, pointerEvents: 'none' }} />
                                        : <div key={`s${i}`} style={{ position: 'absolute', top: `${sl.pos}%`, left: 0, height: 1, width: '100%', background: '#f472b6', zIndex: 99, pointerEvents: 'none' }} />
                                    )}

                                    {elements.map(el => {
                                        const isSelected = selectedId === el.id;
                                        const imageHeight = getElementHeight(el);
                                        return (
                                            <div key={el.id} onClick={e => { e.stopPropagation(); setSelectedId(el.id); }} onMouseDown={e => { if (e.button === 0) startDrag(e, el.id, 'move'); }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelectedId(el.id); setCtxMenu({ x: e.clientX, y: e.clientY, elId: el.id }); setCtxSubmenu(null); }} style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`, height: el.type === 'image' ? `${imageHeight}%` : undefined, transform: 'translate(-50%,-50%)', fontSize: `${el.fontSize * scale}px`, fontFamily: el.fontFamily, color: el.color, fontWeight: el.fontWeight, fontStyle: el.fontStyle, textAlign: el.textAlign as 'left' | 'center' | 'right', opacity: el.opacity, letterSpacing: `${el.letterSpacing * scale}px`, cursor: 'move', padding: el.type === 'image' ? 0 : '2px 4px', outline: isSelected ? '2px solid #3b82f6' : '1px solid transparent', outlineOffset: 2, boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.3, transition: 'outline .1s' }}>
                                                {el.type === 'image' && el.src ? <img src={el.src} alt="element" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} /> : substituteFields(el.content, selectedRunner, campaign)}
                                                {isSelected && <>
                                                    <div onMouseDown={e => startDrag(e, el.id, 'resize')} style={{ position: 'absolute', bottom: -5, right: -5, width: 10, height: 10, background: '#3b82f6', border: '2px solid #fff', borderRadius: 2, cursor: 'se-resize', zIndex: 10 }} />
                                                    <div onMouseDown={e => startDrag(e, el.id, 'resize')} style={{ position: 'absolute', bottom: -5, left: -5, width: 10, height: 10, background: '#3b82f6', border: '2px solid #fff', borderRadius: 2, cursor: 'sw-resize', zIndex: 10 }} />
                                                    <div style={{ position: 'absolute', top: -5, left: -5, width: 10, height: 10, background: '#3b82f6', border: '2px solid #fff', borderRadius: 2, zIndex: 10 }} />
                                                    <div style={{ position: 'absolute', top: -5, right: -5, width: 10, height: 10, background: '#3b82f6', border: '2px solid #fff', borderRadius: 2, zIndex: 10 }} />
                                                </>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: ELEMENT PROPERTIES */}
                    <div style={{ width: 230, background: '#1e293b', overflowY: 'auto', padding: '12px 10px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {selectedEl ? (<>
                            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>ELEMENT PROPERTIES</div>

                            {selectedEl.type === 'image' && selectedEl.src ? <div><img src={selectedEl.src} alt="selected" style={{ width: '100%', borderRadius: 6, border: '1px solid #334155', background: '#0f172a' }} /></div> : null}

                            {selectedEl.type !== 'image' && <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 2 }}>CONTENT</label>
                                <textarea value={selectedEl.content} onChange={e => updateEl(selectedEl.id, { content: e.target.value })} rows={2} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 10, resize: 'vertical', fontFamily: 'monospace' }} />
                            </div>}

                            {selectedEl.type !== 'image' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                {DYNAMIC_FIELDS.map(f => <button key={f.value} onClick={() => updateEl(selectedEl.id, { content: selectedEl.content + f.value })} style={{ padding: '2px 4px', borderRadius: 3, border: '1px solid #334155', background: '#0f172a', color: '#60a5fa', fontSize: 8, cursor: 'pointer' }}>{f.value}</button>)}
                            </div>}

                            {selectedEl.type !== 'image' && <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 2 }}>TYPOGRAPHY</label>
                                <select value={selectedEl.fontFamily} onChange={e => updateEl(selectedEl.id, { fontFamily: e.target.value })} style={{ width: '100%', padding: '4px', borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 10, marginBottom: 6 }}>
                                    {FONT_FAMILIES.map(([lbl, val]) => <option key={val} value={val}>{lbl}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input type="number" min={6} max={200} value={selectedEl.fontSize} onChange={e => updateEl(selectedEl.id, { fontSize: Number(e.target.value) })} style={{ width: 54, padding: '4px', borderRadius: 4, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 11, textAlign: 'center' }} />
                                    <span style={{ fontSize: 9, color: '#64748b' }}>pt</span>
                                    <div style={{ flex: 1 }} />
                                    <button onClick={() => updateEl(selectedEl.id, { fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold' })} style={{ width: 28, height: 28, borderRadius: 4, border: `1.5px solid ${selectedEl.fontWeight === 'bold' ? '#3b82f6' : '#334155'}`, background: selectedEl.fontWeight === 'bold' ? '#1e3a5f' : '#0f172a', color: '#e2e8f0', cursor: 'pointer', fontWeight: 900, fontSize: 13 }}>B</button>
                                    <button onClick={() => updateEl(selectedEl.id, { fontStyle: selectedEl.fontStyle === 'italic' ? 'normal' : 'italic' })} style={{ width: 28, height: 28, borderRadius: 4, border: `1.5px solid ${selectedEl.fontStyle === 'italic' ? '#3b82f6' : '#334155'}`, background: selectedEl.fontStyle === 'italic' ? '#1e3a5f' : '#0f172a', color: '#e2e8f0', cursor: 'pointer', fontStyle: 'italic', fontSize: 13 }}>I</button>
                                </div>
                            </div>}

                            {selectedEl.type !== 'image' && <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4 }}>COLOR & STYLE</label>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input type="color" value={selectedEl.color} onChange={e => updateEl(selectedEl.id, { color: e.target.value })} style={{ width: 32, height: 32, border: '2px solid #334155', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                                    {['#ffffff', '#d4af37', '#000000', '#e2e8f0'].map(c => (
                                        <div key={c} onClick={() => updateEl(selectedEl.id, { color: c })} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: 'pointer', border: selectedEl.color === c ? '2px solid #3b82f6' : '2px solid #334155' }} />
                                    ))}
                                </div>
                            </div>}

                            {selectedEl.type !== 'image' && <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4 }}>ALIGN</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {(['left', 'center', 'right'] as const).map(a => <button key={a} onClick={() => updateEl(selectedEl.id, { textAlign: a })} style={{ flex: 1, padding: '5px', borderRadius: 4, border: `1.5px solid ${selectedEl.textAlign === a ? '#3b82f6' : '#334155'}`, background: selectedEl.textAlign === a ? '#1e3a5f' : '#0f172a', color: '#e2e8f0', cursor: 'pointer', fontSize: 11 }}>{a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}</button>)}
                                </div>
                            </div>}

                            <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{selectedEl.type === 'image' ? 'IMAGE' : 'SPACING'}</label>
                                {selectedEl.type !== 'image' ? <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 65 }}>Letter</span>
                                        <input type="range" min={-2} max={30} value={selectedEl.letterSpacing} onChange={e => updateEl(selectedEl.id, { letterSpacing: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} />
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 24, textAlign: 'right' }}>{selectedEl.letterSpacing}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 65 }}>Opacity</span>
                                        <input type="range" min={0} max={1} step={0.05} value={selectedEl.opacity} onChange={e => updateEl(selectedEl.id, { opacity: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} />
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 24, textAlign: 'right' }}>{Math.round(selectedEl.opacity * 100)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 65 }}>Width</span>
                                        <input type="range" min={5} max={100} value={selectedEl.width} onChange={e => updateEl(selectedEl.id, { width: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} />
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 24, textAlign: 'right' }}>{Math.round(selectedEl.width)}%</span>
                                    </div>
                                </> : <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                                        <div style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', border: '1px solid #334155' }}>
                                            <div style={{ fontSize: 8, color: '#64748b' }}>WIDTH %</div>
                                            <input type="number" min={5} max={100} value={Math.round(selectedEl.width)} onChange={e => updateEl(selectedEl.id, { width: Number(e.target.value) })} style={{ width: '100%', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, fontWeight: 700, outline: 'none' }} />
                                        </div>
                                        <div style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', border: '1px solid #334155' }}>
                                            <div style={{ fontSize: 8, color: '#64748b' }}>HEIGHT %</div>
                                            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>{Math.round(getElementHeight(selectedEl))}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 65 }}>Size</span>
                                        <input type="range" min={5} max={100} value={selectedEl.width} onChange={e => updateEl(selectedEl.id, { width: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} />
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 24, textAlign: 'right' }}>{Math.round(selectedEl.width)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 65 }}>Opacity</span>
                                        <input type="range" min={0} max={1} step={0.05} value={selectedEl.opacity} onChange={e => updateEl(selectedEl.id, { opacity: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} />
                                        <span style={{ fontSize: 9, color: '#94a3b8', minWidth: 24, textAlign: 'right' }}>{Math.round(selectedEl.opacity * 100)}%</span>
                                    </div>
                                    <div style={{ fontSize: 8, color: '#64748b' }}>Aspect ratio locked</div>
                                </>}
                            </div>

                            <div>
                                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4 }}>POSITION</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                    <div style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', border: '1px solid #334155' }}>
                                        <div style={{ fontSize: 8, color: '#64748b' }}>X POSITION</div>
                                        <input type="number" min={0} max={100} value={Math.round(selectedEl.x)} onChange={e => updateEl(selectedEl.id, { x: Number(e.target.value) })} style={{ width: '100%', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, fontWeight: 700, outline: 'none' }} />
                                    </div>
                                    <div style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', border: '1px solid #334155' }}>
                                        <div style={{ fontSize: 8, color: '#64748b' }}>Y POSITION</div>
                                        <input type="number" min={0} max={100} value={Math.round(selectedEl.y)} onChange={e => updateEl(selectedEl.id, { y: Number(e.target.value) })} style={{ width: '100%', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, fontWeight: 700, outline: 'none' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 4 }}>
                                {selectedEl.type === 'image' && selectedEl.src ? <button onClick={() => setElementAsBackground(selectedEl.id)} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid #1d4ed8', background: '#172554', color: '#93c5fd', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🖼 Set as BG</button> : null}
                                <button onClick={() => deleteElement(selectedEl.id)} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid #7f1d1d', background: '#450a0a', color: '#fca5a5', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🗑 Delete</button>
                            </div>
                        </>) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                                <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>Click an element<br />to edit properties</div>
                                <div style={{ fontSize: 9, textAlign: 'center', color: '#334155', marginTop: 12 }}>Right-click for alignment<br />Ctrl+Z to undo</div>
                            </div>
                        )}
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button onClick={() => { if (window.confirm('รีเซ็ต Layout เป็นค่าเริ่มต้น?')) { pushUndo(elements); setElements(DEFAULT_ELEMENTS); setSelectedId(null); } }} style={{ padding: '7px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}>🔄 Reset Layout</button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
