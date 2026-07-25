'use client';

/**
 * Pointer-driven slider + colour picker used by the Check BIB 2 designer.
 * Plain pointer events (not <input type=range>) so click-and-drag scrubbing
 * keeps working while the canvas has its own global pointer handlers.
 */

import React, { useEffect, useRef } from 'react';

export function DragSlider({ min, max, step = 1, value, onChange, color = '#0ea5e9', trackBackground }: {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (v: number) => void;
    color?: string;
    trackBackground?: string;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    // Window pointer listeners outlive a render, so keep the latest callback in a ref.
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; });

    const updateFromClientX = (clientX: number) => {
        const node = trackRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        let v = min + pct * (max - min);
        v = Math.round(v / step) * step;
        v = Math.max(min, Math.min(max, v));
        const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        if (decimals > 0) v = Number(v.toFixed(decimals));
        onChangeRef.current(v);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        updateFromClientX(e.clientX);
        const onMove = (ev: PointerEvent) => { ev.preventDefault(); updateFromClientX(ev.clientX); };
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
        <div ref={trackRef} onPointerDown={onPointerDown}
            style={{ position: 'relative', height: 22, width: '100%', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>
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
                borderRadius: '50%', background: '#fff', border: `2px solid ${color}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)', pointerEvents: 'none',
            }} />
        </div>
    );
}

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

const SWATCHES = [
    '#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#ffffff',
    '#dc2626', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#16a34a',
    '#22c55e', '#0ea5e9', '#3b82f6', '#1e40af', '#8b5cf6', '#ec4899',
];

export function DragColorPicker({ value, onChange, allowClear }: {
    value: string;
    onChange: (v: string) => void;
    allowClear?: boolean;
}) {
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
                <input value={value} onChange={e => onChange(e.target.value)} placeholder={allowClear ? 'โปร่งใส' : '#ffffff'}
                    style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'monospace', boxSizing: 'border-box' }} />
                {allowClear && (
                    <button type="button" onClick={() => onChange('')} title="ไม่ใส่สี (โปร่งใส)"
                        style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b' }}>✕</button>
                )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 3 }}>
                {SWATCHES.map(c => (
                    <button type="button" key={c} onClick={() => onChange(c)} title={c}
                        style={{
                            height: 16, borderRadius: 3, cursor: 'pointer', background: c,
                            border: value?.toLowerCase() === c ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                        }} />
                ))}
            </div>
            <div title="Hue">
                <DragSlider min={0} max={360} value={hsl.h} onChange={v => setHsl({ h: v })} color="#0f172a"
                    trackBackground="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" />
            </div>
            <div title="Saturation">
                <DragSlider min={0} max={100} value={hsl.s} onChange={v => setHsl({ s: v })} color="#0f172a"
                    trackBackground={`linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`} />
            </div>
            <div title="Lightness">
                <DragSlider min={0} max={100} value={hsl.l} onChange={v => setHsl({ l: v })} color="#0f172a"
                    trackBackground={`linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)`} />
            </div>
        </div>
    );
}
