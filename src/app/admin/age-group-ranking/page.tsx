'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';

export default function AgeGroupRankingPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [excludeTop, setExcludeTop] = useState<number>(0);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchCampaign();
    }, []);

    const fetchCampaign = async () => {
        try {
            const res = await fetch('/api/campaigns/featured');
            if (res.ok) {
                const data = await res.json();
                setCampaign(data);
                setExcludeTop(data.excludeOverallFromAgeGroup || 0);
            }
        } catch { /* */ } finally {
            setLoading(false);
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ excludeOverallFromAgeGroup: excludeTop }),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved', 'success');
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch {
            showToast('Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    const options = [
        { value: 0, label: language === 'th' ? 'ไม่ตัดออก (แสดงทั้งหมด)' : 'No exclusion (show all)', desc: language === 'th' ? 'แสดงนักวิ่งทุกคนในอันดับกลุ่มอายุ รวมถึงผู้ชนะ Overall' : 'Show all runners in age group rankings including Overall winners' },
        { value: 3, label: language === 'th' ? 'ตัด Overall อันดับ 1-3 ออก' : 'Exclude Overall Top 1-3', desc: language === 'th' ? 'นักวิ่งที่ได้ Overall อันดับ 1-3 จะไม่แสดงในอันดับกลุ่มอายุ' : 'Runners ranked Overall 1-3 will not appear in age group rankings' },
        { value: 5, label: language === 'th' ? 'ตัด Overall อันดับ 1-5 ออก' : 'Exclude Overall Top 1-5', desc: language === 'th' ? 'นักวิ่งที่ได้ Overall อันดับ 1-5 จะไม่แสดงในอันดับกลุ่มอายุ' : 'Runners ranked Overall 1-5 will not appear in age group rankings' },
    ];

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'อันดับกลุ่มอายุ', labelEn: 'Age Group Ranking' }
            ]}
        >
            {/* Toast */}
            {toast && (
                <div className={`fixed top-5 right-5 z-[9999] px-6 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}

            <div className="p-6 max-w-3xl">
                {loading ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'ไม่พบแคมเปญที่กดดาว — กรุณากดดาวเลือกกิจกรรมที่ต้องการก่อน' : 'No featured campaign found — please star a campaign first'}
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="mb-6">
                            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <i className="fas fa-ranking-star text-amber-500" />
                                {language === 'th' ? 'ตั้งค่าอันดับกลุ่มอายุ' : 'Age Group Ranking Settings'}
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {language === 'th'
                                    ? 'กำหนดว่าจะตัดผู้ชนะ Overall อันดับต้นๆ ออกจากการจัดอันดับกลุ่มอายุในหน้า Result-Winners หรือไม่'
                                    : 'Configure whether to exclude top Overall winners from age group rankings on the Result-Winners page'}
                            </p>
                            <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-xs text-blue-700 font-medium">
                                    <i className="fas fa-info-circle mr-1" />
                                    {language === 'th'
                                        ? `กิจกรรมที่เลือก: ${campaign.name}`
                                        : `Selected campaign: ${campaign.name}`}
                                </p>
                            </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-3 mb-8">
                            {options.map(opt => (
                                <label
                                    key={opt.value}
                                    className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                        excludeTop === opt.value
                                            ? 'border-green-500 bg-green-50 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                    onClick={() => setExcludeTop(opt.value)}
                                >
                                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                        excludeTop === opt.value ? 'border-green-500' : 'border-gray-300'
                                    }`}>
                                        {excludeTop === opt.value && (
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                        )}
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${excludeTop === opt.value ? 'text-green-700' : 'text-gray-700'}`}>
                                            {opt.label}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Example Box */}
                        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <h4 className="text-sm font-bold text-amber-800 mb-2">
                                <i className="fas fa-lightbulb mr-1" />
                                {language === 'th' ? 'ตัวอย่างการทำงาน' : 'How it works'}
                            </h4>
                            <div className="text-xs text-amber-700 space-y-1">
                                {excludeTop === 0 ? (
                                    <p>{language === 'th'
                                        ? '• นักวิ่งทุกคนจะแสดงในอันดับกลุ่มอายุตามปกติ ไม่มีการตัดออก'
                                        : '• All runners appear in age group rankings as normal'}</p>
                                ) : (
                                    <>
                                        <p>{language === 'th'
                                            ? `• นักวิ่งที่ได้ Overall อันดับ 1-${excludeTop} จะถูกตัดออกจากอันดับกลุ่มอายุ`
                                            : `• Runners with Overall rank 1-${excludeTop} will be excluded from age group rankings`}</p>
                                        <p>{language === 'th'
                                            ? '• คนถัดไปจะขยับขึ้นมาแทนที่ในอันดับกลุ่มอายุ'
                                            : '• The next runner will move up to fill their place in the age group'}</p>
                                        <p>{language === 'th'
                                            ? '• มีผลเฉพาะหน้า Result-Winners เท่านั้น ไม่กระทบหน้า Event/'
                                            : '• Only affects the Result-Winners page, not the Event page'}</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`px-8 py-3 rounded-xl text-sm font-bold text-white transition-all ${
                                saving ? 'bg-gray-400 cursor-wait' : 'bg-green-600 hover:bg-green-700 cursor-pointer'
                            }`}
                        >
                            {saving
                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (language === 'th' ? '💾 บันทึกการตั้งค่า' : '💾 Save Settings')}
                        </button>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
