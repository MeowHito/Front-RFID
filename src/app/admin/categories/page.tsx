'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import { usePermissions } from '@/lib/usePermissions';
import { authHeaders } from '@/lib/authHeaders';
import { parseAgeGroupBucket } from '@/lib/age-groups';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface AgeGroup {
    _id?: string;
    index: number;
    name: string;
    minAge: number;
    maxAge: number;
    trophyCount: number;
    active: boolean;
    gender: 'male' | 'female';
}

interface RaceCategory {
    name: string;
    distance?: string;
    startTime?: string;
    ageGroups?: AgeGroup[];
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: RaceCategory[];
}

/** Age-group member counts pulled live from RaceTiger BIO (for verifying against RaceTiger's Categories screen) */
interface RtGroupCount {
    ageGroup: string;
    members: number;
    men: number;
    women: number;
}

interface RtCategoryCounts {
    category: string;
    members: number;
    men: number;
    women: number;
    groups: RtGroupCount[];
}

export default function CategoriesPage() {
    const { language } = useLanguage();
    const { readOnly } = usePermissions('participants');
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const loadedRef = useRef<string>('');

    // Age group calculation config
    const [minAge, setMinAge] = useState(18);
    const [maxAge, setMaxAge] = useState(70);
    const [ageStep, setAgeStep] = useState(5);
    const [trophyPerGroup, setTrophyPerGroup] = useState(5);

    // Age groups state
    const [maleGroups, setMaleGroups] = useState<AgeGroup[]>([]);
    const [femaleGroups, setFemaleGroups] = useState<AgeGroup[]>([]);

    // Live age-group counts from RaceTiger (to verify member numbers)
    const [rtCounts, setRtCounts] = useState<RtCategoryCounts[] | null>(null);
    const [rtLoading, setRtLoading] = useState(false);
    const [rtError, setRtError] = useState('');
    const [rtFetchedAt, setRtFetchedAt] = useState('');

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    const cats = data.categories || [];
                    if (cats.length > 0) {
                        setSelectedCategory(cats[0].name);
                    }
                }
            } catch {
                setCampaign(null);
            } finally {
                setLoading(false);
            }
        }
        loadFeatured();
    }, []);

    // Load live age-group member counts from RaceTiger for verification
    const loadRaceTigerCounts = useCallback(async (campaignId: string) => {
        setRtLoading(true);
        setRtError('');
        try {
            const res = await fetch(`/api/sync/racetiger-category-counts?id=${campaignId}`, { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'Failed to fetch RaceTiger counts');
            setRtCounts(body?.data?.categories || []);
            setRtFetchedAt(body?.data?.fetchedAt || '');
        } catch (e: any) {
            setRtCounts(null);
            setRtError(e?.message || 'Failed to fetch RaceTiger counts');
        } finally {
            setRtLoading(false);
        }
    }, []);

    useEffect(() => {
        if (campaign?._id) loadRaceTigerCounts(campaign._id);
    }, [campaign?._id, loadRaceTigerCounts]);

    // Load age groups when category changes
    useEffect(() => {
        if (!selectedCategory || !campaign?._id) return;
        if (loadedRef.current === selectedCategory) return;
        loadedRef.current = selectedCategory;
        const cat = campaign.categories?.find(c => c.name === selectedCategory);
        const groups = cat?.ageGroups || [];
        setMaleGroups(groups.filter(g => g.gender === 'male').map((g, i) => ({ ...g, index: i + 1 })));
        setFemaleGroups(groups.filter(g => g.gender === 'female').map((g, i) => ({ ...g, index: i + 1 })));
    }, [selectedCategory, campaign]);

    const calculateGroups = (step: number) => {
        if (!selectedCategory) {
            showToast(language === 'th' ? 'กรุณาเลือกระยะทางก่อน' : 'Please select a distance first', 'error');
            return;
        }

        if (step === 0) {
            // Open category only
            setMaleGroups([{
                index: 1,
                name: 'Male Open',
                minAge: minAge,
                maxAge: 99,
                trophyCount: trophyPerGroup,
                active: true,
                gender: 'male',
            }]);
            setFemaleGroups([{
                index: 1,
                name: 'Female Open',
                minAge: minAge,
                maxAge: 99,
                trophyCount: trophyPerGroup,
                active: true,
                gender: 'female',
            }]);
        } else {
            const male: AgeGroup[] = [];
            const female: AgeGroup[] = [];
            let count = 1;
            let current = minAge;

            while (current <= maxAge) {
                let end = current + (step - 1);
                if (current === maxAge || end >= maxAge) {
                    male.push({
                        index: count,
                        name: `Male ${current} & Up`,
                        minAge: current,
                        maxAge: 99,
                        trophyCount: trophyPerGroup,
                        active: true,
                        gender: 'male',
                    });
                    female.push({
                        index: count,
                        name: `Female ${current} & Up`,
                        minAge: current,
                        maxAge: 99,
                        trophyCount: trophyPerGroup,
                        active: true,
                        gender: 'female',
                    });
                    break;
                }
                male.push({
                    index: count,
                    name: `Male ${current}-${end}`,
                    minAge: current,
                    maxAge: end,
                    trophyCount: trophyPerGroup,
                    active: true,
                    gender: 'male',
                });
                female.push({
                    index: count,
                    name: `Female ${current}-${end}`,
                    minAge: current,
                    maxAge: end,
                    trophyCount: trophyPerGroup,
                    active: true,
                    gender: 'female',
                });
                count++;
                current = end + 1;
            }

            setMaleGroups(male);
            setFemaleGroups(female);
        }
    };

    const addRow = (gender: 'male' | 'female') => {
        const groups = gender === 'male' ? maleGroups : femaleGroups;
        const nextIndex = groups.length + 1;
        const prefix = gender === 'male' ? 'Male' : 'Female';
        const newGroup: AgeGroup = {
            index: nextIndex,
            name: `${prefix} New`,
            minAge: 18,
            maxAge: 99,
            trophyCount: 5,
            active: true,
            gender,
        };

        if (gender === 'male') {
            setMaleGroups([...maleGroups, newGroup]);
        } else {
            setFemaleGroups([...femaleGroups, newGroup]);
        }
    };

    const updateGroup = (gender: 'male' | 'female', index: number, field: keyof AgeGroup, value: any) => {
        const groups = gender === 'male' ? maleGroups : femaleGroups;
        const updated = groups.map(g => g.index === index ? { ...g, [field]: value } : g);
        if (gender === 'male') {
            setMaleGroups(updated);
        } else {
            setFemaleGroups(updated);
        }
    };

    const deleteGroup = (gender: 'male' | 'female', index: number) => {
        const groups = gender === 'male' ? maleGroups : femaleGroups;
        const filtered = groups.filter(g => g.index !== index).map((g, i) => ({ ...g, index: i + 1 }));
        if (gender === 'male') {
            setMaleGroups(filtered);
        } else {
            setFemaleGroups(filtered);
        }
    };

    const handleSaveAll = async () => {
        if (!selectedCategory || !campaign?._id) {
            showToast(language === 'th' ? 'กรุณาเลือกระยะทางก่อน' : 'Please select a distance first', 'error');
            return;
        }

        setSaving(true);
        try {
            const allGroups: AgeGroup[] = [
                ...maleGroups.map((g, i) => ({ ...g, index: i + 1 })),
                ...femaleGroups.map((g, i) => ({ ...g, index: i + 1 })),
            ];
            const updatedCategories = (campaign.categories || []).map(cat =>
                cat.name === selectedCategory ? { ...cat, ageGroups: allGroups } : cat
            );
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ categories: updatedCategories }),
            });
            if (!res.ok) throw new Error('Failed to save');
            const updated = await res.json();
            setCampaign(updated);
            loadedRef.current = '';

            showToast(
                language === 'th'
                    ? `บันทึกสำเร็จ ${allGroups.length} รุ่น`
                    : `Saved ${allGroups.length} age groups`,
                'success'
            );
        } catch {
            showToast(language === 'th' ? 'บันทึกไม่สำเร็จ' : 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const getCampaignDisplayName = () => {
        if (!campaign) return '';
        return language === 'th' ? (campaign.nameTh || campaign.name) : (campaign.nameEn || campaign.name);
    };

    // RaceTiger counts for the selected distance, age groups sorted young → old (unknown labels last)
    const rtSelected = rtCounts && selectedCategory
        ? (rtCounts.find(c => c.category === selectedCategory)
            || rtCounts.find(c => c.category.startsWith(selectedCategory) || selectedCategory.startsWith(c.category))
            || null)
        : null;
    const rtSortedGroups = rtSelected
        ? [...rtSelected.groups].sort((a, b) => {
            const pa = parseAgeGroupBucket(a.ageGroup);
            const pb = parseAgeGroupBucket(b.ageGroup);
            if (!pa && !pb) return 0;
            if (!pa) return 1;
            if (!pb) return -1;
            return pa.min - pb.min || pa.max - pb.max;
        })
        : [];

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'ประเภทกลุ่มอายุ', labelEn: 'Age Groups' }
            ]}
        >
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                    background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                    {toast.message}
                </div>
            )}

            <div className="content-box">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div style={{ padding: 24 }}>
                        <p style={{ color: '#666', marginBottom: 8, fontSize: 14 }}>
                            {language === 'th'
                                ? 'ยังไม่ได้เลือกกิจกรรมหลัก กรุณาไปที่หน้าอีเวนต์แล้วกดดาวที่กิจกรรมที่ต้องการตั้งค่า'
                                : 'No featured event selected. Please go to the Events page and star the campaign.'}
                        </p>
                        <a href="/admin/events" style={{
                            display: 'inline-block', marginTop: 4, padding: '6px 16px',
                            borderRadius: 6, background: '#3b82f6', color: '#fff',
                            fontWeight: 600, textDecoration: 'none', fontSize: 13,
                        }}>
                            {language === 'th' ? 'ไปหน้าจัดการอีเวนต์' : 'Go to Events'}
                        </a>
                    </div>
                ) : (
                    <>
                        {/* Magic tool - Age group calculator + distance selector inside blue box */}
                        <div style={{
                            background: '#f0f7ff',
                            border: '1px dashed #3c8dbc',
                            padding: 15,
                            borderRadius: 4,
                            marginBottom: 15,
                        }}>
                            {/* Distance selector inside the blue box */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #c5ddf0', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ fontWeight: 600, fontSize: 12, color: '#555' }}>
                                        {language === 'th' ? 'ระยะที่กำลังจัดการ:' : 'Distance:'}
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedCategory}
                                        onChange={e => { loadedRef.current = ''; setSelectedCategory(e.target.value); }}
                                        style={{ minWidth: 200, fontWeight: 'bold', fontSize: 13, padding: '5px 10px', border: '1px solid #3c8dbc', borderRadius: 4, background: '#fff' }}
                                    >
                                        {campaign.categories?.map((cat, i) => (
                                            <option key={`${cat.name}-${i}`} value={cat.name}>
                                                {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ fontWeight: 'bold', color: '#3c8dbc', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                    </svg>
                                    {language === 'th' ? 'กำหนดเงื่อนไขการคำนวณอัตโนมัติ' : 'Auto-calculation settings'}
                                </div>
                                {!readOnly && (
                                    <button
                                        className="btn"
                                        onClick={handleSaveAll}
                                        disabled={saving}
                                        style={{
                                            background: '#00a65a',
                                            width: 180,
                                            fontSize: 13,
                                            opacity: saving ? 0.7 : 1,
                                        }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 6 }}>
                                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                            <polyline points="17 21 17 13 7 13 7 21" />
                                            <polyline points="7 3 7 8 15 8" />
                                        </svg>
                                        {saving
                                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                            : (language === 'th' ? 'บันทึกข้อมูลทั้งหมด' : 'Save All Data')
                                        }
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {language === 'th' ? 'อายุเริ่ม:' : 'Age from:'}
                                    <input
                                        type="number"
                                        className="form-input"
                                        style={{ width: 60 }}
                                        value={minAge}
                                        onChange={e => setMinAge(Number(e.target.value))}
                                    />
                                    {language === 'th' ? 'ถึง' : 'to'}
                                    <input
                                        type="number"
                                        className="form-input"
                                        style={{ width: 60 }}
                                        value={maxAge}
                                        onChange={e => setMaxAge(Number(e.target.value))}
                                    />
                                </div>
                                <div style={{
                                    background: 'white',
                                    padding: '2px 10px',
                                    borderRadius: 4,
                                    border: '1px solid #3c8dbc',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="7" y1="17" x2="17" y2="7" />
                                        <polyline points="7 7 17 7 17 17" />
                                    </svg>
                                    {language === 'th' ? 'ระยะห่างรุ่นละ:' : 'Step:'}
                                    <input
                                        type="number"
                                        className="form-input"
                                        style={{ width: 60, borderColor: 'transparent' }}
                                        value={ageStep}
                                        onChange={e => setAgeStep(Number(e.target.value))}
                                    />
                                    {language === 'th' ? 'ปี' : 'years'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {language === 'th' ? 'รางวัล/รุ่น:' : 'Trophies/group:'}
                                    <input
                                        type="number"
                                        className="form-input"
                                        style={{ width: 60 }}
                                        value={trophyPerGroup}
                                        onChange={e => setTrophyPerGroup(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-query"
                                    onClick={() => calculateGroups(ageStep)}
                                    style={{ fontSize: 12 }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 4 }}>
                                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                    </svg>
                                    {language === 'th' ? 'เริ่มคำนวณตามเงื่อนไขที่ระบุ' : 'Calculate with settings'}
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => calculateGroups(0)}
                                    style={{ background: '#666', fontSize: 12 }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 4 }}>
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                    {language === 'th' ? 'เฉพาะรุ่น Open' : 'Open category only'}
                                </button>
                            </div>
                        </div>

                        {/* Age groups + member counts pulled live from RaceTiger (verification against RaceTiger's Categories screen) */}
                        <div style={{
                            background: '#f6fff9',
                            border: '1px dashed #00a65a',
                            padding: 15,
                            borderRadius: 4,
                            marginBottom: 15,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 'bold', color: '#00a65a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 11l3 3L22 4" />
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                    </svg>
                                    {language === 'th'
                                        ? `กลุ่มอายุจาก RaceTiger${selectedCategory ? ` — ${selectedCategory}` : ''} (สำหรับตรวจสอบจำนวน)`
                                        : `Age groups from RaceTiger${selectedCategory ? ` — ${selectedCategory}` : ''} (for count verification)`}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {rtFetchedAt && (
                                        <span style={{ fontSize: 11, color: '#888' }}>
                                            {language === 'th' ? 'ดึงเมื่อ' : 'Fetched'} {new Date(rtFetchedAt).toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-GB')}
                                        </span>
                                    )}
                                    <button
                                        className="btn"
                                        onClick={() => campaign?._id && loadRaceTigerCounts(campaign._id)}
                                        disabled={rtLoading}
                                        style={{ padding: '4px 12px', fontSize: 11, background: '#00a65a', fontWeight: 600, opacity: rtLoading ? 0.7 : 1 }}
                                    >
                                        {rtLoading
                                            ? (language === 'th' ? 'กำลังดึง...' : 'Fetching...')
                                            : (language === 'th' ? 'ดึงข้อมูลใหม่' : 'Refresh')}
                                    </button>
                                </div>
                            </div>
                            {rtLoading ? (
                                <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12 }}>
                                    {language === 'th' ? 'กำลังดึงข้อมูลจาก RaceTiger...' : 'Fetching data from RaceTiger...'}
                                </div>
                            ) : rtError ? (
                                <div style={{ textAlign: 'center', padding: 16, color: '#dd4b39', fontSize: 12 }}>
                                    {language === 'th' ? 'ดึงข้อมูลจาก RaceTiger ไม่สำเร็จ: ' : 'Failed to fetch from RaceTiger: '}{rtError}
                                </div>
                            ) : !rtSelected ? (
                                <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูลระยะนี้จาก RaceTiger' : 'No RaceTiger data for this distance'}
                                </div>
                            ) : (
                                <table className="data-table" style={{ marginBottom: 0 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 50, background: '#00a65a', color: '#fff' }}>#</th>
                                            <th style={{ textAlign: 'left', background: '#00a65a', color: '#fff' }}>{language === 'th' ? 'กลุ่มอายุ (Category name)' : 'Category name'}</th>
                                            <th style={{ width: 140, background: '#00a65a', color: '#fff' }}>{language === 'th' ? 'จำนวนทั้งหมด' : 'Number of members'}</th>
                                            <th style={{ width: 120, background: '#00a65a', color: '#fff' }}>{language === 'th' ? 'ชาย' : 'Number of men'}</th>
                                            <th style={{ width: 120, background: '#00a65a', color: '#fff' }}>{language === 'th' ? 'หญิง' : 'Number of women'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rtSortedGroups.map((group, i) => (
                                            <tr key={`rt-${group.ageGroup || 'none'}-${i}`}>
                                                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                                <td style={{ textAlign: 'left', fontWeight: 600, color: group.ageGroup ? '#333' : '#999' }}>
                                                    {group.ageGroup || (language === 'th' ? 'ไม่ระบุกลุ่มอายุ' : 'No age group')}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{group.members}</td>
                                                <td style={{ textAlign: 'center' }}>{group.men}</td>
                                                <td style={{ textAlign: 'center' }}>{group.women}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
                                            <td></td>
                                            <td style={{ textAlign: 'left' }}>{language === 'th' ? 'รวม' : 'Total'}</td>
                                            <td style={{ textAlign: 'center' }}>{rtSelected.members}</td>
                                            <td style={{ textAlign: 'center' }}>{rtSelected.men}</td>
                                            <td style={{ textAlign: 'center' }}>{rtSelected.women}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Male groups */}
                        <div style={{
                            padding: '8px 15px',
                            background: '#f4f4f4',
                            borderLeft: '4px solid #3c8dbc',
                            marginBottom: 10,
                            fontWeight: 'bold',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ color: '#3c8dbc' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}>
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 8v8M8 12h8" />
                                </svg>
                                {language === 'th' ? 'กลุ่มอายุ: ชาย (Male)' : 'Age Groups: Male'}
                            </span>
                            <button
                                className="btn"
                                onClick={() => addRow('male')}
                                style={{ padding: '4px 12px', fontSize: 11, background: '#3c8dbc', fontWeight: 600 }}
                            >
                                + {language === 'th' ? 'เพิ่มรุ่นชาย' : 'Add Male Group'}
                            </button>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>#</th>
                                    <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อรุ่นอายุ' : 'Age Group Name'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'อายุเริ่ม' : 'Min Age'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'อายุสิ้นสุด' : 'Max Age'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'รางวัล' : 'Trophies'}</th>
                                    <th style={{ width: 80 }}>{language === 'th' ? 'ใช้งาน' : 'Active'}</th>
                                    <th style={{ width: 80 }}>{language === 'th' ? 'ลบ' : 'Delete'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {maleGroups.map((group) => (
                                    <tr key={`male-${group.index}`}>
                                        <td style={{ textAlign: 'center' }}>{group.index}</td>
                                        <td style={{ textAlign: 'left' }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={group.name}
                                                onChange={e => updateGroup('male', group.index, 'name', e.target.value)}
                                                style={{ width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.minAge}
                                                onChange={e => updateGroup('male', group.index, 'minAge', Number(e.target.value))}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.maxAge}
                                                onChange={e => updateGroup('male', group.index, 'maxAge', Number(e.target.value))}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.trophyCount}
                                                onChange={e => updateGroup('male', group.index, 'trophyCount', Number(e.target.value))}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div
                                                className={`toggle-sim ${group.active ? 'on' : ''}`}
                                                onClick={() => updateGroup('male', group.index, 'active', !group.active)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => deleteGroup('male', group.index)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#dd4b39',
                                                    padding: 4,
                                                }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Female groups */}
                        <div style={{
                            padding: '8px 15px',
                            background: '#f4f4f4',
                            borderLeft: '4px solid #e83e8c',
                            marginTop: 20,
                            marginBottom: 10,
                            fontWeight: 'bold',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ color: '#e83e8c' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}>
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 8v8M8 12h8" />
                                </svg>
                                {language === 'th' ? 'กลุ่มอายุ: หญิง (Female)' : 'Age Groups: Female'}
                            </span>
                            <button
                                className="btn"
                                onClick={() => addRow('female')}
                                style={{ padding: '4px 12px', fontSize: 11, background: '#e83e8c', fontWeight: 600 }}
                            >
                                + {language === 'th' ? 'เพิ่มรุ่นหญิง' : 'Add Female Group'}
                            </button>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>#</th>
                                    <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อรุ่นอายุ' : 'Age Group Name'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'อายุเริ่ม' : 'Min Age'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'อายุสิ้นสุด' : 'Max Age'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'รางวัล' : 'Trophies'}</th>
                                    <th style={{ width: 80 }}>{language === 'th' ? 'ใช้งาน' : 'Active'}</th>
                                    <th style={{ width: 80 }}>{language === 'th' ? 'ลบ' : 'Delete'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {femaleGroups.map((group) => (
                                    <tr key={`female-${group.index}`}>
                                        <td style={{ textAlign: 'center' }}>{group.index}</td>
                                        <td style={{ textAlign: 'left' }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={group.name}
                                                onChange={e => updateGroup('female', group.index, 'name', e.target.value)}
                                                style={{ width: '100%' }}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.minAge}
                                                onChange={e => updateGroup('female', group.index, 'minAge', Number(e.target.value))}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.maxAge}
                                                onChange={e => updateGroup('female', group.index, 'maxAge', Number(e.target.value))}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="table-input-small"
                                                value={group.trophyCount}
                                                onChange={e => updateGroup('female', group.index, 'trophyCount', Number(e.target.value))}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div
                                                className={`toggle-sim ${group.active ? 'on' : ''}`}
                                                onClick={() => updateGroup('female', group.index, 'active', !group.active)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => deleteGroup('female', group.index)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#dd4b39',
                                                    padding: 4,
                                                }}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

        </AdminLayout>
    );
}
