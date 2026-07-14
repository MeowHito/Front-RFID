'use client';

import { QRCodeSVG } from 'qrcode.react';
import {
    RunnerData,
    TimingRecord,
    CampaignData,
    formatTime,
    effectivePace,
    effectiveFinishMs,
    resolveRunnerName,
    parseDistanceValue,
} from '@/components/eslip/eslip-templates';

/**
 * A monochrome 58mm-thermal receipt rendition of a runner's e-slip. Mirrors the
 * key fields of the on-screen individual e-slip (Template3) — BIB, name, gun/net
 * time, pace, ranks, award, checkpoint splits and a QR to the full result page —
 * but laid out for a narrow thermal printer (black-on-white, no fills/emoji).
 *
 * Designed at a 219px content width (≈58mm at 96dpi) so the on-screen preview and
 * the printed paper match. The parent supplies `@media print` rules that isolate
 * the element carrying `data-thermal-receipt` and set `@page { size: 58mm auto }`.
 */
export default function ThermalReceipt({
    runner,
    timings,
    campaign,
    awardLabel,
    targetBandLabel,
    origin,
}: {
    runner: RunnerData;
    timings: TimingRecord[];
    campaign: CampaignData | null;
    awardLabel?: string | null;
    targetBandLabel?: string | null;
    origin: string;
}) {
    const displayName = resolveRunnerName(runner, 'en');
    const genderLabel = runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : '-';
    const dist = parseDistanceValue(runner.category);
    const pace = effectivePace(runner);
    const gunTimeStr = runner.gunTimeStr || formatTime(effectiveFinishMs(runner));
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);

    // Sort by scanTime ascending (same tie-break as Template3), drop START markers.
    const rows = [...timings]
        .sort((a, b) => {
            const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
            const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
            if (ta !== tb) return ta - tb;
            return (a.order || 0) - (b.order || 0);
        })
        .filter(t => !((t.checkpoint || '').toLowerCase().includes('start')));

    const runnerUrl = origin ? `${origin}/runner/${runner._id}` : '';
    const printedAt = new Date().toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const ranks = [
        { label: 'OVERALL', val: runner.overallRank || '-' },
        { label: 'GENDER', val: runner.genderRank || runner.genderNetRank || '-' },
        { label: 'CATEGORY', val: runner.ageGroup ? (runner.categoryRank || runner.categoryNetRank || '-') : null },
    ].filter(r => r.val !== null);

    const rule: React.CSSProperties = { borderTop: '1px dashed #000', margin: '7px 0' };
    const labelStyle: React.CSSProperties = { fontSize: 8, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' };
    const monoNum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 800 };

    return (
        <div
            data-thermal-receipt
            style={{
                width: 219,
                background: '#fff',
                color: '#000',
                fontFamily: "'Prompt', sans-serif",
                padding: '10px 8px 14px',
                boxSizing: 'border-box',
                lineHeight: 1.25,
            }}
        >
            {/* Event name */}
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.15 }}>
                {campaign?.name || 'Race Event'}
            </div>
            {campaign?.eventDate && (
                <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, marginTop: 2 }}>
                    {new Date(campaign.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            )}

            <div style={rule} />

            {/* Runner identity */}
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>BIB {runner.bib}</div>
                <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', marginTop: 1, wordBreak: 'break-word' }}>{displayName}</div>
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 1 }}>{runner.category} | {genderLabel}</div>
            </div>

            <div style={rule} />

            {/* Times */}
            <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={labelStyle}>Gun Time</div>
                    <div style={{ ...monoNum, fontSize: 15 }}>{gunTimeStr}</div>
                </div>
                <div style={{ width: 1, background: '#000' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={labelStyle}>Net Time</div>
                    <div style={{ ...monoNum, fontSize: 15 }}>{netTimeStr}</div>
                </div>
            </div>

            {/* Award / Target */}
            {awardLabel && (
                <div style={{ textAlign: 'center', border: '1px solid #000', borderRadius: 4, padding: '3px 4px', marginTop: 7 }}>
                    <div style={labelStyle}>Award</div>
                    <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{awardLabel}</div>
                </div>
            )}
            {targetBandLabel && (
                <div style={{ textAlign: 'center', border: '1px solid #000', borderRadius: 4, padding: '3px 4px', marginTop: 5 }}>
                    <div style={labelStyle}>Target</div>
                    <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{targetBandLabel}</div>
                </div>
            )}

            {/* Distance / Pace */}
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={labelStyle}>Distance</div>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{dist ?? '-'} KM</div>
                </div>
                <div style={{ width: 1, background: '#000' }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={labelStyle}>Avg Pace</div>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{pace}/K</div>
                </div>
            </div>

            {/* Ranks */}
            {ranks.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    {ranks.map((r, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', border: '1px solid #000', borderRadius: 4, padding: '3px 0' }}>
                            <div style={{ fontSize: 14, fontWeight: 900 }}>{r.val}</div>
                            <div style={labelStyle}>{r.label}</div>
                        </div>
                    ))}
                </div>
            )}

            <div style={rule} />

            {/* Checkpoint splits */}
            <div style={{ ...labelStyle, marginBottom: 3 }}>Checkpoint Splits</div>
            {rows.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: 10, padding: '4px 0' }}>No checkpoint data</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {rows.map(t => {
                        const isFinish = (t.checkpoint || '').toLowerCase().includes('finish');
                        const ms = t.netTime ?? t.elapsedTime;
                        return (
                            <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: isFinish ? 900 : 700, whiteSpace: 'nowrap' }}>
                                    {isFinish ? 'FINISH' : t.checkpoint}
                                </span>
                                <span style={{ flex: 1, borderBottom: '1px dotted #000', transform: 'translateY(-2px)' }} />
                                <span style={{ ...monoNum, fontSize: isFinish ? 12 : 11 }}>{ms ? formatTime(ms) : '-'}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* QR to full result */}
            {runnerUrl && (
                <>
                    <div style={rule} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <QRCodeSVG value={runnerUrl} size={110} level="M" bgColor="#ffffff" fgColor="#000000" />
                        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
                            สแกนดูผลการแข่งขันฉบับเต็ม
                        </div>
                    </div>
                </>
            )}

            <div style={rule} />
            <div style={{ textAlign: 'center', fontSize: 8, fontWeight: 800, letterSpacing: 1 }}>OFFICIAL RESULT BY ACTION TIMING</div>
            <div style={{ textAlign: 'center', fontSize: 8, fontWeight: 600, marginTop: 2 }}>พิมพ์เมื่อ {printedAt}</div>
        </div>
    );
}
