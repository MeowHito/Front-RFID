'use client';

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import AdminLayout from '../AdminLayout';

// ---------------------------------------------------------------------------
// Types (mirror runners.service.ts getEditSummaryByScope / getEditLogsByScope)
// ---------------------------------------------------------------------------

interface EditedField {
    field: string;
    originalValue: string; // value before the admin's first edit
    expected: string;      // what the admin last saved
    current: string;       // what's on the runner right now
    drifted: boolean;      // current !== expected → something overwrote the edit
    editedAt: string;
    editedBy: string;
    source: string;
}

interface EditSummaryRow {
    key: string;
    runnerId: string | null;
    exists: boolean;
    bib: string;
    eventId: string;
    eventName: string;
    name: string;
    category: string;
    currentStatus: string;
    editCount: number;
    editors: string[];
    firstEditedAt: string;
    lastEditedAt: string;
    lastEditedBy: string;
    fields: EditedField[];
    driftedCount: number;
}

interface EditLogEntry {
    _id: string;
    bib: string;
    changedBy: string;
    changedAt: string;
    source: string;
    note?: string;
    changes: { field: string; oldValue: string; newValue: string }[];
    runnerId?: { _id: string } | string;
    eventId?: string;
}

interface Campaign {
    _id: string;
    name: string;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, { th: string; en: string }> = {
    firstName: { th: 'ชื่อ (EN)', en: 'First Name' },
    lastName: { th: 'นามสกุล (EN)', en: 'Last Name' },
    firstNameTh: { th: 'ชื่อ (TH)', en: 'First Name (TH)' },
    lastNameTh: { th: 'นามสกุล (TH)', en: 'Last Name (TH)' },
    gender: { th: 'เพศ', en: 'Gender' },
    category: { th: 'ระยะทาง', en: 'Category' },
    ageGroup: { th: 'กลุ่มอายุ', en: 'Age Group' },
    age: { th: 'อายุ', en: 'Age' },
    nationality: { th: 'สัญชาติ', en: 'Nationality' },
    birthDate: { th: 'วันเกิด', en: 'Birth Date' },
    idNo: { th: 'เลขบัตรประชาชน', en: 'ID No.' },
    team: { th: 'ทีม', en: 'Team' },
    teamName: { th: 'ชื่อทีม', en: 'Team Name' },
    chipCode: { th: 'Chip Code', en: 'Chip Code' },
    rfidTag: { th: 'RFID Tag', en: 'RFID Tag' },
    printingCode: { th: 'Printing Code', en: 'Printing Code' },
    email: { th: 'อีเมล', en: 'Email' },
    phone: { th: 'เบอร์โทร', en: 'Phone' },
    box: { th: 'Box / กลุ่มปล่อยตัว', en: 'Start Box' },
    shirtSize: { th: 'ไซซ์เสื้อ', en: 'Shirt Size' },
    province: { th: 'จังหวัด', en: 'Province' },
    address: { th: 'ที่อยู่', en: 'Address' },
    bloodType: { th: 'กรุ๊ปเลือด', en: 'Blood Type' },
    chronicDiseases: { th: 'โรคประจำตัว', en: 'Chronic Diseases' },
    medicalInfo: { th: 'ข้อมูลทางการแพทย์', en: 'Medical Info' },
    emergencyContact: { th: 'ผู้ติดต่อฉุกเฉิน', en: 'Emergency Contact' },
    emergencyPhone: { th: 'เบอร์ฉุกเฉิน', en: 'Emergency Phone' },
    status: { th: 'สถานะการวิ่ง', en: 'Race Status' },
    statusNote: { th: 'หมายเหตุสถานะ', en: 'Status Note' },
    statusCheckpoint: { th: 'จุดที่เปลี่ยนสถานะ', en: 'Status Checkpoint' },
    netTime: { th: 'Net Time', en: 'Net Time' },
    gunTime: { th: 'Gun Time', en: 'Gun Time' },
    elapsedTime: { th: 'Elapsed Time', en: 'Elapsed Time' },
    finishTime: { th: 'เวลาเข้าเส้นชัย', en: 'Finish Time' },
    startTime: { th: 'เวลาออกตัว', en: 'Start Time' },
};

const STATUS_LABELS: Record<string, { th: string; en: string; color: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#6b7280' },
    in_progress: { th: 'กำลังวิ่ง', en: 'Running', color: '#2563eb' },
    finished: { th: 'จบการแข่งขัน', en: 'Finished', color: '#16a34a' },
    dnf: { th: 'DNF', en: 'DNF', color: '#ea580c' },
    dns: { th: 'DNS', en: 'DNS', color: '#a16207' },
    dq: { th: 'DQ', en: 'DQ', color: '#dc2626' },
};

const TIME_FIELDS = new Set(['netTime', 'gunTime', 'elapsedTime']);
const DATE_FIELDS = new Set(['birthDate', 'finishTime', 'startTime']);
const STATUS_FIELD_KEYS = new Set(['status', 'statusNote', 'statusCheckpoint']);

/** Group a field into a colour-coded family so the table reads at a glance. */
function fieldGroup(field: string): 'status' | 'time' | 'identity' | 'personal' {
    if (STATUS_FIELD_KEYS.has(field)) return 'status';
    if (TIME_FIELDS.has(field) || field === 'finishTime' || field === 'startTime') return 'time';
    if (['firstName', 'lastName', 'firstNameTh', 'lastNameTh', 'gender', 'idNo', 'birthDate', 'age', 'nationality'].includes(field)) return 'identity';
    return 'personal';
}

const GROUP_STYLES: Record<string, { bg: string; border: string; text: string; th: string; en: string }> = {
    status: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', th: 'สถานะ', en: 'Status' },
    time: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', th: 'เวลา', en: 'Timing' },
    identity: { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3', th: 'ตัวตน', en: 'Identity' },
    personal: { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155', th: 'ข้อมูลส่วนตัว', en: 'Personal' },
};

/** Quote a CSV cell — Excel-safe for commas, quotes and embedded newlines. */
function escapeCsv(value: string): string {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Local timestamp for the log CSV — sortable, no timezone guessing needed. */
function csvTimestamp(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function msToClock(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '-';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function EditHistoryPage() {
    const { language } = useLanguage();
    const { token } = useAuth();
    const th = language === 'th';
    const t = (thText: string, enText: string) => (th ? thText : enText);

    const fieldLabel = useCallback((field: string) => {
        const l = FIELD_LABELS[field];
        return l ? (th ? l.th : l.en) : field;
    }, [th]);

    /** Human-readable form of a raw logged value, per field type. */
    const formatValue = useCallback((field: string, raw: string): string => {
        if (raw === '' || raw === undefined || raw === null) return '—';
        if (field === 'status') {
            const s = STATUS_LABELS[raw];
            return s ? (th ? s.th : s.en) : raw;
        }
        if (TIME_FIELDS.has(field)) return msToClock(Number(raw));
        if (DATE_FIELDS.has(field)) {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return raw;
            return field === 'birthDate'
                ? d.toLocaleDateString(th ? 'th-TH' : 'en-GB')
                : d.toLocaleString(th ? 'th-TH' : 'en-GB');
        }
        return raw;
    }, [th]);

    const fmtDateTime = useCallback((d: string) => {
        if (!d) return '-';
        return new Date(d).toLocaleString(th ? 'th-TH' : 'en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }, [th]);

    // ── State ──
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [rows, setRows] = useState<EditSummaryRow[]>([]);
    const [logs, setLogs] = useState<EditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [onlyDrifted, setOnlyDrifted] = useState(false);
    const [eventFilter, setEventFilter] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [restoreTarget, setRestoreTarget] = useState<EditSummaryRow | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const authHeaders = useCallback(
        (): HeadersInit => (token ? { Authorization: `Bearer ${token}` } : {}),
        [token],
    );

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'error' ? 6000 : 3500);
    };

    const load = useCallback(async (campaignId: string) => {
        setLoading(true);
        try {
            const [summaryRes, logsRes] = await Promise.all([
                fetch(`/api/runners/edit-summary?campaignId=${campaignId}`, { headers: authHeaders(), cache: 'no-store' }),
                fetch(`/api/runners/edit-logs?campaignId=${campaignId}&limit=3000`, { headers: authHeaders(), cache: 'no-store' }),
            ]);
            setRows(summaryRes.ok ? (await summaryRes.json()) || [] : []);
            setLogs(logsRes.ok ? (await logsRes.json()) || [] : []);
        } catch {
            setRows([]);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('no featured campaign');
                const data = await res.json();
                if (data?._id) {
                    setCampaign(data);
                    await load(data._id);
                    return;
                }
            } catch { /* fall through to empty state */ }
            setCampaign(null);
            setLoading(false);
        })();
    }, [load]);

    // ── Derived ──
    const events = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of rows) {
            if (r.eventId) map.set(r.eventId, r.eventName || r.category || r.eventId.slice(-6));
        }
        return [...map.entries()].map(([id, name]) => ({ id, name }));
    }, [rows]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (onlyDrifted && r.driftedCount === 0) return false;
            if (eventFilter && r.eventId !== eventFilter) return false;
            if (!q) return true;
            return String(r.bib).toLowerCase().includes(q)
                || (r.name || '').toLowerCase().includes(q)
                || (r.editors || []).some(e => e.toLowerCase().includes(q));
        });
    }, [rows, search, onlyDrifted, eventFilter]);

    const stats = useMemo(() => ({
        runners: rows.length,
        drifted: rows.filter(r => r.driftedCount > 0).length,
        edits: rows.reduce((sum, r) => sum + r.editCount, 0),
        statusEdits: rows.filter(r => r.fields.some(f => f.field === 'status')).length,
    }), [rows]);

    const logsByRow = useCallback((row: EditSummaryRow) => (
        logs
            .filter(l => {
                if (String(l.bib) !== String(row.bib)) return false;
                if (row.eventId && l.eventId) return String(l.eventId) === String(row.eventId);
                const rid = typeof l.runnerId === 'object' ? l.runnerId?._id : l.runnerId;
                return !row.runnerId || String(rid) === String(row.runnerId);
            })
            .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
    ), [logs]);

    const toggleExpand = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // ── Actions ──
    const doRestore = async () => {
        if (!restoreTarget?.runnerId) return;
        setRestoring(true);
        try {
            const res = await fetch(`/api/runners/${restoreTarget.runnerId}/restore-edits`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'restore failed');
            if (data.restored) {
                showToast(
                    t(`กู้คืน BIB ${data.bib} สำเร็จ (${data.applied.length} ช่อง)`,
                        `Restored BIB ${data.bib} (${data.applied.length} field(s))`),
                    'success',
                );
            } else {
                showToast(t('ค่าปัจจุบันตรงกับที่แก้ไขอยู่แล้ว ไม่มีอะไรต้องกู้คืน', 'Already matches the saved edits — nothing to restore'), 'success');
            }
            setRestoreTarget(null);
            if (campaign) await load(campaign._id);
        } catch (e) {
            showToast(t('กู้คืนไม่สำเร็จ: ', 'Restore failed: ') + (e as Error).message, 'error');
        } finally {
            setRestoring(false);
        }
    };

    /**
     * Download the raw edit log as CSV — one row per changed field, newest first.
     * It follows what's on screen: the distance filter and the search box both
     * apply, so "ดูเฉพาะ 21K แล้วโหลด" gives you just that distance. BIB name and
     * distance come from the summary rows, which the log entries don't carry.
     */
    const exportCsv = () => {
        const metaByBib = new Map<string, EditSummaryRow>();
        for (const r of filtered) metaByBib.set(`${r.bib}::${r.eventId || ''}`, r);

        const q = search.trim().toLowerCase();
        const entries = logs
            .filter(l => {
                if (eventFilter && String(l.eventId || '') !== eventFilter) return false;
                if (!q) return true;
                const meta = metaByBib.get(`${l.bib}::${l.eventId || ''}`);
                return String(l.bib).toLowerCase().includes(q)
                    || (l.changedBy || '').toLowerCase().includes(q)
                    || (meta?.name || '').toLowerCase().includes(q);
            })
            .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

        const header = [
            t('เวลาที่แก้ไข', 'Changed At'), 'BIB', t('ชื่อ-นามสกุล', 'Name'), t('ระยะ', 'Event'),
            t('ช่องที่แก้', 'Field'), t('ค่าเดิม', 'Old Value'), t('ค่าใหม่', 'New Value'),
            t('แก้ไขโดย', 'Changed By'), t('ที่มา', 'Source'), t('หมายเหตุ', 'Note'),
        ];

        const lines = [header.map(escapeCsv).join(',')];
        for (const entry of entries) {
            const meta = metaByBib.get(`${entry.bib}::${entry.eventId || ''}`);
            for (const change of entry.changes || []) {
                lines.push([
                    csvTimestamp(entry.changedAt),
                    String(entry.bib ?? ''),
                    meta?.name || '',
                    meta?.eventName || meta?.category || '',
                    fieldLabel(change.field),
                    formatValue(change.field, change.oldValue),
                    formatValue(change.field, change.newValue),
                    entry.changedBy || '',
                    entry.source || '',
                    entry.note || '',
                ].map(escapeCsv).join(','));
            }
        }

        if (lines.length === 1) {
            showToast(t('ไม่มี log ให้ดาวน์โหลด', 'No log entries to download'), 'error');
            return;
        }

        // BOM so Excel reads the Thai names as UTF-8 instead of mojibake.
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const slug = (campaign?.name || 'campaign').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
        a.href = url;
        a.download = `edit-history-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t(`ดาวน์โหลด ${lines.length - 1} รายการแล้ว`, `Downloaded ${lines.length - 1} rows`), 'success');
    };

    const doDeleteLogs = async () => {
        if (!campaign) return;
        setDeleting(true);
        try {
            const qs = new URLSearchParams({ campaignId: campaign._id });
            if (eventFilter) qs.set('eventId', eventFilter);
            const res = await fetch(`/api/runners/edit-logs?${qs.toString()}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'delete failed');
            showToast(t(`ลบ log แล้ว ${data.deleted} รายการ`, `Deleted ${data.deleted} log entries`), 'success');
            setShowDeleteModal(false);
            await load(campaign._id);
        } catch (e) {
            showToast(t('ลบ log ไม่สำเร็จ: ', 'Delete failed: ') + (e as Error).message, 'error');
        } finally {
            setDeleting(false);
        }
    };

    // ── Render ──
    return (
        <AdminLayout
            breadcrumbItems={[{ label: 'ประวัติการแก้ไขข้อมูล', labelEn: 'Edit History' }]}
            pageTitle={t('ประวัติการแก้ไขข้อมูล', 'Edit History')}
        >
            {toast && (
                <div style={{
                    position: 'fixed', top: 70, right: 20, zIndex: 3000,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626',
                    color: '#fff', padding: '11px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.2)', maxWidth: 460,
                }}>{toast.message}</div>
            )}

            {/* ── Explainer ── */}
            <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderLeft: '4px solid #2563eb',
                borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#1e3a5f', lineHeight: 1.7,
            }}>
                <strong style={{ display: 'block', marginBottom: 4, fontSize: 13.5 }}>
                    {t('บันทึกการแก้ไขทุกครั้งของแอดมิน — ไม่หายจนกว่าจะกดลบเอง',
                        'Permanent record of every admin edit — it stays until you delete it')}
                </strong>
                {t('ทุกครั้งที่แอดมินแก้ชื่อ นามสกุล ข้อมูลส่วนตัว หรือสถานะการวิ่ง ระบบจะบันทึกไว้ที่นี่ ถ้ามีคนกด Sync from RaceTiger แล้วข้อมูลเก่ากลับมาทับ แถวนั้นจะขึ้นป้าย ',
                    'Every admin change to a name, personal detail, or race status is recorded here. If someone runs Sync from RaceTiger and the old data overwrites an edit, that row is flagged ')}
                <span style={{
                    background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5',
                    borderRadius: 4, padding: '1px 6px', fontWeight: 700, fontSize: 12,
                }}>{t('ถูก sync ทับ', 'overwritten by sync')}</span>
                {t(' และกดปุ่ม "กู้คืน" เพื่อเปลี่ยนเฉพาะคนนั้นกลับไปเป็นค่าที่แก้ไขไว้ได้ทันที',
                    ' — press “Restore” to put that one runner back to the values the admin saved.')}
            </div>

            {/* ── Stat tiles ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                    { label: t('คนที่ถูกแก้ไข', 'Runners edited'), value: stats.runners, color: '#334155', bg: '#fff' },
                    { label: t('ถูก sync ทับ', 'Overwritten by sync'), value: stats.drifted, color: '#b91c1c', bg: stats.drifted > 0 ? '#fef2f2' : '#fff' },
                    { label: t('แก้ไขสถานะการวิ่ง', 'Race status edited'), value: stats.statusEdits, color: '#92400e', bg: '#fff' },
                    { label: t('การแก้ไขทั้งหมด', 'Total edits logged'), value: stats.edits, color: '#334155', bg: '#fff' },
                ].map(s => (
                    <div key={s.label} style={{
                        background: s.bg, border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px',
                    }}>
                        <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* ── Toolbar ── */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                    padding: '11px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginRight: 4 }}>
                        {campaign?.name || t('ยังไม่ได้เลือกกิจกรรม', 'No campaign selected')}
                    </span>

                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t('ค้นหา BIB / ชื่อ / ผู้แก้ไข', 'Search BIB / name / editor')}
                        style={{
                            padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
                            fontSize: 12.5, width: 230, outline: 'none',
                        }}
                    />

                    {events.length > 1 && (
                        <select
                            value={eventFilter}
                            onChange={e => setEventFilter(e.target.value)}
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12.5, background: '#fff' }}
                        >
                            <option value="">{t('ทุกระยะ', 'All events')}</option>
                            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                        </select>
                    )}

                    <button
                        onClick={() => setOnlyDrifted(v => !v)}
                        style={{
                            padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${onlyDrifted ? '#dc2626' : '#cbd5e1'}`,
                            background: onlyDrifted ? '#dc2626' : '#fff',
                            color: onlyDrifted ? '#fff' : '#475569',
                        }}
                    >
                        {onlyDrifted
                            ? t(`⚠ เฉพาะที่ถูกทับ (${stats.drifted})`, `⚠ Overwritten only (${stats.drifted})`)
                            : t(`ดูเฉพาะที่ถูกทับ (${stats.drifted})`, `Show overwritten only (${stats.drifted})`)}
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button
                            onClick={exportCsv}
                            disabled={loading || logs.length === 0}
                            title={t('ดาวน์โหลด log ตามตัวกรองที่เลือกอยู่ (CSV เปิดด้วย Excel ได้)',
                                'Download the log for the current filters (CSV, opens in Excel)')}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #16a34a',
                                background: '#fff', color: '#15803d', fontSize: 12.5, fontWeight: 700,
                                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: logs.length === 0 ? 0.5 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {t('ดาวน์โหลด log (CSV)', 'Download log (CSV)')}
                        </button>
                        <button
                            onClick={() => campaign && load(campaign._id)}
                            disabled={loading || !campaign}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #3c8dbc',
                                background: '#3c8dbc', color: '#fff', fontSize: 12.5, fontWeight: 600,
                                cursor: 'pointer', opacity: loading ? 0.6 : 1,
                            }}
                        >
                            {loading ? t('กำลังโหลด...', 'Loading...') : t('รีเฟรช', 'Refresh')}
                        </button>
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            disabled={!campaign || rows.length === 0}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #fca5a5',
                                background: '#fff', color: '#b91c1c', fontSize: 12.5, fontWeight: 600,
                                cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1,
                            }}
                        >
                            {t('ลบ log ของกิจกรรมนี้', 'Clear log for this campaign')}
                        </button>
                    </div>
                </div>

                {/* ── Table ── */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                {[
                                    { label: 'BIB', w: 92 },
                                    { label: t('ชื่อ-นามสกุล', 'Name'), w: 210 },
                                    { label: t('สิ่งที่แอดมินแก้ไข', 'What the admin changed'), w: undefined },
                                    { label: t('แก้ไขล่าสุดโดย', 'Last edited by'), w: 170 },
                                    { label: t('สถานะข้อมูล', 'Data state'), w: 150 },
                                    { label: '', w: 170 },
                                ].map((h, i) => (
                                    <th key={i} style={{
                                        padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#334155',
                                        borderBottom: '2px solid #cbd5e1', fontSize: 12, whiteSpace: 'nowrap',
                                        width: h.w, position: 'sticky', top: 0, background: '#f1f5f9',
                                    }}>{h.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                    {t('กำลังโหลด...', 'Loading...')}
                                </td></tr>
                            ) : !campaign ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                    {t('ยังไม่ได้เลือกกิจกรรม — ไปที่หน้าจัดการอีเวนต์แล้วกดดาวเลือกกิจกรรมที่ทำงานอยู่',
                                        'No campaign selected — go to Manage Events and star the campaign you are working on.')}
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                    {rows.length === 0
                                        ? t('ยังไม่มีการแก้ไขข้อมูลในกิจกรรมนี้', 'No edits recorded for this campaign yet')
                                        : t('ไม่พบรายการที่ตรงกับตัวกรอง', 'No rows match the current filter')}
                                </td></tr>
                            ) : filtered.map((row, idx) => {
                                const isOpen = expanded.has(row.key);
                                const drift = row.driftedCount > 0;
                                const statusInfo = STATUS_LABELS[row.currentStatus];
                                return (
                                    <Fragment key={row.key}>
                                        <tr
                                            style={{
                                                borderBottom: '1px solid #e2e8f0',
                                                background: drift ? '#fff7f7' : (idx % 2 === 0 ? '#fff' : '#fbfcfd'),
                                                borderLeft: drift ? '4px solid #dc2626' : '4px solid transparent',
                                            }}
                                        >
                                            {/* BIB */}
                                            <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                                                <div style={{
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                                    fontSize: 15, fontWeight: 800, color: '#0f172a',
                                                }}>{row.bib}</div>
                                                {row.eventName && (
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{row.eventName}</div>
                                                )}
                                            </td>

                                            {/* Name */}
                                            <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.name || '—'}</div>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                                                    {row.category && (
                                                        <span style={{
                                                            fontSize: 11, background: '#f1f5f9', color: '#475569',
                                                            border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 6px',
                                                        }}>{row.category}</span>
                                                    )}
                                                    {statusInfo && (
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, color: statusInfo.color,
                                                            border: `1px solid ${statusInfo.color}44`, background: `${statusInfo.color}12`,
                                                            borderRadius: 4, padding: '1px 6px',
                                                        }}>{th ? statusInfo.th : statusInfo.en}</span>
                                                    )}
                                                    {!row.exists && (
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, color: '#7c2d12',
                                                            background: '#ffedd5', border: '1px solid #fdba74',
                                                            borderRadius: 4, padding: '1px 6px',
                                                        }}>{t('ไม่พบนักวิ่งแล้ว', 'Runner removed')}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Changed fields */}
                                            <td style={{ padding: '9px 12px', verticalAlign: 'top' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {row.fields.map(f => {
                                                        const g = GROUP_STYLES[fieldGroup(f.field)];
                                                        return (
                                                            <div key={f.field} style={{
                                                                display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                                                                background: f.drifted ? '#fef2f2' : 'transparent',
                                                                border: f.drifted ? '1px solid #fecaca' : '1px solid transparent',
                                                                borderRadius: 5, padding: f.drifted ? '3px 7px' : '3px 0',
                                                            }}>
                                                                <span style={{
                                                                    fontSize: 11, fontWeight: 700, background: g.bg,
                                                                    border: `1px solid ${g.border}`, color: g.text,
                                                                    borderRadius: 4, padding: '1px 7px', whiteSpace: 'nowrap',
                                                                }}>{fieldLabel(f.field)}</span>

                                                                {f.drifted ? (
                                                                    <span style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                        <span style={{ color: '#94a3b8' }}>{t('ตอนนี้', 'now')}</span>
                                                                        <strong style={{ color: '#b91c1c', textDecoration: 'line-through' }}>
                                                                            {formatValue(f.field, f.current)}
                                                                        </strong>
                                                                        <span style={{ color: '#94a3b8' }}>→ {t('ควรเป็น', 'should be')}</span>
                                                                        <strong style={{ color: '#15803d' }}>{formatValue(f.field, f.expected)}</strong>
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: 12.5, color: '#334155' }}>
                                                                        <span style={{ color: '#cbd5e1', textDecoration: 'line-through', marginRight: 6 }}>
                                                                            {formatValue(f.field, f.originalValue)}
                                                                        </span>
                                                                        <strong style={{ color: '#0f172a' }}>{formatValue(f.field, f.expected)}</strong>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            {/* Editor */}
                                            <td style={{ padding: '11px 12px', verticalAlign: 'top', fontSize: 12 }}>
                                                <div style={{ fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>{row.lastEditedBy || '—'}</div>
                                                <div style={{ color: '#94a3b8', marginTop: 3, whiteSpace: 'nowrap' }}>{fmtDateTime(row.lastEditedAt)}</div>
                                                <div style={{ color: '#94a3b8', marginTop: 2 }}>
                                                    {t(`แก้ไข ${row.editCount} ครั้ง`, `${row.editCount} edit(s)`)}
                                                </div>
                                            </td>

                                            {/* Drift badge */}
                                            <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                                                {drift ? (
                                                    <span style={{
                                                        display: 'inline-block', background: '#fee2e2', color: '#b91c1c',
                                                        border: '1px solid #fca5a5', borderRadius: 5, padding: '4px 9px',
                                                        fontSize: 12, fontWeight: 700, lineHeight: 1.4,
                                                    }}>
                                                        ⚠ {t(`ถูก sync ทับ ${row.driftedCount} ช่อง`, `Overwritten (${row.driftedCount})`)}
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-block', background: '#dcfce7', color: '#15803d',
                                                        border: '1px solid #86efac', borderRadius: 5, padding: '4px 9px',
                                                        fontSize: 12, fontWeight: 700,
                                                    }}>
                                                        ✓ {t('ตรงตามที่แก้ไข', 'Matches edits')}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '11px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                                <button
                                                    onClick={() => setRestoreTarget(row)}
                                                    disabled={!row.exists || !drift}
                                                    title={!row.exists
                                                        ? t('ไม่พบนักวิ่งคนนี้แล้ว', 'Runner no longer exists')
                                                        : !drift
                                                            ? t('ค่าปัจจุบันตรงกับที่แก้ไขอยู่แล้ว', 'Current values already match the edits')
                                                            : t('เปลี่ยนกลับไปเป็นค่าที่แอดมินแก้ไขไว้', 'Restore the values the admin saved')}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700,
                                                        border: `1px solid ${drift && row.exists ? '#16a34a' : '#e2e8f0'}`,
                                                        background: drift && row.exists ? '#16a34a' : '#f8fafc',
                                                        color: drift && row.exists ? '#fff' : '#94a3b8',
                                                        cursor: drift && row.exists ? 'pointer' : 'not-allowed',
                                                    }}
                                                >
                                                    ↩ {t('กู้คืน', 'Restore')}
                                                </button>
                                                <button
                                                    onClick={() => toggleExpand(row.key)}
                                                    style={{
                                                        marginLeft: 6, padding: '6px 10px', borderRadius: 6, fontSize: 12.5,
                                                        border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer',
                                                    }}
                                                >
                                                    {isOpen ? t('ซ่อน', 'Hide') : t('ประวัติ', 'History')}
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Expanded per-BIB timeline */}
                                        {isOpen && (
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <td colSpan={6} style={{ padding: '12px 20px 16px 30px' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                                                        {t(`ประวัติการแก้ไขทั้งหมดของ BIB ${row.bib}`, `Full edit history for BIB ${row.bib}`)}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                                        {logsByRow(row).map(log => {
                                                            // Entries written before `source` existed on the schema are plain edits.
                                                            const src = log.source || 'edit';
                                                            return (
                                                            <div key={log._id} style={{
                                                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                                                                padding: '9px 12px', fontSize: 12.5,
                                                            }}>
                                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                                                                    <span style={{
                                                                        fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '1px 7px',
                                                                        background: src === 'restore' ? '#dcfce7' : src === 'edit' ? '#e0e7ff' : '#fef3c7',
                                                                        color: src === 'restore' ? '#15803d' : src === 'edit' ? '#3730a3' : '#92400e',
                                                                    }}>
                                                                        {src === 'restore' ? t('กู้คืน', 'Restore')
                                                                            : src === 'edit' ? t('แก้ไขข้อมูล', 'Edit')
                                                                                : t('เปลี่ยนสถานะ', 'Status change')}
                                                                    </span>
                                                                    <strong style={{ color: '#334155' }}>{log.changedBy}</strong>
                                                                    <span style={{ color: '#94a3b8' }}>{fmtDateTime(log.changedAt)}</span>
                                                                    {log.note && <span style={{ color: '#64748b', fontStyle: 'italic' }}>“{log.note}”</span>}
                                                                </div>
                                                                {log.changes.map((c, i) => (
                                                                    <div key={i} style={{ color: '#475569', paddingLeft: 2, lineHeight: 1.8 }}>
                                                                        <span style={{ fontWeight: 600 }}>{fieldLabel(c.field)}:</span>{' '}
                                                                        <span style={{ color: '#b91c1c' }}>{formatValue(c.field, c.oldValue)}</span>
                                                                        {' → '}
                                                                        <span style={{ color: '#15803d', fontWeight: 600 }}>{formatValue(c.field, c.newValue)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Restore confirmation ── */}
            {restoreTarget && (
                <div
                    onClick={() => !restoring && setRestoreTarget(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                    }}
                >
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 620,
                        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                {t('ยืนยันการกู้คืนข้อมูล', 'Confirm restore')}
                            </h3>
                            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
                                {t(`เปลี่ยนเฉพาะ BIB ${restoreTarget.bib} กลับไปเป็นค่าที่แอดมินแก้ไขไว้ ไม่กระทบนักวิ่งคนอื่น`,
                                    `Only BIB ${restoreTarget.bib} will change — no other runner is affected.`)}
                            </div>
                        </div>

                        <div style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 10 }}>
                                {restoreTarget.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({restoreTarget.category})</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                            {t('ช่องข้อมูล', 'Field')}
                                        </th>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                            {t('ค่าตอนนี้', 'Current')}
                                        </th>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                            {t('จะเปลี่ยนเป็น', 'Will become')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {restoreTarget.fields.filter(f => f.drifted).map(f => (
                                        <tr key={f.field} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#334155' }}>{fieldLabel(f.field)}</td>
                                            <td style={{ padding: '8px 10px', color: '#b91c1c', textDecoration: 'line-through' }}>
                                                {formatValue(f.field, f.current)}
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#15803d', fontWeight: 700 }}>
                                                {formatValue(f.field, f.expected)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ padding: '13px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                onClick={() => setRestoreTarget(null)}
                                disabled={restoring}
                                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' }}
                            >
                                {t('ยกเลิก', 'Cancel')}
                            </button>
                            <button
                                onClick={doRestore}
                                disabled={restoring}
                                style={{
                                    padding: '8px 18px', borderRadius: 6, border: 'none', background: '#16a34a',
                                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: restoring ? 0.6 : 1,
                                }}
                            >
                                {restoring ? t('กำลังกู้คืน...', 'Restoring...') : t('ยืนยัน กู้คืนค่าเดิม', 'Confirm restore')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete-log confirmation ── */}
            {showDeleteModal && (
                <div
                    onClick={() => !deleting && setShowDeleteModal(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                    }}
                >
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 480,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#b91c1c' }}>
                                {t('ลบบันทึกการแก้ไข', 'Clear edit history')}
                            </h3>
                        </div>
                        <div style={{ padding: '16px 20px', fontSize: 13.5, color: '#334155', lineHeight: 1.8 }}>
                            {t('บันทึกการแก้ไขของ ', 'All edit history for ')}
                            <strong>{campaign?.name}</strong>
                            {eventFilter && <> ({events.find(e => e.id === eventFilter)?.name})</>}
                            {t(' จะถูกลบถาวรและกู้คืนไม่ได้', ' will be permanently deleted and cannot be recovered.')}
                            <div style={{
                                marginTop: 10, background: '#fffbeb', border: '1px solid #fde68a',
                                borderRadius: 6, padding: '9px 12px', fontSize: 12.5, color: '#92400e',
                            }}>
                                {t('ข้อมูลนักวิ่งจะไม่ถูกแตะต้อง — ลบเฉพาะประวัติ และหลังลบแล้วจะกดปุ่ม "กู้คืน" ไม่ได้อีก',
                                    'Runner data is untouched — only the history is removed. After this, the “Restore” buttons will no longer be available.')}
                            </div>
                        </div>
                        <div style={{ padding: '13px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' }}
                            >
                                {t('ยกเลิก', 'Cancel')}
                            </button>
                            <button
                                onClick={doDeleteLogs}
                                disabled={deleting}
                                style={{
                                    padding: '8px 18px', borderRadius: 6, border: 'none', background: '#dc2626',
                                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleting ? 0.6 : 1,
                                }}
                            >
                                {deleting ? t('กำลังลบ...', 'Deleting...') : t('ลบถาวร', 'Delete permanently')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
