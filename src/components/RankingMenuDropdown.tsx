'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/authHeaders';
import {
    getRankingMenuVisibility,
    withRankingMenuVisibility,
    type RankingMenuFlags,
    type RankingMenuItemKey,
    type RankingMenuVisibility,
} from '@/lib/rankingMenu';

interface RankingMenuDropdownProps {
    campaignId: string;
    /** slug (preferred) or _id — used to build the winner-board links */
    campaignSlugOrId: string;
    campaignName: string;
    /** Raw category name (matches campaign.categories[].name), NOT the derived UI key */
    categoryName: string;
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    rankingMenuVisibility?: RankingMenuVisibility[];
    isAdmin: boolean;
    language: 'th' | 'en';
    /** Called with the full updated array after a successful save, so the parent can refresh its campaign state */
    onSaved?: (next: RankingMenuVisibility[]) => void;
}

export default function RankingMenuDropdown({
    campaignId,
    campaignSlugOrId,
    campaignName,
    categoryName,
    overallDisplayCount,
    ageGroupDisplayCount,
    rankingMenuVisibility,
    isAdmin,
    language,
    onSaved,
}: RankingMenuDropdownProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<RankingMenuFlags>(() => getRankingMenuVisibility(rankingMenuVisibility, categoryName));
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Resync the draft whenever the selected distance or saved settings change
    useEffect(() => {
        setDraft(getRankingMenuVisibility(rankingMenuVisibility, categoryName));
        setSaveMsg(null);
    }, [rankingMenuVisibility, categoryName]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const overallN = Math.max(1, Number(overallDisplayCount) || 5);
    const ageGroupN = Math.max(1, Number(ageGroupDisplayCount) || 5);
    const catQuery = `?category=${encodeURIComponent(categoryName)}`;

    const items: { key: RankingMenuItemKey; label: string; href: string }[] = [
        { key: 'general', label: `Overall ${overallN}`, href: `/Overall-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'bestOf', label: `Best of ${campaignName}`, href: `/Best-Of-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'nationality', label: `Foreigner Overall ${overallN}`, href: `/Nationality-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'ageGroup', label: `Age group ${ageGroupN}`, href: `/Result-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
    ];

    const visibleItems = items.filter(item => isAdmin || draft[item.key]);
    if (!categoryName || visibleItems.length === 0) return null;

    const toggle = (key: RankingMenuItemKey) => {
        setDraft(prev => ({ ...prev, [key]: !prev[key] }));
        setSaveMsg(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const next = withRankingMenuVisibility(rankingMenuVisibility, categoryName, draft);
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ rankingMenuVisibility: next }),
            });
            if (res.ok) {
                onSaved?.(next);
                setSaveMsg(language === 'th' ? 'บันทึกแล้ว' : 'Saved');
            } else {
                setSaveMsg(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed');
            }
        } catch {
            setSaveMsg(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-3 py-1.5 text-xs font-bold text-[var(--muted-foreground)]"
            >
                <span aria-hidden>🏆</span>
                {language === 'th' ? 'อันดับ/รางวัล' : 'Rankings'}
                <span className="text-[10px] opacity-60">▾</span>
            </button>
            {open && (
                <div className="absolute left-0 top-9 z-30 min-w-56 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] p-2 shadow-[0_8px_16px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_16px_rgba(0,0,0,0.4)]">
                    <p className="mb-1 px-2 text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                        {language === 'th' ? 'ดูอันดับ' : 'View rankings'}
                    </p>
                    {items.map(item => {
                        const isVisible = draft[item.key];
                        if (!isAdmin && !isVisible) return null;
                        return (
                            <div key={item.key} className="flex items-center gap-2 px-2 py-1">
                                {isAdmin && (
                                    <input
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={() => toggle(item.key)}
                                        title={language === 'th' ? 'แสดงให้ผู้ใช้ทั่วไปเห็น' : 'Visible to public users'}
                                    />
                                )}
                                <Link
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpen(false)}
                                    className={`flex-1 truncate text-xs font-semibold ${isVisible ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] italic'} hover:underline`}
                                >
                                    {item.label}
                                    {isAdmin && !isVisible && (
                                        <span className="ml-1 text-[10px] not-italic opacity-60">
                                            ({language === 'th' ? 'ซ่อนอยู่' : 'hidden'})
                                        </span>
                                    )}
                                </Link>
                            </div>
                        );
                    })}
                    {isAdmin && (
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                            {saveMsg && <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{saveMsg}</span>}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto rounded-md px-3 py-1 text-[11px] font-bold text-white ${saving ? 'cursor-wait bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`}
                            >
                                {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
