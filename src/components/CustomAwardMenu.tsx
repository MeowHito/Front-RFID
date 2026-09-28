'use client';

// "Result(demo)" on /event/[slug] — admin only. Lists the awards built on
// /admin/award-builder for the selected distance; each name opens its result page.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCustomAwards } from '@/lib/custom-awards';

const normCat = (v?: string | null) => String(v || '').trim().toLowerCase();

export default function CustomAwardMenu({ customAwards, categoryName, campaignSlugOrId, language, align = 'right', compact = false }: {
    /** Raw campaign.customAwards. */
    customAwards: unknown;
    /** campaign.categories[].name of the selected distance (what awards are keyed by). */
    categoryName: string;
    campaignSlugOrId: string;
    language: string;
    align?: 'left' | 'right';
    compact?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const th = language === 'th';

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const awards = useMemo(
        () => normalizeCustomAwards(customAwards).filter(a => normCat(a.category) === normCat(categoryName)),
        [customAwards, categoryName],
    );

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card-solid)] font-bold text-[var(--muted-foreground)] ${compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'}`}
                title={th ? 'ผลรางวัลจากหน้า Award Builder (เห็นเฉพาะแอดมิน)' : 'Awards built on Award Builder (admin only)'}
            >
                <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M8 13h8" />
                    <path d="M8 17h5" />
                </svg>
                Result(demo)
                {awards.length > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] leading-4 text-white">{awards.length}</span>}
                <span className="text-xs opacity-60">▾</span>
            </button>
            {open && (
                <div className={`absolute top-10 z-30 min-w-64 max-w-[80vw] rounded-lg border border-[var(--border)] bg-[var(--card-solid)] p-2 shadow-[0_8px_16px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_16px_rgba(0,0,0,0.4)] ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    {awards.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-[var(--muted-foreground)]">
                            {th ? 'ยังไม่มีรางวัลของระยะนี้ — สร้างได้ที่หน้า Award Builder' : 'No award for this distance yet — create one on the Award Builder page.'}
                        </div>
                    ) : awards.map(a => (
                        <Link
                            key={a.id}
                            href={`/Award-Results/${encodeURIComponent(campaignSlugOrId)}?award=${encodeURIComponent(a.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                            className="block truncate rounded-md px-2 py-1.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] hover:underline"
                        >
                            {a.name}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
