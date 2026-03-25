'use client';
import React, { useState, useEffect, useRef } from 'react';

interface CutoffDateTimePickerProps {
    value: string; // ISO format "YYYY-MM-DDTHH:mm" or ""
    onChange: (isoValue: string) => void;
    onClose: () => void;
    anchorRect?: DOMRect | null;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function parseIso(val: string) {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) return { year: +m[1], month: +m[2] - 1, day: +m[3], hour: +m[4], minute: +m[5] };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), hour: 0, minute: 0 };
}

function pad2(n: number) { return n.toString().padStart(2, '0'); }

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) { return new Date(year, month, 1).getDay(); }

export default function CutoffDateTimePicker({ value, onChange, onClose, anchorRect }: CutoffDateTimePickerProps) {
    const parsed = parseIso(value || '');
    const [viewYear, setViewYear] = useState(parsed.year);
    const [viewMonth, setViewMonth] = useState(parsed.month);
    const [selDay, setSelDay] = useState(parsed.day);
    const [selHour, setSelHour] = useState(parsed.hour);
    const [selMinute, setSelMinute] = useState(parsed.minute);
    const [selYear, setSelYear] = useState(parsed.year);
    const [selMonth, setSelMonth] = useState(parsed.month);

    const overlayRef = useRef<HTMLDivElement>(null);
    const hourRef = useRef<HTMLDivElement>(null);
    const minRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Scroll to selected hour/minute on mount
    useEffect(() => {
        setTimeout(() => {
            if (hourRef.current) {
                const el = hourRef.current.querySelector(`[data-hour="${selHour}"]`);
                el?.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
            if (minRef.current) {
                const el = minRef.current.querySelector(`[data-min="${selMinute}"]`);
                el?.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }, 50);
    }, []);

    const handlePrevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const handleNextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const handleSelectDay = (day: number) => {
        setSelDay(day);
        setSelMonth(viewMonth);
        setSelYear(viewYear);
    };

    const handleApply = () => {
        // Include timezone offset so server (EC2/UTC) correctly interprets local time
        const d = new Date(selYear, selMonth, selDay, selHour, selMinute);
        const offset = -d.getTimezoneOffset(); // positive = east of UTC (e.g. +420 for UTC+7)
        const sign = offset >= 0 ? '+' : '-';
        const absOff = Math.abs(offset);
        const offHH = pad2(Math.floor(absOff / 60));
        const offMM = pad2(absOff % 60);
        const iso = `${selYear}-${pad2(selMonth + 1)}-${pad2(selDay)}T${pad2(selHour)}:${pad2(selMinute)}${sign}${offHH}:${offMM}`;
        onChange(iso);
        onClose();
    };

    const handleClear = () => {
        onChange('');
        onClose();
    };

    // Calendar grid
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
    const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);
    const today = new Date();
    const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = (d: number) => d === selDay && viewMonth === selMonth && viewYear === selYear;

    // Build calendar cells
    const cells: Array<{ day: number; current: boolean }> = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, current: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true });
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) cells.push({ day: d, current: false });

    // Position: try to place near anchor
    const style: React.CSSProperties = {
        position: 'fixed',
        zIndex: 50000,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
    };
    if (anchorRect) {
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const top = spaceBelow > 560 ? anchorRect.bottom + 4 : Math.max(8, anchorRect.top - 530);
        style.top = top;
        style.left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 680));
        style.transform = 'none';
    }

    return (
        <>
            {/* Backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 49999, background: 'rgba(0,0,0,0.15)' }} />
            {/* Picker */}
            <div ref={overlayRef} style={style}>
                <div style={{
                    width: 660, background: '#fff', borderRadius: 16,
                    boxShadow: '0 32px 64px -16px rgba(0,61,155,0.18)',
                    border: '1px solid #e2e8f0', overflow: 'hidden',
                    fontFamily: "'Inter', system-ui, sans-serif",
                }}>
                    <div style={{ display: 'flex', height: 420 }}>
                        {/* Left: Calendar */}
                        <div style={{ width: '60%', padding: 28, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                    {MONTHS_EN[viewMonth]} {viewYear}
                                </span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={handlePrevMonth} style={navBtnStyle}>‹</button>
                                    <button onClick={handleNextMonth} style={navBtnStyle}>›</button>
                                </div>
                            </div>
                            {/* Weekday labels */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 8 }}>
                                {WEEKDAYS.map(d => (
                                    <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        {d}
                                    </div>
                                ))}
                            </div>
                            {/* Days grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, flex: 1 }}>
                                {cells.map((c, i) => {
                                    if (!c.current) {
                                        return <div key={i} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#cbd5e1' }}>{c.day}</div>;
                                    }
                                    const sel = isSelected(c.day);
                                    const tod = isToday(c.day);
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleSelectDay(c.day)}
                                            style={{
                                                height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 13, fontWeight: sel ? 700 : 500, borderRadius: 8, border: 'none', cursor: 'pointer',
                                                background: sel ? '#2563eb' : 'transparent',
                                                color: sel ? '#fff' : '#334155',
                                                outline: tod && !sel ? '2px solid #94a3b8' : 'none',
                                                outlineOffset: -2,
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!sel) { (e.target as HTMLElement).style.background = '#eff6ff'; (e.target as HTMLElement).style.color = '#1d4ed8'; } }}
                                            onMouseLeave={e => { if (!sel) { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#334155'; } }}
                                        >
                                            {c.day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: 24h Time Picker */}
                        <div style={{ width: '40%', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {/* Time display */}
                            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.5)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                                    Select Time (24h)
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                                    <span>{pad2(selHour)}</span>
                                    <span style={{ opacity: 0.5 }}>:</span>
                                    <span>{pad2(selMinute)}</span>
                                </div>
                            </div>
                            {/* Hour + Minute columns */}
                            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                                {/* Hours */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f1f5f9' }}>
                                    <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center', background: 'rgba(241,245,249,0.5)' }}>
                                        Hour
                                    </div>
                                    <div ref={hourRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 2 }} className="time-scroll">
                                        {HOURS.map(h => (
                                            <button
                                                key={h}
                                                data-hour={h}
                                                onClick={() => setSelHour(h)}
                                                style={{
                                                    padding: '7px 4px', fontSize: 13, fontWeight: h === selHour ? 700 : 500,
                                                    borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0,
                                                    background: h === selHour ? '#2563eb' : 'transparent',
                                                    color: h === selHour ? '#fff' : '#64748b',
                                                    boxShadow: h === selHour ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { if (h !== selHour) { (e.target as HTMLElement).style.background = '#fff'; (e.target as HTMLElement).style.color = '#2563eb'; } }}
                                                onMouseLeave={e => { if (h !== selHour) { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#64748b'; } }}
                                            >
                                                {pad2(h)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Minutes */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center', background: 'rgba(241,245,249,0.5)' }}>
                                        Min
                                    </div>
                                    <div ref={minRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 2 }} className="time-scroll">
                                        {MINUTES.map(m => (
                                            <button
                                                key={m}
                                                data-min={m}
                                                onClick={() => setSelMinute(m)}
                                                style={{
                                                    padding: '7px 4px', fontSize: 13, fontWeight: m === selMinute ? 700 : 500,
                                                    borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0,
                                                    background: m === selMinute ? '#2563eb' : 'transparent',
                                                    color: m === selMinute ? '#fff' : '#64748b',
                                                    boxShadow: m === selMinute ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { if (m !== selMinute) { (e.target as HTMLElement).style.background = '#fff'; (e.target as HTMLElement).style.color = '#2563eb'; } }}
                                                onMouseLeave={e => { if (m !== selMinute) { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#64748b'; } }}
                                            >
                                                {pad2(m)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                            <button onClick={handleClear} style={clearBtnStyle}>Clear</button>
                        </div>
                        <button onClick={handleApply} style={applyBtnStyle}>
                            Apply Selection
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                .time-scroll::-webkit-scrollbar { width: 4px; }
                .time-scroll::-webkit-scrollbar-track { background: transparent; }
                .time-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .time-scroll:hover::-webkit-scrollbar-thumb { background: #cbd5e1; }
            `}</style>
        </>
    );
}

const navBtnStyle: React.CSSProperties = {
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent',
    fontSize: 18, color: '#475569', fontWeight: 600,
};

const cancelBtnStyle: React.CSSProperties = {
    padding: '8px 20px', fontSize: 13, fontWeight: 600,
    color: '#64748b', background: 'transparent', border: 'none',
    borderRadius: 999, cursor: 'pointer',
};

const clearBtnStyle: React.CSSProperties = {
    padding: '8px 20px', fontSize: 13, fontWeight: 600,
    color: '#dc2626', background: 'transparent', border: '1px solid #fecaca',
    borderRadius: 999, cursor: 'pointer',
};

const applyBtnStyle: React.CSSProperties = {
    padding: '8px 24px', fontSize: 13, fontWeight: 700,
    color: '#fff', background: '#2563eb', border: 'none',
    borderRadius: 999, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
};
