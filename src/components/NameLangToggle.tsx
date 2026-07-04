'use client';

import type { CSSProperties } from 'react';
import type { NameLang } from '@/lib/winner-excel';

/**
 * TH / EN toggle that controls which language the runner names are written in
 * when a winner board is downloaded as an Excel file. 'th' uses the Thai name
 * when the runner has one (falling back to English), 'en' always uses English.
 * The toggle only affects the downloaded file — the on-screen board is unchanged.
 */
export default function NameLangToggle({
    value,
    onChange,
    isMobile = false,
}: {
    value: NameLang;
    onChange: (lang: NameLang) => void;
    isMobile?: boolean;
}) {
    const btn = (lang: NameLang, label: string): CSSProperties => ({
        padding: isMobile ? '5px 12px' : '0.35vh 0.7vw',
        fontSize: isMobile ? 11 : '1.15vh',
        fontWeight: 800,
        cursor: 'pointer',
        border: 'none',
        background: value === lang ? '#38bdf8' : 'transparent',
        color: value === lang ? '#082f49' : '#94a3b8',
        transition: 'background 0.15s, color 0.15s',
        fontFamily: "'Prompt','Inter',sans-serif",
    });

    return (
        <div
            title="ภาษาชื่อสำหรับไฟล์ที่ดาวน์โหลด / Name language for the downloaded file"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                border: '1px solid #475569',
                borderRadius: 7,
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            <span
                aria-hidden
                style={{
                    padding: isMobile ? '5px 8px' : '0.35vh 0.5vw',
                    fontSize: isMobile ? 12 : '1.2vh',
                    background: '#0f172a',
                    color: '#64748b',
                }}
            >
                🌐
            </span>
            <button onClick={() => onChange('th')} style={btn('th', 'TH')}>TH</button>
            <button onClick={() => onChange('en')} style={btn('en', 'EN')}>EN</button>
        </div>
    );
}
