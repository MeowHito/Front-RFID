'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';

interface Applicant {
    _id: string;
    idCard?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    fullNameEn?: string;
    phone?: string;
    age?: number | null;
    gender?: string;
    ageGroup?: string;
    shirtSize?: string;
    category?: string;
    team?: string;
    challenge?: string;
    wave?: string;
}

type Lang = 'th' | 'en';

// Page text in both languages — the TH/EN switch in the header picks one.
const TEXT = {
    th: {
        title: 'ตรวจสอบข้อมูลการสมัคร',
        hint: 'ค้นหาด้วย เลขบัตรประชาชน / BIB / ชื่อ / นามสกุล / เบอร์โทร',
        search: 'ค้นหา',
        searchFailed: 'ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง',
        searchError: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง',
        results: (n: number) => `ผลการค้นหา (${n} รายการ)`,
        clear: '↻ ล้างการค้นหา',
        notFound: 'ไม่พบข้อมูลสำหรับ',
        notFoundHint: 'ลองค้นหาด้วยชื่อ นามสกุล BIB หรือเลขบัตรประชาชน',
        name: 'ชื่อ-นามสกุล',
        category: 'ประเภท',
        age: 'อายุ',
        gender: 'เพศ',
        ageGroup: 'กลุ่มอายุ',
        shirt: 'ขนาดเสื้อ',
        years: 'ปี',
        male: 'ชาย',
        female: 'หญิง',
        footnote: 'ระบบแสดงทุกรายการที่ตรงกับคำค้น รวมถึงชื่อที่ซ้ำกัน',
    },
    en: {
        title: 'Check Your Registration',
        hint: 'Search by ID card / BIB / first name / last name / phone',
        search: 'Search',
        searchFailed: 'Search failed. Please try again.',
        searchError: 'Something went wrong. Please try again.',
        results: (n: number) => `Results (${n})`,
        clear: '↻ Clear search',
        notFound: 'No results for',
        notFoundHint: 'Try searching by first name, last name, BIB or ID card number',
        name: 'Name',
        category: 'Category',
        age: 'Age',
        gender: 'Gender',
        ageGroup: 'Age Group',
        shirt: 'Shirt Size',
        years: 'yrs',
        male: 'Male',
        female: 'Female',
        footnote: 'All matching entries are shown, including duplicate names.',
    },
};

function genderKey(g?: string): 'male' | 'female' | null {
    if (!g) return null;
    const v = g.trim().toLowerCase();
    if (v === 'm' || v === 'male' || g.includes('ชาย')) return 'male';
    if (v === 'f' || v === 'female' || g.includes('หญิง')) return 'female';
    return null;
}

function genderLabel(g: string | undefined, lang: Lang): string {
    const k = genderKey(g);
    return k ? TEXT[lang][k] : (g || '-');
}

// Roster age groups arrive as e.g. "(กลุ่มอายุ 30-39 ปี ชาย)" — show just the
// numeric range "30-39 ปี". "ไม่มีการแข่งขันกลุ่มอายุ" and blanks become "-".
function ageGroupLabel(g: string | undefined, lang: Lang): string {
    if (!g) return '-';
    const range = g.match(/\d+\s*-\s*\d+/);
    if (range) return `${range[0].replace(/\s+/g, '')} ${TEXT[lang].years}`;
    if (/ไม่มี/.test(g)) return '-';
    return g.replace(/[()]/g, '').replace(/กลุ่มอายุ/g, '').replace(/ปี/g, lang === 'en' ? 'yrs' : 'ปี').replace(/ชาย|หญิง|male|female/gi, '').trim() || '-';
}

/** Primary and secondary name lines for a result row — the chosen language's
 *  spelling first, the other one underneath. */
function nameLines(r: Applicant, lang: Lang): { th: string; en: string } {
    const th = (r.fullName || `${r.firstName || ''} ${r.lastName || ''}`.trim()).trim();
    const en = (r.fullNameEn || `${r.firstNameEn || ''} ${r.lastNameEn || ''}`.trim()).trim();
    const [first, second] = lang === 'en' ? [en, th] : [th, en];
    // Rosters with only one spelling still get one visible line
    if (!first && second) return { th: second, en: '' };
    return { th: first || '-', en: second };
}

const COLORS = {
    primary: '#003fb1',
    primaryDark: '#1a56db',
    surface: '#f8f9fb',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#191c1e',
    textMuted: '#434654',
    label: '#737686',
};

export default function ApplicantStatusPage() {
    const { language, setLanguage } = useLanguage();
    const lang: Lang = language === 'en' ? 'en' : 'th';
    const L = TEXT[lang];
    const { slug: rawSlug } = useParams<{ slug: string }>();
    // useParams can return a still-percent-encoded segment for non-ASCII (Thai)
    // slugs. Decode it fully so we encode exactly once when calling the API —
    // otherwise the slug gets double-encoded (%E0 → %25E0) and the backend 404s.
    const slug = useMemo(() => {
        let s = rawSlug || '';
        try {
            while (/%[0-9A-Fa-f]{2}/.test(s)) {
                const decoded = decodeURIComponent(s);
                if (decoded === s) break;
                s = decoded;
            }
        } catch { /* leave as-is on malformed input */ }
        return s;
    }, [rawSlug]);
    const [campaignNames, setCampaignNames] = useState<{ th: string; en: string }>({ th: '', en: '' });
    const campaignName = lang === 'en' ? (campaignNames.en || campaignNames.th) : (campaignNames.th || campaignNames.en);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Applicant[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setCampaignNames({
                        th: data?.nameTh || data?.name || '',
                        en: data?.nameEn || data?.name || '',
                    });
                }
            } catch { /* */ }
        })();
    }, [slug]);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const term = query.trim();
        if (!term) return;
        setSearching(true);
        setError('');
        setSearched(true);
        setResults([]);
        try {
            const res = await fetch(`/api/applicants/search?campaign=${encodeURIComponent(slug)}&q=${encodeURIComponent(term)}`, { cache: 'no-store' });
            if (!res.ok) {
                setError('failed');
                return;
            }
            const data = await res.json();
            setResults(data?.results || []);
        } catch {
            setError('error');
        } finally {
            setSearching(false);
        }
    }, [query, slug]);

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setSearched(false);
        setError('');
    };

    // Only show the "ประเภท" (distance/category) column when at least one result
    // actually carries it — some imported rosters omit the column entirely.
    const hasCategory = useMemo(
        () => results.some(r => (r.category || '').trim() !== ''),
        [results],
    );

    // Only show the "Challenge" column when at least one result carries it — some
    // imported rosters omit the column entirely, so it stays hidden in that case.
    const hasChallenge = useMemo(
        () => results.some(r => (r.challenge || '').trim() !== ''),
        [results],
    );

    // Wave (start group) only exists for some events — same rule as /admin/applicants-import.
    const hasWave = useMemo(
        () => results.some(r => (r.wave || '').trim() !== ''),
        [results],
    );

    return (
        <div style={{ minHeight: '100vh', background: COLORS.surface, fontFamily: "'Inter','Hanken Grotesk',sans-serif" }}>
            {/* Header */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 50, background: '#fff',
                borderBottom: `1px solid ${COLORS.border}`, height: 64,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,63,177,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏃</div>
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.primary, letterSpacing: '-0.02em' }}>
                        {campaignName || L.title}
                    </h1>
                </div>
                <div role="group" aria-label="Language" style={{ display: 'flex', flexShrink: 0, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: 3, background: COLORS.surface }}>
                    {(['th', 'en'] as const).map(code => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => setLanguage(code)}
                            aria-pressed={lang === code}
                            style={{
                                border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700,
                                cursor: 'pointer',
                                background: lang === code ? COLORS.primary : 'transparent',
                                color: lang === code ? '#fff' : COLORS.textMuted,
                            }}
                        >
                            {code.toUpperCase()}
                        </button>
                    ))}
                </div>
            </header>

            {/* Hero */}
            <div style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`, padding: '40px 20px 56px' }}>
                <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ margin: 0, color: '#fff', fontSize: 30, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                        {L.title}
                    </h2>
                    <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>
                        {L.hint}
                    </p>
                </div>
            </div>

            {/* Search + Results */}
            <main style={{ maxWidth: results.length > 0 ? 1040 : 720, margin: '-32px auto 0', padding: '0 16px 48px', transition: 'max-width 0.2s' }}>
                {/* Search box */}
                <form onSubmit={handleSearch} style={{
                    background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16,
                    padding: 8, display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 8px 30px -8px rgba(0,0,0,0.12)',
                }}>
                    <span style={{ paddingLeft: 12, paddingRight: 4, fontSize: 20, color: COLORS.label }}>🔍</span>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={L.hint}
                        style={{
                            flex: 1, border: 'none', outline: 'none', fontSize: 16,
                            color: COLORS.text, padding: '12px 4px', background: 'transparent',
                        }}
                    />
                    <button type="submit" disabled={searching} style={{
                        background: COLORS.primary, color: '#fff', border: 'none',
                        padding: '12px 22px', borderRadius: 12, fontWeight: 700, fontSize: 15,
                        cursor: searching ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                        opacity: searching ? 0.7 : 1,
                    }}>
                        {searching ? '...' : L.search}
                    </button>
                </form>

                {/* Results header */}
                {searched && !searching && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 4px 12px' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                            {L.results(results.length)}
                        </h3>
                        <button onClick={clearSearch} style={{ background: 'none', border: 'none', color: COLORS.primary, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                            {L.clear}
                        </button>
                    </div>
                )}

                {/* Error / empty */}
                {searched && !searching && error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, color: '#dc2626', fontWeight: 600, fontSize: 14 }}>
                        {error === 'failed' ? L.searchFailed : L.searchError}
                    </div>
                )}
                {searched && !searching && !error && results.length === 0 && (
                    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: '36px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>🔎</div>
                        <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 15, fontWeight: 600 }}>
                            {L.notFound} &ldquo;{query}&rdquo;
                        </p>
                        <p style={{ margin: '6px 0 0', color: COLORS.label, fontSize: 13 }}>
                            {L.notFoundHint}
                        </p>
                    </div>
                )}

                {/* Results — table on desktop, stacked cards on mobile */}
                {!searching && results.length > 0 && (
                    <>
                        <style>{`
                            @media (max-width: 640px) {
                                .aps-desktop-table { display: none !important; }
                                .aps-mobile-table { display: flex !important; }
                            }
                            .aps-row { font-size: clamp(13px, 3.7vw, 15px); }
                            .aps-row td { padding: clamp(8px, 2.4vw, 12px) 14px; }
                        `}</style>

                        {/* Desktop table */}
                        <div className="aps-desktop-table" style={{ display: 'block', background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, overflowX: 'auto', boxShadow: '0 4px 20px -8px rgba(0,0,0,0.08)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ background: '#f3f4f6', borderBottom: `2px solid ${COLORS.border}` }}>
                                        <th style={thStyle}>BIB</th>
                                        <th style={{ ...thStyle, textAlign: 'left' }}>{L.name}</th>
                                        {hasCategory && <th style={thStyle}>{L.category}</th>}
                                        {hasWave && <th style={thStyle}>Wave</th>}
                                        <th style={thStyle}>{L.age}</th>
                                        <th style={thStyle}>{L.gender}</th>
                                        <th style={thStyle}>{L.ageGroup}</th>
                                        <th style={thStyle}>{L.shirt}</th>
                                        {hasChallenge && <th style={thStyle}>Challenge</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r, idx) => {
                                        const nm = nameLines(r, lang);
                                        const female = genderKey(r.gender) === 'female';
                                        return (
                                        <tr key={r._id || idx} style={{ borderBottom: `1px solid #f1f5f9` }}>
                                            <td style={{ ...tdStyle, fontWeight: 700, color: COLORS.primary, textAlign: 'center' }}>{r.bib || '-'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600, color: COLORS.text }}>
                                                {nm.th}
                                                {nm.en ? <span style={{ display: 'block', fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>{nm.en}</span> : null}
                                                {r.team ? <span style={{ display: 'block', fontSize: 12, color: COLORS.label, fontWeight: 400 }}>{r.team}</span> : null}
                                            </td>
                                            {hasCategory && <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{r.category || '-'}</td>}
                                            {hasWave && <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{r.wave || '-'}</td>}
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>{r.age != null && r.age > 0 ? `${r.age} ${L.years}` : '-'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                                                    background: female ? '#fce7f3' : '#dbeafe',
                                                    color: female ? '#be185d' : '#1d4ed8',
                                                }}>
                                                    {genderLabel(r.gender, lang)}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>{ageGroupLabel(r.ageGroup, lang)}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{r.shirtSize || '-'}</td>
                                            {hasChallenge && <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{r.challenge || '-'}</td>}
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile — vertical key/value table per result, fits one screen, no scroll */}
                        <div className="aps-mobile-table" style={{ display: 'none', flexDirection: 'column', gap: 14 }}>
                            {results.map((r, idx) => {
                                const { th: nameTh, en: nameEn } = nameLines(r, lang);
                                const female = genderKey(r.gender) === 'female';
                                const rows: { label: string; value: React.ReactNode }[] = [
                                    { label: 'BIB', value: <span style={{ color: COLORS.primary, fontWeight: 800 }}>{r.bib || '-'}</span> },
                                    {
                                        label: L.gender, value: (
                                            <span style={{ padding: '2px 12px', borderRadius: 12, fontWeight: 600, background: female ? '#fce7f3' : '#dbeafe', color: female ? '#be185d' : '#1d4ed8' }}>
                                                {genderLabel(r.gender, lang)}
                                            </span>
                                        ),
                                    },
                                    ...(hasCategory ? [{ label: L.category, value: r.category || '-' }] : []),
                                    ...(hasWave ? [{ label: 'Wave', value: r.wave || '-' }] : []),
                                    { label: L.age, value: r.age != null && r.age > 0 ? `${r.age} ${L.years}` : '-' },
                                    { label: L.ageGroup, value: ageGroupLabel(r.ageGroup, lang) },
                                    { label: L.shirt, value: r.shirtSize || '-' },
                                    ...(hasChallenge ? [{ label: 'Challenge', value: r.challenge || '-' }] : []),
                                ];
                                return (
                                    <div key={r._id || idx} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px -10px rgba(0,0,0,0.1)' }}>
                                        {/* Name band */}
                                        <div style={{ background: 'rgba(0,63,177,0.06)', padding: 'clamp(10px,3vw,14px) 14px', borderBottom: `1px solid ${COLORS.border}` }}>
                                            <div style={{ fontWeight: 800, fontSize: 'clamp(15px,4.4vw,18px)', color: COLORS.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{nameTh}</div>
                                            {nameEn ? <div style={{ fontWeight: 600, fontSize: 'clamp(13px,3.8vw,15px)', color: COLORS.textMuted, lineHeight: 1.3, marginTop: 2, wordBreak: 'break-word' }}>{nameEn}</div> : null}
                                            {r.team ? <div style={{ fontSize: 'clamp(12px,3.4vw,13px)', color: COLORS.label, marginTop: 2 }}>{r.team}</div> : null}
                                        </div>
                                        {/* Field rows */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                {rows.map((f, i) => (
                                                    <tr key={f.label} className="aps-row" style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                                                        <td style={{ color: COLORS.label, whiteSpace: 'nowrap', width: '40%' }}>{f.label}</td>
                                                        <td style={{ color: COLORS.text, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{f.value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>

                        <p style={{ fontSize: 12, color: COLORS.label, marginTop: 12, textAlign: 'center' }}>
                            {L.footnote}
                        </p>
                    </>
                )}
            </main>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#434654', fontSize: 13, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
    padding: '14px', textAlign: 'center', color: '#434654', verticalAlign: 'middle', whiteSpace: 'nowrap',
};
