'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Campaign {
    _id: string;
    name: string;
    startDate?: string;
    endDate?: string;
    coverImage?: string;
    categories?: { name: string; distance?: string }[];
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    nationality?: string;
    status?: string;
    overallRank?: number;
    netTime?: number;
}

export default function ParticipantsPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({
        bib: '', firstName: '', lastName: '', gender: 'M', category: '',
        nationality: '', phone: '', email: ''
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/campaigns')
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : data.data || [];
                setCampaigns(list);
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

    const selectEvent = async (campaign: Campaign) => {
        setSelectedEvent(campaign);
        setRunnersLoading(true);
        setRunners([]);
        try {
            const res = await fetch(`/api/runners?id=${campaign._id}`);
            const data = await res.json();
            const list = data?.data || [];
            setRunners(Array.isArray(list) ? list : []);
        } catch {
            setRunners([]);
        } finally {
            setRunnersLoading(false);
        }
    };

    const handleAddParticipant = async () => {
        if (!selectedEvent || !addForm.bib || !addForm.firstName || !addForm.lastName || !addForm.category) {
            setMessage(language === 'th' ? 'กรุณากรอกข้อมูลที่จำเป็น' : 'Please fill required fields');
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://3.26.160.149';
            const res = await fetch(`${API_URL}/runners`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: selectedEvent._id,
                    ...addForm
                })
            });
            if (res.ok) {
                setMessage(language === 'th' ? 'เพิ่มนักกีฬาสำเร็จ!' : 'Participant added!');
                setAddForm({ bib: '', firstName: '', lastName: '', gender: 'M', category: '', nationality: '', phone: '', email: '' });
                setShowAddForm(false);
                // Reload runners
                selectEvent(selectedEvent);
            } else {
                setMessage(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error saving');
            }
        } catch {
            setMessage(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error saving');
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

    return (
        <AdminLayout>
            <div className="admin-breadcrumb">
                <a href="/admin/events" className="breadcrumb-link">Admin</a>
                <span className="breadcrumb-separator">/</span>
                {selectedEvent ? (
                    <>
                        <button className="breadcrumb-link" onClick={() => { setSelectedEvent(null); setRunners([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {language === 'th' ? 'นักกีฬา' : 'Participants'}
                        </button>
                        <span className="breadcrumb-separator">/</span>
                        <span className="breadcrumb-current">{selectedEvent.name}</span>
                    </>
                ) : (
                    <span className="breadcrumb-current">{language === 'th' ? 'นักกีฬา' : 'Participants'}</span>
                )}
            </div>

            {message && (
                <div className={`modal-message ${message.includes('!') ? 'success' : 'error'}`} style={{ margin: '0 0 10px' }}>
                    {message}
                </div>
            )}

            {!selectedEvent ? (
                /* Step 1: Select event */
                <div className="content-box">
                    <div className="events-header">
                        <h2 className="events-title">{language === 'th' ? 'เลือกอีเวนต์' : 'Select Event'}</h2>
                    </div>
                    {loading ? (
                        <div className="events-loading">Loading...</div>
                    ) : campaigns.length === 0 ? (
                        <div className="events-empty">{language === 'th' ? 'ไม่มีอีเวนต์' : 'No events'}</div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>{language === 'th' ? 'ชื่ออีเวนต์' : 'Event Name'}</th>
                                    <th>{language === 'th' ? 'วันที่' : 'Date'}</th>
                                    <th>{language === 'th' ? 'ประเภท' : 'Categories'}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((c, i) => (
                                    <tr key={c._id} style={{ cursor: 'pointer' }} onClick={() => selectEvent(c)}>
                                        <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                        <td style={{ fontWeight: 500 }}>{c.name}</td>
                                        <td>{c.startDate ? new Date(c.startDate).toLocaleDateString() : '-'}</td>
                                        <td>
                                            {(c.categories || []).map((cat) => (
                                                <span key={cat.name} className="dist-badge bg-blue" style={{ marginRight: 4 }}>{cat.name}</span>
                                            ))}
                                        </td>
                                        <td>
                                            <button className="btn btn-query" onClick={(e) => { e.stopPropagation(); selectEvent(c); }}>
                                                {language === 'th' ? 'ดู' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                /* Step 2: Show runners for selected event */
                <div className="content-box">
                    <div className="events-header">
                        <h2 className="events-title">
                            {selectedEvent.name} — {language === 'th' ? 'นักกีฬา' : 'Participants'} ({runners.length})
                        </h2>
                        <div className="events-toolbar">
                            <button className="btn btn-add" onClick={() => setShowAddForm(true)}>
                                + {language === 'th' ? 'เพิ่มนักกีฬา' : 'Add Participant'}
                            </button>
                            <button className="btn-secondary" onClick={() => { setSelectedEvent(null); setRunners([]); }}>
                                ← {language === 'th' ? 'กลับ' : 'Back'}
                            </button>
                        </div>
                    </div>

                    {runnersLoading ? (
                        <div className="events-loading">Loading...</div>
                    ) : runners.length === 0 ? (
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
                                    {runners.map((r) => (
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
            {showAddForm && selectedEvent && (
                <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{language === 'th' ? 'เพิ่มนักกีฬา' : 'Add Participant'}</h3>
                            <button className="modal-close" onClick={() => setShowAddForm(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span>BIB</label>
                                    <input className="admin-form-input" value={addForm.bib} onChange={e => setAddForm({ ...addForm, bib: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span>{language === 'th' ? 'เพศ' : 'Gender'}</label>
                                    <select className="admin-form-select" value={addForm.gender} onChange={e => setAddForm({ ...addForm, gender: e.target.value })}>
                                        <option value="M">{language === 'th' ? 'ชาย' : 'Male'}</option>
                                        <option value="F">{language === 'th' ? 'หญิง' : 'Female'}</option>
                                    </select>
                                </div>
                            </div>
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span>{language === 'th' ? 'ชื่อ' : 'First Name'}</label>
                                    <input className="admin-form-input" value={addForm.firstName} onChange={e => setAddForm({ ...addForm, firstName: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span>{language === 'th' ? 'นามสกุล' : 'Last Name'}</label>
                                    <input className="admin-form-input" value={addForm.lastName} onChange={e => setAddForm({ ...addForm, lastName: e.target.value })} />
                                </div>
                            </div>
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label"><span className="required">*</span>{language === 'th' ? 'ประเภท' : 'Category'}</label>
                                    <select className="admin-form-select" value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })}>
                                        <option value="">{language === 'th' ? 'เลือก...' : 'Select...'}</option>
                                        {(selectedEvent.categories || []).map(cat => (
                                            <option key={cat.name} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'สัญชาติ' : 'Nationality'}</label>
                                    <input className="admin-form-input" value={addForm.nationality} onChange={e => setAddForm({ ...addForm, nationality: e.target.value })} />
                                </div>
                            </div>
                            <div className="admin-form-row two-cols">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">{language === 'th' ? 'โทรศัพท์' : 'Phone'}</label>
                                    <input className="admin-form-input" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Email</label>
                                    <input className="admin-form-input" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>{language === 'th' ? 'ยกเลิก' : 'Cancel'}</button>
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
