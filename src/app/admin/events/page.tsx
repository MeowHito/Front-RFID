'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
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
    categories: RaceCategory[];
    organizerName?: string;
}

export default function EventsPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ทั้งหมด');
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

    useEffect(() => {
        loadCampaigns();
    }, []);

    const loadCampaigns = async () => {
        try {
            const res = await api.get('/campaigns');
            // API returns { data: Campaign[], total: number }
            const campaignData = res.data?.data || res.data || [];
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
            if (field === 'isDraft') {
                await api.put(`/campaigns/${campaignId}`, { isDraft: newValue });
            } else {
                await api.put(`/campaigns/${campaignId}`, { [field]: newValue });
            }
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
        
        // Cycle status: upcoming -> active -> live -> finished -> upcoming
        const statusOrder = ['upcoming', 'active', 'live', 'finished'];
        const currentIdx = statusOrder.indexOf(campaign.status || 'upcoming');
        const newStatus = statusOrder[(currentIdx + 1) % statusOrder.length];
        
        setCampaigns(prev => prev.map(c =>
            c._id === campaignId ? { ...c, status: newStatus } : c
        ));

        try {
            await api.put(`/campaigns/${campaignId}/status`, { status: newStatus });
        } catch (error) {
            console.error('Failed to update status:', error);
            setCampaigns(prev => prev.map(c =>
                c._id === campaignId ? { ...c, status: campaign.status } : c
            ));
        }
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
                // Create new campaign
                await api.post('/campaigns', data);
            } else if (data._id) {
                // Update existing campaign
                await api.put(`/campaigns/${data._id}`, data);
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
            await api.delete(`/campaigns/${campaignToDelete._id}`);
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

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'อีเวนท์', labelEn: 'Events' }
            ]}
            pageTitle={language === 'th' ? 'จัดการข้อมูลอีเวนท์และประเภทการแข่งขันของคุณ' : 'Manage your events and competition categories'}
        >
            <div className="admin-card">
                {/* Header */}
                <div className="events-header">
                    <h2 className="events-title">
                        {language === 'th' ? 'กิจกรรมทั้งหมด' : 'All Events'} ( {campaigns.length} )
                    </h2>
                    <div className="events-toolbar">
                        <select
                            className="admin-form-select"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{ width: '200px' }}
                        >
                            <option value="ทั้งหมด">{language === 'th' ? 'ทั้งหมด' : 'All'}</option>
                            <option value="active">{language === 'th' ? 'เปิดใช้งาน' : 'Active'}</option>
                            <option value="inactive">{language === 'th' ? 'ปิดใช้งาน' : 'Inactive'}</option>
                        </select>
                        <button className="btn-add-event" onClick={() => openDetailsModal(null, true)}>
                            <span>+</span>
                        </button>
                    </div>
                </div>

                {/* Action Icons Legend */}
                <div className="events-action-bar">
                    <div className="action-icon-group">
                        <button className="action-icon-btn" title={language === 'th' ? 'แดชบอร์ด RFID' : 'RFID Dashboard'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                        </button>
                        <button className="action-icon-btn" title={language === 'th' ? 'คัดลอกลิงก์ ChipCode' : 'Copy ChipCode Link'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                        </button>
                        <button className="action-icon-btn" title={language === 'th' ? 'คัดลอกลิงก์ Realtime' : 'Copy Realtime Link'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                        </button>
                        <button className="action-icon-btn" title={language === 'th' ? 'แบบฟอร์มใบรับรอง' : 'Certificate Form'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                        </button>
                        <span className="action-icon-label">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            6 {language === 'th' ? 'ระยะ/ประเภท' : 'Categories'}
                        </span>
                        <button className="action-icon-btn" title={language === 'th' ? 'ดูรายละเอียด' : 'View Details'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                        </button>
                        <button className="action-icon-btn edit" title={language === 'th' ? 'แก้ไข' : 'Edit'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Events List */}
                <div className="events-list">
                    {loading ? (
                        <div className="events-loading">
                            {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="events-empty">
                            {language === 'th' ? 'ยังไม่มีกิจกรรม' : 'No events yet'}
                        </div>
                    ) : (
                        campaigns.map((campaign) => (
                            <div key={campaign._id} className="event-card">
                                {/* Event Image */}
                                <div className="event-image">
                                    {campaign.pictureUrl ? (
                                        <img src={campaign.pictureUrl} alt={campaign.name} />
                                    ) : (
                                        <div className="event-image-placeholder">
                                            <span>🏃</span>
                                        </div>
                                    )}
                                </div>

                                {/* Event Info */}
                                <div className="event-info">
                                    <h3 className="event-name">{campaign.name}</h3>
                                    <div className="event-meta">
                                        <span className="event-date">
                                            <strong>{language === 'th' ? 'วันที่จัด' : 'Date'}:</strong> {formatDate(campaign.eventDate)}
                                        </span>
                                    </div>
                                    <div className="event-meta">
                                        <span className="event-location">
                                            <strong>{language === 'th' ? 'สถานที่จัด' : 'Location'}:</strong> {campaign.location || '-'}
                                        </span>
                                    </div>
                                    {campaign.categories && campaign.categories.length > 0 && (
                                        <div className="event-categories">
                                            {campaign.categories.map((cat: RaceCategory, idx: number) => (
                                                <span key={idx} className="event-category-tag" style={{ backgroundColor: cat.badgeColor, color: '#fff' }}>{cat.name}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="event-sync-info">
                                        <span className="sync-date">⏱️ {formatDate(new Date().toISOString())}</span>
                                        <span className={`sync-status ${campaign.allowRFIDSync ? 'active' : ''}`}>
                                            {campaign.allowRFIDSync ? '✓' : '○'} {language === 'th' ? 'ซิงค์ข้อมูล RFID' : 'Sync RFID'}
                                        </span>
                                    </div>
                                </div>

                                {/* Event Actions - Right Side */}
                                <div className="event-actions">
                                    {/* Toggles */}
                                    <div className="event-toggles">
                                        <div className="toggle-group">
                                            <span className="toggle-label">{language === 'th' ? 'ซิงค์ RFID' : 'RFID Sync'}</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={campaign.allowRFIDSync || false}
                                                    onChange={() => handleToggleSync(campaign._id, 'allowRFIDSync')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div className="toggle-group">
                                            <span className="toggle-label">{language === 'th' ? 'เผยแพร่' : 'Published'}</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={!campaign.isDraft}
                                                    onChange={() => handleToggleSync(campaign._id, 'isDraft')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Action Icons Row */}
                                    <div className="event-action-icons">
                                        <button
                                            className="action-icon-btn"
                                            onClick={() => openRfidModal(campaign)}
                                            data-tooltip={language === 'th' ? 'แดชบอร์ด RFID' : 'RFID Dashboard'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                            </svg>
                                        </button>
                                        <button
                                            className={`action-icon-btn ${copiedLink === `chip-${campaign._id}` ? 'copied' : ''}`}
                                            onClick={() => copyToClipboard(getChipCodeLink(campaign._id), `chip-${campaign._id}`, 'chipcode')}
                                            data-tooltip={language === 'th' ? 'คัดลอก ChipCode' : 'Copy ChipCode'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                        </button>
                                        <button
                                            className={`action-icon-btn ${copiedLink === `rt-${campaign._id}` ? 'copied' : ''}`}
                                            onClick={() => copyToClipboard(getRealtimeLink(campaign._id), `rt-${campaign._id}`, 'realtime')}
                                            data-tooltip={language === 'th' ? 'คัดลอก Realtime' : 'Copy Realtime'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <polyline points="12 6 12 12 16 14" />
                                            </svg>
                                        </button>
                                        <button
                                            className="action-icon-btn"
                                            onClick={() => openCertificateModal(campaign)}
                                            data-tooltip={language === 'th' ? 'ใบรับรอง' : 'Certificate'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                            </svg>
                                        </button>
                                        <button
                                            className="action-category-count"
                                            onClick={() => openDetailsModal(campaign)}
                                            data-tooltip={language === 'th' ? 'ดูประเภทการแข่งขัน' : 'View Categories'}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                            {campaign.categories?.length || 0} {language === 'th' ? 'ระยะ/ประเภท' : 'Cat'}
                                        </button>
                                        <button
                                            className="action-icon-btn"
                                            onClick={() => openDetailsModal(campaign)}
                                            data-tooltip={language === 'th' ? 'ดูรายละเอียด' : 'View Details'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="16" x2="12" y2="12" />
                                                <line x1="12" y1="8" x2="12.01" y2="8" />
                                            </svg>
                                        </button>
                                        <button
                                            className="action-icon-btn edit"
                                            onClick={() => openDetailsModal(campaign)}
                                            data-tooltip={language === 'th' ? 'แก้ไข' : 'Edit'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                        <button
                                            className="action-icon-btn delete"
                                            onClick={() => openDeleteConfirm(campaign)}
                                            data-tooltip={language === 'th' ? 'ลบ' : 'Delete'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Status */}
                                    <div className="event-status-row">
                                        <span className="status-label">{language === 'th' ? 'สถานะ' : 'Status'}</span>
                                        <span className={`status-badge ${campaign.status || 'draft'}`}>
                                            {campaign.status || 'draft'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
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
