'use client';

// Winner tables of one admin-built award (lib/custom-awards.ts), shared by the
// /admin/award-builder popup and the standalone /Award-Results/[slug] page so both
// always show the exact same list.

import { useCallback, useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    PERSONAL_FIELDS,
    SPLIT_FIELDS,
    downloadCustomAwardExcel,
    personalFieldValue,
    splitFieldValue,
    type AwardTimingRecord,
    type CustomAward,
    type CustomAwardGroup,
    type CustomAwardRunner,
    type RankedAwardRunner,
} from '@/lib/custom-awards';

async function fetchSplits(r: CustomAwardRunner): Promise<AwardTimingRecord[]> {
    if (!r.eventId) return [];
    try {
        const res = await fetch(`/api/timing/runner/${r.eventId}/${r._id}`, { cache: 'no-store' });
        const data = res.ok ? await res.json() : [];
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/** Split rows (loaded on expand) + the Excel export that needs them. */
export function useAwardSplits() {
    const [expandedRunner, setExpandedRunner] = useState<string | null>(null);
    const [splitCache, setSplitCache] = useState<Record<string, AwardTimingRecord[]>>({});
    const [splitLoading, setSplitLoading] = useState<string | null>(null);

    const toggleSplits = useCallback(async (r: CustomAwardRunner) => {
        if (expandedRunner === r._id) { setExpandedRunner(null); return; }
        setExpandedRunner(r._id);
        if (splitCache[r._id] || !r.eventId) return;
        setSplitLoading(r._id);
        const recs = await fetchSplits(r);
        setSplitCache(prev => ({ ...prev, [r._id]: recs }));
        setSplitLoading(null);
    }, [expandedRunner, splitCache]);

    /** Build the .xlsx, first pulling every winner's split records that aren't cached yet (6 at a time). */
    const downloadExcel = useCallback(async (opts: { award: CustomAward; groups: CustomAwardGroup[]; language: 'th' | 'en'; eventName: string }) => {
        const splits: Record<string, AwardTimingRecord[]> = { ...splitCache };
        if (opts.award.splitFields.length > 0) {
            const missing = opts.groups.flatMap(g => g.runners.map(x => x.runner)).filter(r => !splits[r._id]);
            for (let i = 0; i < missing.length; i += 6) {
                const batch = missing.slice(i, i + 6);
                const results = await Promise.all(batch.map(fetchSplits));
                batch.forEach((r, k) => { splits[r._id] = results[k]; });
            }
            setSplitCache(splits);
        }
        await downloadCustomAwardExcel({ ...opts, splits });
    }, [splitCache]);

    /** Collapse the open split row, and optionally forget cached splits (e.g. after a data refresh). */
    const reset = useCallback((clearCache = false) => {
        setExpandedRunner(null);
        if (clearCache) setSplitCache({});
    }, []);

    return { expandedRunner, splitCache, splitLoading, toggleSplits, downloadExcel, reset };
}

export type AwardSplitsState = ReturnType<typeof useAwardSplits>;

export default function CustomAwardResults({ award, groups, th, splits }: {
    award: CustomAward;
    groups: CustomAwardGroup[];
    th: boolean;
    splits: AwardSplitsState;
}) {
    const { expandedRunner, splitCache, splitLoading, toggleSplits } = splits;
    const cols = PERSONAL_FIELDS.filter(f => award.personalFields.includes(f.key));
    const scols = SPLIT_FIELDS.filter(f => award.splitFields.includes(f.key));
    const colCount = 1 + cols.length + (scols.length > 0 ? 1 : 0);
    // Fixed column widths so every group table (men / women / each age group) lines up
    // column-for-column — with auto layout each table sized its columns to its own content.
    const colWeight = (key: string) => (key === 'name' ? 3 : 1);
    const totalWeight = cols.reduce((sum, c) => sum + colWeight(c.key), 0) + (scols.length > 0 ? 1 : 0);
    const colPct = (w: number) => `${(w / Math.max(totalWeight, 1)) * 100}%`;
    const tableMinWidth = 72 + cols.reduce((sum, c) => sum + colWeight(c.key) * 110, 0) + (scols.length > 0 ? 110 : 0);

    const renderPersonalCell = (key: string, row: RankedAwardRunner) => {
        const v = personalFieldValue(key, row, th ? 'th' : 'en');
        return v === '' || v == null ? '-' : v;
    };

    const renderSplitCell = (key: string, rec: AwardTimingRecord) => {
        const v = splitFieldValue(key, rec);
        return v === '' || v == null ? '-' : v;
    };

    return (
        <>
            {groups.every(g => g.runners.length === 0) && (
                <div className="py-8 text-center text-sm text-gray-400!">{th ? 'ยังไม่มีผู้เข้าเส้นชัยในระยะนี้' : 'No finishers in this distance yet'}</div>
            )}
            {groups.map(g => {
                if (g.runners.length === 0 && award.type === 'ageGroup') return null;
                return (
                    <div key={g.key}>
                        {award.type !== 'overall' && (
                            <div className="mb-2 flex items-center gap-2">
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700!">{th ? g.labelTh : g.label}</span>
                                <span className="text-xs text-gray-400!">{g.runners.length} {th ? 'คน' : 'runners'}</span>
                            </div>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full table-fixed text-sm" style={{ minWidth: Math.max(520, tableMinWidth) }}>
                                <colgroup>
                                    <col style={{ width: 72 }} />
                                    {cols.map(c => <col key={c.key} style={{ width: colPct(colWeight(c.key)) }} />)}
                                    {scols.length > 0 && <col style={{ width: colPct(1) }} />}
                                </colgroup>
                                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500!">
                                    <tr>
                                        <th className="px-3 py-2 text-center">{th ? 'อันดับ' : 'Place'}</th>
                                        {cols.map(c => <th key={c.key} className="truncate px-3 py-2">{c.label}</th>)}
                                        {scols.length > 0 && <th className="px-3 py-2">Splits</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {g.runners.length === 0 ? (
                                        <tr><td colSpan={colCount} className="px-3 py-4 text-center text-xs text-gray-400!">{th ? 'ไม่มีผู้เข้าเส้นชัย' : 'No finishers'}</td></tr>
                                    ) : g.runners.map(row => {
                                        const r = row.runner;
                                        const expanded = expandedRunner === r._id;
                                        const recs = splitCache[r._id];
                                        return (
                                            <RowGroup key={r._id}>
                                                <tr className="border-t border-gray-100 hover:bg-blue-50/40">
                                                    <td className="px-3 py-2 text-center font-bold text-slate-900!">{row.place}</td>
                                                    {cols.map(c => <td key={c.key} className="break-words px-3 py-2">{renderPersonalCell(c.key, row)}</td>)}
                                                    {scols.length > 0 && (
                                                        <td className="px-3 py-2">
                                                            <button type="button" onClick={() => toggleSplits(r)}
                                                                className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600! hover:bg-gray-100">
                                                                {expanded ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                                                                {th ? 'จุดผ่าน' : 'Splits'}
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                                {expanded && scols.length > 0 && (
                                                    <tr className="bg-gray-50">
                                                        <td colSpan={colCount} className="px-4 py-2">
                                                            {splitLoading === r._id && !recs ? (
                                                                <div className="py-2 text-xs text-gray-400!">{th ? 'กำลังโหลด...' : 'Loading...'}</div>
                                                            ) : !recs || recs.length === 0 ? (
                                                                <div className="py-2 text-xs text-gray-400!">{th ? 'ไม่มีข้อมูลจุดผ่าน' : 'No split records'}</div>
                                                            ) : (
                                                                <table className="w-full text-xs">
                                                                    <thead className="text-left text-[11px] uppercase text-gray-400!">
                                                                        <tr>{scols.map(c => <th key={c.key} className="whitespace-nowrap px-2 py-1">{c.label}</th>)}</tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {recs.map(rec => (
                                                                            <tr key={rec._id} className="border-t border-gray-200">
                                                                                {scols.map(c => <td key={c.key} className="whitespace-nowrap px-2 py-1 font-mono">{renderSplitCell(c.key, rec)}</td>)}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </RowGroup>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

// Fragment wrapper so a runner row and its split row share one key.
function RowGroup({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
