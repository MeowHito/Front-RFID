'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

// Campaign interface
interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
    status: string;
    itra?: number;
    utmbIndex?: string;
}

interface Campaign {
    _id: string;
    uuid: string;
    name: string;
    shortName?: string;
    description?: string;
    eventDate: string;
    eventEndDate?: string;
    location: string;
    pictureUrl?: string;
    logoUrl?: string;
    status: string;
    isDraft?: boolean;
    allowRFIDSync?: boolean;
    allowCertificate?: boolean;
    isActive?: boolean;
    categories: RaceCategory[];
    organizerName?: string;
}

export default function EventsPage() {
    const { language } = useLanguage();
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Delete modal
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        loadCampaigns();
    }, []);

    const loadCampaigns = async () => {
        try {
            const res = await fetch('/api/campaigns');
            const json = await res.json();
            const campaignData = json?.data || json || [];
            setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 2500);
    };

    // --- Toggle handlers (persist to DB) ---
    const handleToggle = async (campaignId: string, field: 'allowRFIDSync' | 'allowCertificate' | 'status') => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;

        let newValue: boolean | string;
        if (field === 'status') {
            newValue = campaign.status === 'active' ? 'inactive' : 'active';
        } else {
            newValue = !(campaign[field] || false);
        }

        // Optimistic update
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId
                ? { ...c, [field]: newValue }
                : c
        ));

        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: newValue }),
            });
            if (!res.ok) throw new Error('PUT failed');
        } catch {
            // Revert on failure
            setCampaigns(prev => prev.map(c =>
                c._id === campaignId
                    ? { ...c, [field]: field === 'status' ? campaign.status : campaign[field] }
                    : c
            ));
            showToast(language === 'th' ? 'อัปเดตไม่สำเร็จ' : 'Update failed');
        }
    };

    // --- Trophy handler (only 1 active at a time) ---
    const handleTrophy = async (campaignId: string) => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;

        const wasActive = campaign.isActive || false;

        // Set all to inactive, then toggle the clicked one
        setCampaigns(prev => prev.map(c => ({
            ...c,
            isActive: c._id === campaignId ? !wasActive : false,
        })));

        try {
            // Deactivate all others first
            const otherActives = campaigns.filter(c => c.isActive && c._id !== campaignId);
            for (const other of otherActives) {
                await fetch(`/api/campaigns/${other._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isActive: false }),
                });
            }
            // Toggle this one
            await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !wasActive }),
            });
        } catch {
            loadCampaigns(); // Revert
            showToast(language === 'th' ? 'อัปเดตไม่สำเร็จ' : 'Update failed');
        }
    };

    // --- Delete ---
    const openDeleteConfirm = (campaign: Campaign) => {
        setCampaignToDelete(campaign);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteCampaign = async () => {
        if (!campaignToDelete) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignToDelete._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
            showToast(language === 'th' ? 'ลบกิจกรรมสำเร็จ!' : 'Event deleted successfully!');
            loadCampaigns();
            setDeleteConfirmOpen(false);
            setCampaignToDelete(null);
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาดในการลบ' : 'Failed to delete event');
        } finally {
            setDeleting(false);
        }
    };

    // --- Filter ---
    const filteredCampaigns = campaigns.filter(c =>
        !search || c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'จัดการอีเวนต์', labelEn: 'Manage Events' }
            ]}
            pageTitle={language === 'th' ? 'จัดการข้อมูลอีเวนท์และประเภทการแข่งขัน' : 'Manage events and competition categories'}
        >
            <div className="em-container">
                {/* Toolbar */}
                <div className="em-toolbar">
                    <input
                        type="text"
                        className="em-search"
                        placeholder={language === 'th' ? 'ค้นหาชื่อกิจกรรม...' : 'Search events...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        className="em-btn-create"
                        onClick={() => router.push('/admin/events/create')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        {language === 'th' ? 'สร้างกิจกรรมใหม่' : 'Create Event'}
                    </button>
                </div>

                {/* Table */}
                <div className="em-table-wrapper">
                    <table className="em-table">
                        <thead>
                            <tr>
                                <th style={{ width: 80 }}>Tools</th>
                                <th style={{ width: 60 }}>ID</th>
                                <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อกิจกรรม' : 'Event Name'}</th>
                                <th style={{ width: 100 }}>{language === 'th' ? 'วันที่' : 'Date'}</th>
                                <th style={{ width: 70 }}>{language === 'th' ? 'โหมด' : 'Mode'}</th>
                                <th style={{ width: 80 }}>{language === 'th' ? 'ใบเซอร์' : 'Cert'}</th>
                                <th style={{ width: 90 }}>RFID Sync</th>
                                <th style={{ width: 80 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                <th style={{ width: 50 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                </td></tr>
                            ) : filteredCampaigns.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                                    {language === 'th' ? 'ไม่พบกิจกรรม' : 'No events found'}
                                </td></tr>
                            ) : (
                                filteredCampaigns.map((campaign) => (
                                    <tr key={campaign._id}>
                                        {/* Tools: Pencil + Trophy */}
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="em-icon-btn em-edit"
                                                title={language === 'th' ? 'แก้ไข' : 'Edit'}
                                                onClick={() => router.push(`/admin/events/create?edit=${campaign._id}`)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                className={`em-icon-btn em-trophy ${campaign.isActive ? 'active' : ''}`}
                                                title={language === 'th' ? 'กำลังใช้งาน' : 'Active Event'}
                                                onClick={() => handleTrophy(campaign._id)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill={campaign.isActive ? '#f39c12' : 'none'} stroke={campaign.isActive ? '#f39c12' : '#ccc'} strokeWidth="2">
                                                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                                    <path d="M4 22h16" /><path d="M10 22V8a6 6 0 0 0-6-4h16a6 6 0 0 0-6 4v14" />
                                                </svg>
                                            </button>
                                        </td>

                                        {/* ID */}
                                        <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13 }}>
                                            {campaign._id.slice(-6).toUpperCase()}
                                        </td>

                                        {/* Event Name */}
                                        <td>
                                            <strong>{campaign.name}</strong>
                                            <br />
                                            <small style={{ color: '#777' }}>{campaign.location || '-'}</small>
                                        </td>

                                        {/* Date */}
                                        <td style={{ textAlign: 'center', fontSize: 12 }}>
                                            {formatDate(campaign.eventDate)}
                                        </td>

                                        {/* Mode */}
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`em-badge ${campaign.isDraft ? 'test' : 'real'}`}>
                                                {campaign.isDraft ? 'TEST' : 'REAL'}
                                            </span>
                                        </td>

                                        {/* Certificate toggle */}
                                        <td style={{ textAlign: 'center' }}>
                                            <label className="em-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.allowCertificate || false}
                                                    onChange={() => handleToggle(campaign._id, 'allowCertificate')}
                                                />
                                                <span className="em-toggle-slider"></span>
                                            </label>
                                        </td>

                                        {/* RFID Sync */}
                                        <td style={{ textAlign: 'center' }}>
                                            <label className="em-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.allowRFIDSync || false}
                                                    onChange={() => handleToggle(campaign._id, 'allowRFIDSync')}
                                                />
                                                <span className="em-toggle-slider"></span>
                                            </label>
                                        </td>

                                        {/* Status toggle */}
                                        <td style={{ textAlign: 'center' }}>
                                            <label className="em-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.status === 'active'}
                                                    onChange={() => handleToggle(campaign._id, 'status')}
                                                />
                                                <span className="em-toggle-slider"></span>
                                            </label>
                                        </td>

                                        {/* Delete */}
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="em-icon-btn em-delete"
                                                title={language === 'th' ? 'ลบ' : 'Delete'}
                                                onClick={() => openDeleteConfirm(campaign)}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Toast */}
            {toastMessage && (
                <div className="toast-container">
                    <div className="toast toast-success">
                        <span className="toast-icon">✓</span>
                        <span className="toast-message">{toastMessage}</span>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmOpen && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title" style={{ color: '#dc2626' }}>
                                {language === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
                            </h2>
                            <button className="modal-close" onClick={() => setDeleteConfirmOpen(false)}>×</button>
                        </div>
                        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                            <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                {language === 'th' ? 'คุณแน่ใจหรือว่าต้องการลบกิจกรรมนี้?' : 'Are you sure you want to delete this event?'}
                            </p>
                            <p style={{ color: '#666', fontSize: '0.9rem' }}>
                                <strong>{campaignToDelete?.name}</strong>
                            </p>
                            <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '1rem' }}>
                                {language === 'th' ? 'การดำเนินการนี้ไม่สามารถย้อนกลับได้' : 'This action cannot be undone'}
                            </p>
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
                            <button className="btn-secondary" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleDeleteCampaign}
                                disabled={deleting}
                                style={{ background: '#dc2626', color: '#fff', padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                            >
                                {deleting
                                    ? (language === 'th' ? 'กำลังลบ...' : 'Deleting...')
                                    : (language === 'th' ? 'ลบกิจกรรม' : 'Delete Event')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
