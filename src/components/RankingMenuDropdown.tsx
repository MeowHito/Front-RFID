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
    /** Campaign display name — used for the "Best of [event name]" menu label */
    campaignName?: string;
    /** Raw category name (matches campaign.categories[].name), NOT the derived UI key */
    categoryName: string;
    overallDisplayCount?: number;
    /** Top N Thai overall ranks (admin/age-group-ranking "คนไทย"). Falls back to overallDisplayCount. */
    excludeOverallThaiFromAgeGroup?: number;
    /** Top N foreign overall ranks (admin/age-group-ranking "ต่างชาติ"). Falls back to overallDisplayCount. */
    excludeOverallForeignFromAgeGroup?: number;
    ageGroupDisplayCount?: number;
    bestOfDisplayCount?: number;
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
    excludeOverallThaiFromAgeGroup,
    excludeOverallForeignFromAgeGroup,
    ageGroupDisplayCount,
    bestOfDisplayCount,
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
    const overallThaiN = Math.max(1, Number(excludeOverallThaiFromAgeGroup ?? overallDisplayCount) || 5);
    const overallForeignN = Math.max(1, Number(excludeOverallForeignFromAgeGroup ?? overallDisplayCount) || 5);
    const ageGroupN = Math.max(1, Number(ageGroupDisplayCount) || 5);
    const bestOfN = Math.max(1, Number(bestOfDisplayCount) || 1);
    const catQuery = `?category=${encodeURIComponent(categoryName)}`;
    const bestOfEventName = (campaignName || '').length > 15 ? `${(campaignName || '').slice(0, 15)}...` : (campaignName || '');

    const items: { key: RankingMenuItemKey; label: string; href: string }[] = [
        { key: 'topOverall', label: `TopOverall ${overallN}`, href: `/Top-Overall-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'general', label: `Overall ${overallThaiN}`, href: `/Overall-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'bestOf', label: `Best of ${bestOfEventName} ${bestOfN}`, href: `/Best-Of-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'nationality', label: `Foreigner Overall ${overallForeignN}`, href: `/Nationality-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
        { key: 'ageGroup', label: `Age group ${ageGroupN}`, href: `/Result-Winners/${encodeURIComponent(campaignSlugOrId)}${catQuery}` },
    ];

    // The whole rankings/awards menu is admin-only — public users never see it.
    if (!isAdmin) return null;
    if (!categoryName) return null;

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
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-4 py-2.5 text-sm font-bold text-[var(--muted-foreground)]"
            >
                <span aria-hidden className="text-base">🏆</span>
                {language === 'th' ? 'อันดับ/รางวัล' : 'Rankings'}
                <span className="text-xs opacity-60">▾</span>
            </button>
            {open && (
                <div className="absolute left-0 top-11 z-30 min-w-72 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] p-3 shadow-[0_8px_16px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_16px_rgba(0,0,0,0.4)]">
                    {items.map(item => {
                        const isVisible = draft[item.key];
                        if (!isAdmin && !isVisible) return null;
                        return (
                            <div key={item.key} className="flex items-center gap-2.5 px-2 py-1.5">
                                {isAdmin && (
                                    <input
                                        type="checkbox"
                                        checked={isVisible}
                                        onChange={() => toggle(item.key)}
                                        className="h-4 w-4"
                                        title={language === 'th' ? 'แสดงให้ผู้ใช้ทั่วไปเห็น' : 'Visible to public users'}
                                    />
                                )}
                                <Link
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpen(false)}
                                    className={`flex-1 truncate text-sm font-semibold ${isVisible ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] italic'} hover:underline`}
                                >
                                    {item.label}
                                    {isAdmin && !isVisible && (
                                        <span className="ml-1 text-xs not-italic opacity-60">
                                            ({language === 'th' ? 'ซ่อนอยู่' : 'hidden'})
                                        </span>
                                    )}
                                </Link>
                            </div>
                        );
                    })}
                    {isAdmin && (
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                            {saveMsg && <span className="text-xs font-semibold text-[var(--muted-foreground)]">{saveMsg}</span>}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto rounded-md px-4 py-1.5 text-sm font-bold text-white ${saving ? 'cursor-wait bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`}
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
