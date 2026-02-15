'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import RFIDDashboardModal from './RFIDDashboardModal';
import CertificateFormModal from './CertificateFormModal';
import EventDetailsModal from './EventDetailsModal';

// Race category type
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

// Campaign interface
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
    isApproveCertificate?: boolean;
    isFeatured?: boolean;
    categories: RaceCategory[];
    organizerName?: string;
}

export default function EventsPage() {
    const { language } = useLanguage();
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ทั้งหมด');
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    // Modal states
    const [rfidModalOpen, setRfidModalOpen] = useState(false);
    const [certificateModalOpen, setCertificateModalOpen] = useState(false);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [featuredConfirmOpen, setFeaturedConfirmOpen] = useState(false);
    const [featuredTargetId, setFeaturedTargetId] = useState<string | null>(null);

    const loadCampaigns = async () => {
        try {
            const params = new URLSearchParams();
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            const res = await fetch(`/api/campaigns?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch');
            const json = await res.json();
            const campaignData = json?.data || json || [];
            setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => {
            setLoading(true);
            loadCampaigns();
        }, 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const handleToggleSync = async (campaignId: string, field: 'allowRFIDSync' | 'isDraft') => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;
        
        const newValue = !campaign[field];
        
        // Optimistic update
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId ? { ...c, [field]: newValue } : c
        ));

        try {
            // For isDraft: when isDraft is false, the event is published (visible on main page)
            // When isDraft is true, it's hidden from the main page
            const body = field === 'isDraft' ? { isDraft: newValue } : { [field]: newValue };
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to update');
        } catch (error) {
            console.error('Failed to update toggle:', error);
            // Revert on failure
            setCampaigns(prev => prev.map(c =>
                c._id === campaignId ? { ...c, [field]: !newValue } : c
            ));
            setToastMessage(language === 'th' ? 'เกิดข้อผิดพลาดในการอัปเดต' : 'Failed to update');
        }
    };

    const handleToggleStatus = async (campaignId: string) => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;
        
        const statusOrder = ['upcoming', 'active', 'live', 'finished'];
        const currentIdx = statusOrder.indexOf(campaign.status || 'upcoming');
        const newStatus = statusOrder[(currentIdx + 1) % statusOrder.length];
        
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId ? { ...c, status: newStatus } : c
        ));

        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Failed to update status');
        } catch (error) {
            console.error('Failed to update status:', error);
            setCampaigns(prev => prev.map(c =>
                c._id === campaignId ? { ...c, status: campaign.status } : c
            ));
        }
    };

    const handleToggleCertificate = async (campaignId: string) => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;
        const newValue = !(campaign.isApproveCertificate ?? false);
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId ? { ...c, isApproveCertificate: newValue } : c
        ));
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isApproveCertificate: newValue }),
            });
            if (!res.ok) throw new Error('Failed to update');
        } catch (error) {
            setCampaigns(prev => prev.map(c =>
                c._id === campaignId ? { ...c, isApproveCertificate: campaign.isApproveCertificate } : c
            ));
        }
    };

    const handleToggleFeatured = async (campaignId: string) => {
        const campaign = campaigns.find(c => c._id === campaignId);
        if (!campaign) return;
        const isCurrentlyFeatured = campaign.isFeatured ?? false;

        if (isCurrentlyFeatured) {
            setCampaigns(prev => prev.map(c => ({ ...c, isFeatured: false })));
            try {
                await fetch(`/api/campaigns/${campaignId}/featured`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: false }),
                });
                window.dispatchEvent(new CustomEvent('admin-featured-updated'));
            } catch (e) {
                loadCampaigns();
            }
            return;
        }
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId ? { ...c, isFeatured: true } : { ...c, isFeatured: false }
        ));
        try {
            const res = await fetch(`/api/campaigns/${campaignId}/featured`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: true }),
            });
            if (!res.ok) throw new Error('Failed to set featured');
            window.dispatchEvent(new CustomEvent('admin-featured-updated'));
        } catch (error) {
            loadCampaigns();
        }
    };

    const openFeaturedConfirm = (campaignId: string) => {
        setFeaturedTargetId(campaignId);
        setFeaturedConfirmOpen(true);
    };

    const closeFeaturedConfirm = () => {
        setFeaturedConfirmOpen(false);
        setFeaturedTargetId(null);
    };

    const handleConfirmFeaturedChange = () => {
        if (!featuredTargetId) return;
        handleToggleFeatured(featuredTargetId);
        closeFeaturedConfirm();
    };

    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const copyToClipboard = (text: string, type: string, linkType: 'chipcode' | 'realtime') => {
        navigator.clipboard.writeText(text);
        setCopiedLink(type);

        // Show toast notification
        const message = language === 'th'
            ? (linkType === 'chipcode' ? 'คัดลอกลิงก์ ChipCode แล้ว!' : 'คัดลอกลิงก์ Realtime แล้ว!')
            : (linkType === 'chipcode' ? 'ChipCode link copied!' : 'Realtime link copied!');
        setToastMessage(message);

        setTimeout(() => {
            setCopiedLink(null);
            setToastMessage(null);
        }, 2500);
    };

    const getChipCodeLink = (eventId: string) => {
        return `${window.location.origin}/chipcode/${eventId}`;
    };

    const getRealtimeLink = (eventId: string) => {
        return `${window.location.origin}/realtime/${eventId}`;
    };

    // Modal handlers
    const openRfidModal = (campaign: Campaign) => {
        setSelectedCampaign(campaign);
        setRfidModalOpen(true);
    };

    const openCertificateModal = (campaign: Campaign) => {
        setSelectedCampaign(campaign);
        setCertificateModalOpen(true);
    };

    const openDetailsModal = (campaign: Campaign | null = null, creating = false) => {
        setSelectedCampaign(campaign);
        setIsCreating(creating);
        setDetailsModalOpen(true);
    };

    const handleSaveCampaignDetails = async (data: Partial<Campaign>) => {
        try {
            if (isCreating) {
                // Create new campaign via API proxy
                const res = await fetch('/api/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error('Failed to create');
            } else if (data._id) {
                // Update existing campaign via API proxy
                const res = await fetch(`/api/campaigns/${data._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error('Failed to update');
            }
            loadCampaigns();
            setDetailsModalOpen(false);
        } catch (error) {
            console.error('Failed to save campaign:', error);
        }
    };

    const handleSaveCertificate = async (data: { textColor: string; backgroundImage: string | null }) => {
        console.log('Saving certificate:', data);
        // API call to save certificate settings
    };

    const openDeleteConfirm = (campaign: Campaign) => {
        setCampaignToDelete(campaign);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteCampaign = async () => {
        if (!campaignToDelete) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignToDelete._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setToastMessage(language === 'th' ? 'ลบกิจกรรมสำเร็จ!' : 'Event deleted successfully!');
            loadCampaigns();
            setDeleteConfirmOpen(false);
            setCampaignToDelete(null);
        } catch (error) {
            console.error('Failed to delete campaign:', error);
            setToastMessage(language === 'th' ? 'เกิดข้อผิดพลาดในการลบ' : 'Failed to delete event');
        } finally {
            setDeleting(false);
        }
    };

    const featuredTargetCampaign = featuredTargetId
        ? campaigns.find(c => c._id === featuredTargetId)
        : null;
    const featuredIsCurrentlyOn = featuredTargetCampaign?.isFeatured ?? false;

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'จัดการอีเวนต์', labelEn: 'Manage Events' }
            ]}

        >
            <div className="admin-card">
                {/* Search */}
                <div className="events-table-toolbar">
                    <input
                        type="text"
                        className="events-search-input"
                        placeholder={language === 'th' ? 'ค้นหาชื่อกิจกรรม...' : 'Search event name...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="button" className="btn-query" onClick={() => loadCampaigns()}>
                        Q {language === 'th' ? 'ค้นหา' : 'Search'}
                    </button>
                    <button
                        className="btn-add-event"
                        onClick={() => router.push('/admin/events/create')}
                        title={language === 'th' ? 'สร้างกิจกรรมใหม่' : 'New event'}
                    >
                        <span>+</span>
                    </button>
                </div>

                {/* Events Table */}
                <div className="events-table-wrap">
                    {loading ? (
                        <div className="events-loading">
                            {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="events-empty">
                            {language === 'th' ? 'ยังไม่มีกิจกรรม' : 'No events yet'}
                        </div>
                    ) : (
                        <table className="data-table events-data-table">
                            <thead>
                                <tr>
                                    <th className="col-tools">{language === 'th' ? 'Tools' : 'Tools'}</th>
                                    <th className="col-id">ID</th>
                                    <th className="col-name">{language === 'th' ? 'ชื่อกิจกรรม' : 'Event Name'}</th>
                                    <th className="col-date">{language === 'th' ? 'วันที่' : 'Date'}</th>
                                    <th className="col-mode">{language === 'th' ? 'โหมด' : 'Mode'}</th>
                                    <th className="col-cert">{language === 'th' ? 'ใบเซอร์' : 'Certificate'}</th>
                                    <th className="col-rfid">RFID Sync</th>
                                    <th className="col-status">{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((campaign) => (
                                    <tr key={campaign._id}>
                                        <td className="col-tools">
                                            <div className="event-row-tools">
                                                <button
                                                    type="button"
                                                    className="event-tool-btn event-tool-edit"
                                                    onClick={() => router.push(`/admin/events/create?edit=${campaign._id}`)}
                                                    title={language === 'th' ? 'แก้ไขกิจกรรม' : 'Edit event'}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`event-tool-btn event-tool-trophy ${(campaign.isFeatured ?? false) ? 'gold' : ''}`}
                                                    onClick={() => openFeaturedConfirm(campaign._id)}
                                                    title={language === 'th' ? 'เปิดปิดสีถ้วยรางวัล (กิจกรรมที่เลือกจะแสดงบนหัวเว็บ)' : 'Toggle featured (shown in header)'}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                                                        <path d="M12 2L15 8.5L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L9 8.5L12 2Z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="event-tool-btn"
                                                    onClick={() => openRfidModal(campaign)}
                                                    title={language === 'th' ? 'ดูสถานะการเชื่อมต่อ RFID' : 'View RFID sync status'}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M2 12a10 10 0 0 1 20 0" />
                                                        <path d="M5 12a7 7 0 0 1 14 0" />
                                                        <path d="M8 12a4 4 0 0 1 8 0" />
                                                        <circle cx="12" cy="16" r="1" fill="currentColor" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                        <td className="col-id">{String(campaign._id).slice(-6)}</td>
                                        <td className="col-name">{campaign.name} {campaign.location ? campaign.location : ''}</td>
                                        <td className="col-date">{formatDate(campaign.eventDate)}</td>
                                        <td className="col-mode">
                                            <span className={`mode-badge ${campaign.isDraft ? 'test' : 'real'}`}>
                                                {campaign.isDraft ? 'TEST' : 'REAL'}
                                            </span>
                                        </td>
                                        <td className="col-cert">
                                            <label className="toggle-switch small">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.isApproveCertificate ?? false}
                                                    onChange={() => handleToggleCertificate(campaign._id)}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                        <td className="col-rfid">
                                            <label className="toggle-switch small">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.allowRFIDSync ?? false}
                                                    onChange={() => handleToggleSync(campaign._id, 'allowRFIDSync')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                        <td className="col-status">
                                            <label className="toggle-switch small">
                                                <input
                                                    type="checkbox"
                                                    checked={!campaign.isDraft}
                                                    onChange={() => handleToggleSync(campaign._id, 'isDraft')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Toast Notification */}
            {toastMessage && (
                <div className="toast-container">
                    <div className="toast toast-success">
                        <span className="toast-icon">✓</span>
                        <span className="toast-message">{toastMessage}</span>
                    </div>
                </div>
            )}

            {/* Modals */}
            <RFIDDashboardModal
                isOpen={rfidModalOpen}
                onClose={() => setRfidModalOpen(false)}
                eventId={selectedCampaign?._id || ''}
                eventName={selectedCampaign?.name || ''}
            />

            <CertificateFormModal
                isOpen={certificateModalOpen}
                onClose={() => setCertificateModalOpen(false)}
                eventId={selectedCampaign?._id || ''}
                eventName={selectedCampaign?.name || ''}
                onSave={handleSaveCertificate}
            />

            <EventDetailsModal
                isOpen={detailsModalOpen}
                onClose={() => setDetailsModalOpen(false)}
                event={selectedCampaign}
                onSave={handleSaveCampaignDetails}
            />

            {/* Featured Event Confirmation Modal */}
            {featuredConfirmOpen && (
                <div className="modal-overlay" onClick={closeFeaturedConfirm}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {language === 'th' ? 'ยืนยันการเปลี่ยน Event หลัก' : 'Confirm featured event'}
                            </h2>
                            <button className="modal-close" onClick={closeFeaturedConfirm}>×</button>
                        </div>
                        <div className="modal-body" style={{ textAlign: 'center', padding: '1.75rem' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⭐</div>
                            <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                {featuredIsCurrentlyOn
                                    ? (language === 'th'
                                        ? 'ต้องการยกเลิกการตั้งกิจกรรมนี้เป็น Event หลักหรือไม่?'
                                        : 'Remove this event from being the main event?')
                                    : (language === 'th'
                                        ? 'ต้องการตั้งกิจกรรมนี้เป็น Event หลักบนหัวเว็บหรือไม่?'
                                        : 'Set this event as the main event in the header?')}
                            </p>
                            {featuredTargetCampaign && (
                                <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                    <strong>{featuredTargetCampaign.name}</strong>
                                </p>
                            )}
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
                            <button
                                className="btn-secondary"
                                onClick={closeFeaturedConfirm}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleConfirmFeaturedChange}
                                style={{ background: '#00a65a', color: '#fff', padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                            >
                                {featuredIsCurrentlyOn
                                    ? (language === 'th' ? 'ยืนยันการยกเลิก' : 'Confirm remove')
                                    : (language === 'th' ? 'ยืนยันการตั้งค่า' : 'Confirm set')}
                            </button>
                        </div>
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
                            <button 
                                className="btn-secondary" 
                                onClick={() => setDeleteConfirmOpen(false)}
                                disabled={deleting}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button 
                                className="btn-danger"
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
