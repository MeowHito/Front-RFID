'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory {
    name: string;
    distance?: string;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    eventDate?: string;
    categories?: RaceCategory[];
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    nationality?: string;
    status?: string;
    overallRank?: number;
    netTime?: number;
    email?: string;
    phone?: string;
    idNo?: string;
    address?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
}

interface AddRunnerForm {
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh: string;
    lastNameTh: string;
    gender: string;
    category: string;
    nationality: string;
    phone: string;
    email: string;
    idNo: string;
    address: string;
    emergencyContact: string;
    emergencyPhone: string;
}

const emptyForm: AddRunnerForm = {
    bib: '', firstName: '', lastName: '', firstNameTh: '', lastNameTh: '',
    gender: 'M', category: '', nationality: 'TH', phone: '', email: '',
    idNo: '', address: '', emergencyContact: '', emergencyPhone: '',
};

export default function ParticipantsPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState<AddRunnerForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [search, setSearch] = useState('');

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load campaigns
    useEffect(() => {
        api.get('/campaigns')
            .then(res => {
                const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
                setCampaigns(list);
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

    // Load runners when campaign + category selected
    const loadRunners = async (campaignId: string, category?: string) => {
        setRunnersLoading(true);
        setRunners([]);
        try {
            const params: Record<string, string> = { eventId: campaignId };
            if (category) params.category = category;
            const res = await api.get('/runners', { params });
            const data = res.data;
            const list = Array.isArray(data) ? data : data?.data || [];
            setRunners(list);
        } catch {
            setRunners([]);
        } finally {
            setRunnersLoading(false);
        }
    };

    const selectCampaign = (campaign: Campaign) => {
        setSelectedCampaign(campaign);
        setSelectedCategory(null);
        setRunners([]);
    };

    const selectCategory = (catName: string) => {
        setSelectedCategory(catName);
        if (selectedCampaign) {
            loadRunners(selectedCampaign._id, catName);
            setAddForm(prev => ({ ...prev, category: catName }));
        }
    };

    const goBack = () => {
        if (selectedCategory) {
            setSelectedCategory(null);
            setRunners([]);
            setSearch('');
        } else if (selectedCampaign) {
            setSelectedCampaign(null);
            setRunners([]);
            setSearch('');
        }
    };

    const handleAddParticipant = async () => {
        if (!selectedCampaign || !addForm.bib || !addForm.firstName || !addForm.lastName || !addForm.category) {
            showToast(language === 'th' ? 'กรุณากรอกข้อมูลที่จำเป็น (BIB, ชื่อ, นามสกุล, ประเภท)' : 'Please fill required fields (BIB, Name, Category)', 'error');
            return;
        }
        setSaving(true);
        try {
            await api.post('/runners', {
                eventId: selectedCampaign._id,
                ...addForm,
            });
            showToast(language === 'th' ? 'เพิ่มนักกีฬาสำเร็จ!' : 'Participant added!', 'success');
            setAddForm({ ...emptyForm, category: selectedCategory || '' });
            setShowAddForm(false);
            if (selectedCampaign && selectedCategory) {
                loadRunners(selectedCampaign._id, selectedCategory);
            }
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    const formatTime = (ms?: number) => {
        if (!ms) return '-';
        const secs = Math.floor(ms / 1000);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const filteredRunners = runners.filter(r => {
        if (!search) return true;
        const q = search.toLowerCase();
        return r.bib?.toLowerCase().includes(q) ||
            r.firstName?.toLowerCase().includes(q) ||
            r.lastName?.toLowerCase().includes(q) ||
            r.firstNameTh?.toLowerCase().includes(q) ||
            r.lastNameTh?.toLowerCase().includes(q);
    });

    // Breadcrumb
    const breadcrumbParts: React.ReactNode[] = [
        <a key="admin" href="/admin/events" className="breadcrumb-link">Admin</a>,
        <span key="s1" className="breadcrumb-separator">/</span>,
    ];
    if (selectedCampaign) {
        breadcrumbParts.push(
            <button key="participants" className="breadcrumb-link" onClick={() => { setSelectedCampaign(null); setSelectedCategory(null); setRunners([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {language === 'th' ? 'นักกีฬา' : 'Participants'}
            </button>,
            <span key="s2" className="breadcrumb-separator">/</span>,
        );
        if (selectedCategory) {
            breadcrumbParts.push(
                <button key="campaign" className="breadcrumb-link" onClick={() => { setSelectedCategory(null); setRunners([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {selectedCampaign.nameTh || selectedCampaign.name}
                </button>,
                <span key="s3" className="breadcrumb-separator">/</span>,
                <span key="cat" className="breadcrumb-current">{selectedCategory}</span>,
            );
        } else {
            breadcrumbParts.push(
                <span key="campaign" className="breadcrumb-current">{selectedCampaign.nameTh || selectedCampaign.name}</span>,
            );
        }
    } else {
        breadcrumbParts.push(
            <span key="participants" className="breadcrumb-current">{language === 'th' ? 'นักกีฬา' : 'Participants'}</span>,
        );
    }

    return (
        <AdminLayout>
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

            <div className="admin-breadcrumb">{breadcrumbParts}</div>

            {/* Step 1: Select Campaign */}
            {!selectedCampaign && (
                <div className="content-box">
                    <div className="events-header">
                        <h2 className="events-title">{language === 'th' ? 'เลือกกิจกรรม' : 'Select Event'}</h2>
                    </div>
                    {loading ? (
                        <div className="events-loading">Loading...</div>
                    ) : campaigns.length === 0 ? (
                        <div className="events-empty">{language === 'th' ? 'ไม่มีกิจกรรม' : 'No events'}</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: '8px 0' }}>
                            {campaigns.map(c => (
                                <div
                                    key={c._id}
                                    onClick={() => selectCampaign(c)}
                                    style={{
                                        padding: 20, borderRadius: 12, cursor: 'pointer',
                                        border: '2px solid #333', background: '#1a1a2e', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#1e1e3a'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#333'; (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
                                >
                                    <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
                                    <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#fff' }}>
                                        {language === 'th' ? (c.nameTh || c.name) : (c.nameEn || c.name)}
                                    </h3>
                                    <p style={{ color: '#888', fontSize: 13 }}>
                                        {c.categories?.length || 0} {language === 'th' ? 'ระยะทาง' : 'distances'}
                                    </p>
                                    {c.eventDate && (
                                        <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                                            📅 {new Date(c.eventDate).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Select Distance */}
            {selectedCampaign && !selectedCategory && (
                <div className="content-box">
                    <div className="events-header">
                        <h2 className="events-title">
                            {language === 'th' ? 'เลือกระยะทาง' : 'Select Distance'} — {selectedCampaign.nameTh || selectedCampaign.name}
                        </h2>
                        <div className="events-toolbar">
                            <button className="btn-secondary" onClick={goBack}>
                                ← {language === 'th' ? 'กลับ' : 'Back'}
                            </button>
                        </div>
                    </div>

                    {(selectedCampaign.categories || []).length === 0 ? (
                        <div className="events-empty">{language === 'th' ? 'ไม่มีระยะทาง' : 'No distances'}</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, padding: '8px 0' }}>
                            {(selectedCampaign.categories || []).map((cat, idx) => (
                                <div
                                    key={`${cat.name}-${idx}`}
                                    onClick={() => selectCategory(cat.name)}
                                    style={{
                                        padding: 20, borderRadius: 12, cursor: 'pointer',
                                        border: '2px solid #333', background: '#1a1a2e', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.background = '#1e1e3a'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#333'; (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
                                >
                                    <p style={{ fontSize: 28, marginBottom: 8 }}>🏃</p>
                                    <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#fff' }}>{cat.name}</h3>
                                    {cat.distance && <p style={{ color: '#888', fontSize: 13 }}>{cat.distance}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Step 3: Runner List */}
            {selectedCampaign && selectedCategory && (
                <div className="content-box">
                    <div className="events-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <h2 className="events-title">
                            {selectedCategory} — {language === 'th' ? 'นักกีฬา' : 'Participants'} ({filteredRunners.length})
                        </h2>
                        <div className="events-toolbar" style={{ gap: 8 }}>
                            <input
                                type="text"
                                placeholder={language === 'th' ? '🔍 ค้นหา BIB / ชื่อ' : '🔍 Search BIB / Name'}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    padding: '6px 12px', borderRadius: 6, border: '1px solid #444',
                                    background: '#1e1e2a', color: '#fff', fontSize: 13, width: 200,
                                }}
                            />
                            <button className="btn btn-add" onClick={() => { setAddForm({ ...emptyForm, category: selectedCategory }); setShowAddForm(true); }}>
                                + {language === 'th' ? 'เพิ่มนักกีฬา' : 'Add'}
                            </button>
                            <button className="btn-secondary" onClick={goBack}>
                                ← {language === 'th' ? 'กลับ' : 'Back'}
                            </button>
                        </div>
                    </div>

                    {runnersLoading ? (
                        <div className="events-loading">Loading...</div>
                    ) : filteredRunners.length === 0 ? (
                        <div className="events-empty">{language === 'th' ? 'ไม่มีนักกีฬา' : 'No participants'}</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>BIB</th>
                                        <th>{language === 'th' ? 'ชื่อ' : 'Name'}</th>
                                        <th>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                        <th>{language === 'th' ? 'ประเภท' : 'Category'}</th>
                                        <th>{language === 'th' ? 'สัญชาติ' : 'Nationality'}</th>
                                        <th>{language === 'th' ? 'อันดับ' : 'Rank'}</th>
                                        <th>{language === 'th' ? 'เวลา' : 'Time'}</th>
                                        <th>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRunners.map(r => (
                                        <tr key={r._id}>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.bib}</td>
                                            <td>{r.firstName} {r.lastName}</td>
                                            <td style={{ textAlign: 'center' }}>{r.gender}</td>
                                            <td>{r.category}</td>
                                            <td style={{ textAlign: 'center' }}>{r.nationality || '-'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.overallRank || '-'}</td>
                                            <td style={{ textAlign: 'center' }}>{formatTime(r.netTime)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={`status-badge ${r.status || ''}`}>{r.status || '-'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Add Participant Modal */}
            {showAddForm && selectedCampaign && (
                <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{language === 'th' ? 'เพิ่มนักกีฬา' : 'Add Participant'}</h3>
                            <button className="modal-close" onClick={() => setShowAddForm(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {/* BIB + Gender */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span> BIB</label>
                                    <input className="admin-form-input" value={addForm.bib} onChange={e => setAddForm({ ...addForm, bib: e.target.value })} placeholder="001" />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span> {language === 'th' ? 'เพศ' : 'Gender'}</label>
                                    <select className="admin-form-select" value={addForm.gender} onChange={e => setAddForm({ ...addForm, gender: e.target.value })}>
                                        <option value="M">{language === 'th' ? 'ชาย' : 'Male'}</option>
                                        <option value="F">{language === 'th' ? 'หญิง' : 'Female'}</option>
                                    </select>
                                </div>
                            </div>

                            {/* Name EN */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span> {language === 'th' ? 'ชื่อ (EN)' : 'First Name'}</label>
                                    <input className="admin-form-input" value={addForm.firstName} onChange={e => setAddForm({ ...addForm, firstName: e.target.value })} placeholder="John" />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span> {language === 'th' ? 'นามสกุล (EN)' : 'Last Name'}</label>
                                    <input className="admin-form-input" value={addForm.lastName} onChange={e => setAddForm({ ...addForm, lastName: e.target.value })} placeholder="Doe" />
                                </div>
                            </div>

                            {/* Name TH */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'ชื่อ (TH)' : 'First Name (TH)'}</label>
                                    <input className="admin-form-input" value={addForm.firstNameTh} onChange={e => setAddForm({ ...addForm, firstNameTh: e.target.value })} placeholder="จอห์น" />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'นามสกุล (TH)' : 'Last Name (TH)'}</label>
                                    <input className="admin-form-input" value={addForm.lastNameTh} onChange={e => setAddForm({ ...addForm, lastNameTh: e.target.value })} placeholder="โด" />
                                </div>
                            </div>

                            {/* Category + Nationality */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span> {language === 'th' ? 'ประเภท/ระยะทาง' : 'Category/Distance'}</label>
                                    <select className="admin-form-select" value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })}>
                                        <option value="">{language === 'th' ? 'เลือก...' : 'Select...'}</option>
                                        {(selectedCampaign.categories || []).map((cat, idx) => (
                                            <option key={`${cat.name}-${idx}`} value={cat.name}>{cat.name} {cat.distance ? `(${cat.distance})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'สัญชาติ' : 'Nationality'}</label>
                                    <input className="admin-form-input" value={addForm.nationality} onChange={e => setAddForm({ ...addForm, nationality: e.target.value })} placeholder="TH" />
                                </div>
                            </div>

                            {/* Phone + Email */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}</label>
                                    <input className="admin-form-input" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Email</label>
                                    <input className="admin-form-input" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="john@example.com" />
                                </div>
                            </div>

                            {/* ID / Passport */}
                            <div className="admin-form-group">
                                <label className="admin-form-label">{language === 'th' ? 'เลขบัตรประชาชน / พาสปอร์ต' : 'ID Number / Passport'}</label>
                                <input className="admin-form-input" value={addForm.idNo} onChange={e => setAddForm({ ...addForm, idNo: e.target.value })} placeholder="1-xxxx-xxxxx-xx-x" />
                            </div>

                            {/* Address */}
                            <div className="admin-form-group">
                                <label className="admin-form-label">{language === 'th' ? 'ที่อยู่' : 'Address'}</label>
                                <input className="admin-form-input" value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} placeholder={language === 'th' ? 'ที่อยู่ปัจจุบัน' : 'Current address'} />
                            </div>

                            {/* Emergency Contact */}
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'ผู้ติดต่อฉุกเฉิน' : 'Emergency Contact'}</label>
                                    <input className="admin-form-input" value={addForm.emergencyContact} onChange={e => setAddForm({ ...addForm, emergencyContact: e.target.value })} placeholder={language === 'th' ? 'ชื่อผู้ติดต่อ' : 'Contact name'} />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'เบอร์ฉุกเฉิน' : 'Emergency Phone'}</label>
                                    <input className="admin-form-input" value={addForm.emergencyPhone} onChange={e => setAddForm({ ...addForm, emergencyPhone: e.target.value })} placeholder="08x-xxx-xxxx" />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button className="btn-primary" onClick={handleAddParticipant} disabled={saving}>
                                {saving ? '...' : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
