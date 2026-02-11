'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../../../AdminLayout';

interface EventData {
    _id: string;
    name: string;
    campaignId: string;
    category?: string;
    distance?: number;
    isAutoFix?: boolean;
    isFinished?: boolean;
}

interface CampaignData {
    _id: string;
    name: string;
    categories?: RaceCategory[];
}

interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
    status: string;
}

interface Checkpoint {
    _id: string;
    uuid: string;
    campaignId: string;
    name: string;
    type: string;
    orderNum: number;
    active?: boolean;
    description?: string;
}

interface CheckpointMapping {
    _id: string;
    checkpointId: string;
    eventId: string;
    distanceFromStart?: number;
    cutoffTime?: number;
    active?: boolean;
    orderNum?: number;
    scanInOut?: boolean;
}

export default function CategoriesPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const eventId = params.eventId as string;
    const { language } = useLanguage();
    const initialTabParam = searchParams.get('tab');
    const initialTab: 'events' | 'checkpoints' | 'addCheckpoints' =
        initialTabParam === 'checkpoints'
            ? 'checkpoints'
            : initialTabParam === 'addCheckpoints'
                ? 'addCheckpoints'
                : 'events';

    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [events, setEvents] = useState<EventData[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [checkpointMappings, setCheckpointMappings] = useState<CheckpointMapping[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'events' | 'checkpoints' | 'addCheckpoints'>(initialTab);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    // Checkpoint creation state
    const [selectedCampaignForCp, setSelectedCampaignForCp] = useState<string | null>(null);
    const [newCheckpoints, setNewCheckpoints] = useState<Array<{ name: string; type: string }>>([]);
    const [allCampaigns, setAllCampaigns] = useState<CampaignData[]>([]);
    const [cpSaving, setCpSaving] = useState(false);

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2500);
    }, []);

    useEffect(() => {
        loadData();
    }, [eventId]);

    const loadData = async () => {
        try {
            setLoading(true);
            // Load campaign data via API proxy
            const campaignRes = await fetch(`/api/campaigns/${eventId}`, { cache: 'no-store' });
            if (campaignRes.ok) {
                const campaignData = await campaignRes.json();
                setCampaign(campaignData);
            }

            // Load events for this campaign via API proxy
            const eventsRes = await fetch(`/api/events/by-campaign/${eventId}`, { cache: 'no-store' });
            if (eventsRes.ok) {
                const eventsData = await eventsRes.json();
                setEvents(Array.isArray(eventsData) ? eventsData : []);
            }

            // Load checkpoints for this campaign
            try {
                const cpRes = await fetch(`/api/checkpoints/campaign/${eventId}`, { cache: 'no-store' });
                if (cpRes.ok) {
                    const cpData = await cpRes.json();
                    setCheckpoints(Array.isArray(cpData) ? cpData : []);
                }
            } catch {
                setCheckpoints([]);
            }

            // Load all campaigns for checkpoint creation tab
            try {
                const allCampRes = await fetch('/api/campaigns', { cache: 'no-store' });
                if (allCampRes.ok) {
                    const allCampData = await allCampRes.json();
                    const campData = allCampData?.data || allCampData || [];
                    setAllCampaigns(Array.isArray(campData) ? campData : []);
                }
            } catch {
                setAllCampaigns([]);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load checkpoint mappings when switching to checkpoints tab
    useEffect(() => {
        if (activeTab === 'checkpoints' && events.length > 0) {
            loadMappings();
        }
    }, [activeTab, events]);

    const loadMappings = async () => {
        try {
            const mappingPromises = events.map(async ev => {
                try {
                    const res = await fetch(`/api/checkpoints/mapping/event/${ev._id}`, { cache: 'no-store' });
                    if (res.ok) return await res.json();
                    return [];
                } catch { return []; }
            });
            const results = await Promise.all(mappingPromises);
            const allMappings = results.flat();
            setCheckpointMappings(allMappings);
        } catch {
            setCheckpointMappings([]);
        }
    };

    // Toggle event auto-fix
    const handleToggleAutoFix = async (ev: EventData) => {
        const newVal = !ev.isAutoFix;
        setEvents(prev => prev.map(e => e._id === ev._id ? { ...e, isAutoFix: newVal } : e));
        try {
            const res = await fetch(`/api/events/${ev._id}/autofix`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isAutoFix: newVal }),
            });
            if (!res.ok) throw new Error('Failed');
        } catch (error) {
            console.error('Failed to toggle autofix:', error);
            setEvents(prev => prev.map(e => e._id === ev._id ? { ...e, isAutoFix: !newVal } : e));
        }
    };

    // Toggle event finished
    const handleToggleFinished = async (ev: EventData) => {
        const newVal = !ev.isFinished;
        setEvents(prev => prev.map(e => e._id === ev._id ? { ...e, isFinished: newVal } : e));
        try {
            const res = await fetch(`/api/events/${ev._id}/finished`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFinished: newVal }),
            });
            if (!res.ok) throw new Error('Failed');
        } catch (error) {
            console.error('Failed to toggle finished:', error);
            setEvents(prev => prev.map(e => e._id === ev._id ? { ...e, isFinished: !newVal } : e));
        }
    };

    // Drag and drop for events reordering
    const handleDragStart = (idx: number) => {
        setDraggedIdx(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === idx) return;
        const newEvents = [...events];
        const [dragged] = newEvents.splice(draggedIdx, 1);
        newEvents.splice(idx, 0, dragged);
        setEvents(newEvents);
        setDraggedIdx(idx);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
    };

    // Toggle checkpoint active status
    const handleToggleCheckpoint = async (cp: Checkpoint) => {
        const newActive = !cp.active;
        setCheckpoints(prev => prev.map(c => c._id === cp._id ? { ...c, active: newActive } : c));
        try {
            const res = await fetch(`/api/checkpoints/${cp._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: newActive }),
            });
            if (!res.ok) throw new Error('Failed');
        } catch (error) {
            console.error('Failed to toggle checkpoint:', error);
            setCheckpoints(prev => prev.map(c => c._id === cp._id ? { ...c, active: !newActive } : c));
        }
    };

    // Update checkpoint mapping
    const handleUpdateMapping = async (mappingId: string, field: string, value: number | boolean) => {
        setCheckpointMappings(prev => prev.map(m => m._id === mappingId ? { ...m, [field]: value } : m));
    };

    // Save checkpoint mappings
    const handleSaveMappings = async () => {
        try {
            const res = await fetch('/api/checkpoints/mapping/bulk', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkpointMappings),
            });
            if (!res.ok) throw new Error('Failed');
            showToast(language === 'th' ? 'บันทึกสำเร็จ!' : 'Saved successfully!');
        } catch (error) {
            console.error('Failed to save mappings:', error);
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error saving');
        }
    };

    // Checkpoint creation functions
    const addNewCheckpointRow = () => {
        setNewCheckpoints(prev => [...prev, { name: '', type: 'rfid' }]);
    };

    const updateNewCheckpoint = (idx: number, field: 'name' | 'type', value: string) => {
        setNewCheckpoints(prev => prev.map((cp, i) => i === idx ? { ...cp, [field]: value } : cp));
    };

    const removeNewCheckpoint = (idx: number) => {
        setNewCheckpoints(prev => prev.filter((_, i) => i !== idx));
    };

    const saveNewCheckpoints = async () => {
        const campaignId = selectedCampaignForCp || eventId;
        if (newCheckpoints.length === 0) return;

        setCpSaving(true);
        try {
            const checkpointsToCreate = newCheckpoints.map((cp, idx) => ({
                campaignId,
                name: cp.name,
                type: cp.type === 'rfid' ? 'checkpoint' : 'checkpoint',
                orderNum: idx + 1,
                active: true,
                description: cp.type // Store rfid/manual as description for reference
            }));

            const res = await fetch('/api/checkpoints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkpointsToCreate),
            });
            if (!res.ok) throw new Error('Failed to create');
            showToast(language === 'th' ? 'สร้างจุด Checkpoint สำเร็จ!' : 'Checkpoints created!');
            setNewCheckpoints([]);
            loadData(); // Reload data
        } catch (error) {
            console.error('Failed to create checkpoints:', error);
            showToast(language === 'th' ? 'เกิดข้อผิดพลาดในการสร้าง' : 'Failed to create');
        } finally {
            setCpSaving(false);
        }
    };

    const tabs = [
        { key: 'events' as const, label: language === 'th' ? 'จัดการอีเวนต์' : 'Manage Events' },
        { key: 'checkpoints' as const, label: language === 'th' ? 'จัดการจุด Checkpoint' : 'Manage Checkpoints' },
        { key: 'addCheckpoints' as const, label: language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoints' },
    ];

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                { label: campaign?.name || 'Categories', labelEn: campaign?.name || 'Categories' }
            ]}
            pageTitle={campaign ? `${language === 'th' ? 'อีเวนท์' : 'Event'}: ${campaign.name}` : ''}
            pageTitleEn={language === 'th' ? 'จัดการข้อมูลประเภทการแข่งขันและจุดเชคพ้อย' : 'Manage competition categories and checkpoints'}
        >
            <div className="admin-card">
                {/* Back Button */}
                <div className="categories-back">
                    <button onClick={() => router.back()} className="btn-back">
                        &lt; {language === 'th' ? 'ย้อนกลับ' : 'Back'}
                    </button>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e0e0e0', marginBottom: '20px' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                padding: '10px 20px',
                                border: 'none',
                                borderBottom: activeTab === tab.key ? '3px solid #0066cc' : '3px solid transparent',
                                background: activeTab === tab.key ? '#f0f7ff' : 'transparent',
                                color: activeTab === tab.key ? '#0066cc' : '#666',
                                fontWeight: activeTab === tab.key ? '600' : '400',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'all 0.2s ease',
                                marginBottom: '-2px'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="categories-loading">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : (
                    <>
                        {/* ===== TAB 1: Manage Events (Distances) ===== */}
                        {activeTab === 'events' && (
                            <div>
                                <div className="categories-header" style={{ marginBottom: '16px' }}>
                                    <h2 className="categories-title">
                                        {language === 'th' ? 'ประเภทระยะทางทั้งหมด' : 'All Distance Categories'} ({events.length})
                                    </h2>
                                    <p style={{ fontSize: '12px', color: '#999' }}>
                                        {language === 'th' ? '🔀 ลากเพื่อจัดลำดับ' : '🔀 Drag to reorder'}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {events.length === 0 ? (
                                        <div className="categories-empty">
                                            {language === 'th' ? 'ยังไม่มีประเภทระยะทาง' : 'No distance categories yet'}
                                        </div>
                                    ) : (
                                        events.map((ev, idx) => (
                                            <div
                                                key={ev._id}
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragEnd={handleDragEnd}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '16px',
                                                    padding: '16px',
                                                    border: draggedIdx === idx ? '2px dashed #0066cc' : '1px solid #e0e0e0',
                                                    borderRadius: '8px',
                                                    background: draggedIdx === idx ? '#f0f7ff' : '#fff',
                                                    cursor: 'grab',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {/* Drag Handle */}
                                                <div style={{ cursor: 'grab', color: '#ccc', fontSize: '18px', userSelect: 'none' }}>⋮⋮</div>

                                                {/* Distance Badge */}
                                                <div style={{
                                                    background: '#0066cc',
                                                    color: '#fff',
                                                    padding: '8px 16px',
                                                    borderRadius: '8px',
                                                    fontWeight: 'bold',
                                                    fontSize: '14px',
                                                    minWidth: '80px',
                                                    textAlign: 'center'
                                                }}>
                                                    {ev.distance || '-'} {ev.category || 'KM'}
                                                </div>

                                                {/* Event Info */}
                                                <div style={{ flex: 1 }}>
                                                    <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>{ev.name}</h3>
                                                </div>

                                                {/* Checkpoint Count */}
                                                <div style={{
                                                    padding: '4px 12px',
                                                    background: '#f3f4f6',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    color: '#666'
                                                }}>
                                                    Checkpoint: {checkpoints.length}
                                                </div>

                                                {/* Toggles */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                                                    <div className="toggle-group">
                                                        <span className="toggle-label">Auto-fix</span>
                                                        <label className="toggle-switch small">
                                                            <input
                                                                type="checkbox"
                                                                checked={ev.isAutoFix || false}
                                                                onChange={() => handleToggleAutoFix(ev)}
                                                            />
                                                            <span className="toggle-slider"></span>
                                                        </label>
                                                    </div>
                                                    <div className="toggle-group">
                                                        <span className="toggle-label">{language === 'th' ? 'จบงาน' : 'Finished'}</span>
                                                        <label className="toggle-switch small">
                                                            <input
                                                                type="checkbox"
                                                                checked={ev.isFinished || false}
                                                                onChange={() => handleToggleFinished(ev)}
                                                            />
                                                            <span className="toggle-slider"></span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ===== TAB 2: Manage Checkpoints ===== */}
                        {activeTab === 'checkpoints' && (
                            <div>
                                <div className="categories-header" style={{ marginBottom: '16px' }}>
                                    <h2 className="categories-title">
                                        {language === 'th' ? 'จัดการจุด Checkpoint' : 'Manage Checkpoints'} ({checkpoints.length})
                                    </h2>
                                </div>

                                {checkpoints.length === 0 ? (
                                    <div className="categories-empty">
                                        {language === 'th' ? 'ยังไม่มีจุด Checkpoint' : 'No checkpoints yet'}
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                                                        <th style={{ padding: '10px', textAlign: 'center', width: '50px', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'เลือก' : 'Select'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', width: '60px', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'ลำดับ' : 'Order'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'left', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'ชื่อจุด Checkpoint' : 'Checkpoint Name'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'ประเภท' : 'Type'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'ระยะทาง' : 'Distance'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'ภายในเวลา' : 'Cutoff Time'}
                                                        </th>
                                                        <th style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                                                            {language === 'th' ? 'สแกน In-Out' : 'Scan In-Out'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {checkpoints
                                                        .sort((a, b) => a.orderNum - b.orderNum)
                                                        .map((cp) => {
                                                            const mapping = checkpointMappings.find(m => m.checkpointId === cp._id);
                                                            return (
                                                                <tr key={cp._id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={cp.active !== false}
                                                                            onChange={() => handleToggleCheckpoint(cp)}
                                                                            style={{ width: '18px', height: '18px', accentColor: '#0066cc' }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600' }}>
                                                                        {cp.orderNum}
                                                                    </td>
                                                                    <td style={{ padding: '10px', fontWeight: '500' }}>
                                                                        {cp.name}
                                                                    </td>
                                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <span style={{
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '12px',
                                                                            background: cp.type === 'start' ? '#dcfce7' : cp.type === 'finish' ? '#dbeafe' : '#f3f4f6',
                                                                            color: cp.type === 'start' ? '#16a34a' : cp.type === 'finish' ? '#2563eb' : '#666'
                                                                        }}>
                                                                            {cp.type || 'rfid'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <input
                                                                            type="number"
                                                                            value={mapping?.distanceFromStart || ''}
                                                                            onChange={(e) => mapping && handleUpdateMapping(mapping._id, 'distanceFromStart', Number(e.target.value))}
                                                                            placeholder={language === 'th' ? 'กม.' : 'km'}
                                                                            style={{
                                                                                width: '70px',
                                                                                padding: '4px 8px',
                                                                                border: '1px solid #ddd',
                                                                                borderRadius: '4px',
                                                                                textAlign: 'center',
                                                                                fontSize: '13px'
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <input
                                                                            type="datetime-local"
                                                                            value={mapping?.cutoffTime ? new Date(mapping.cutoffTime).toISOString().slice(0, 16) : ''}
                                                                            onChange={(e) => mapping && handleUpdateMapping(mapping._id, 'cutoffTime', new Date(e.target.value).getTime())}
                                                                            placeholder={language === 'th' ? 'ภายในเวลา' : 'Cutoff'}
                                                                            style={{
                                                                                padding: '4px 8px',
                                                                                border: '1px solid #ddd',
                                                                                borderRadius: '4px',
                                                                                fontSize: '13px'
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                        <label className="toggle-switch small">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={mapping?.scanInOut || false}
                                                                                onChange={() => mapping && handleUpdateMapping(mapping._id, 'scanInOut', !mapping.scanInOut)}
                                                                            />
                                                                            <span className="toggle-slider"></span>
                                                                        </label>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                                            <button
                                                onClick={handleSaveMappings}
                                                style={{
                                                    padding: '8px 24px',
                                                    background: '#0066cc',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    fontSize: '14px'
                                                }}
                                            >
                                                {language === 'th' ? 'บันทึก' : 'Save'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ===== TAB 3: Add Checkpoints ===== */}
                        {activeTab === 'addCheckpoints' && (
                            <div>
                                {/* Campaign Selector */}
                                {!selectedCampaignForCp ? (
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                                            {language === 'th' ? 'เลือกกิจกรรม' : 'Select Campaign'}
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {/* Current campaign shortcut */}
                                            {campaign && (
                                                <button
                                                    onClick={() => setSelectedCampaignForCp(campaign._id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '16px',
                                                        border: '2px solid #0066cc',
                                                        borderRadius: '8px',
                                                        background: '#f0f7ff',
                                                        cursor: 'pointer',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '24px' }}>🏃</span>
                                                    <div>
                                                        <div style={{ fontWeight: '600', fontSize: '15px' }}>{campaign.name}</div>
                                                        <div style={{ fontSize: '12px', color: '#0066cc' }}>
                                                            {language === 'th' ? '(กิจกรรมปัจจุบัน)' : '(Current campaign)'}
                                                        </div>
                                                    </div>
                                                </button>
                                            )}
                                            {allCampaigns.filter(c => c._id !== campaign?._id).map(camp => (
                                                <button
                                                    key={camp._id}
                                                    onClick={() => setSelectedCampaignForCp(camp._id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '12px 16px',
                                                        border: '1px solid #e0e0e0',
                                                        borderRadius: '8px',
                                                        background: '#fff',
                                                        cursor: 'pointer',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '20px' }}>📋</span>
                                                    <div style={{ fontWeight: '500', fontSize: '14px' }}>{camp.name}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                            <button
                                                onClick={() => { setSelectedCampaignForCp(null); setNewCheckpoints([]); }}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: 'transparent',
                                                    border: '1px solid #ddd',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px'
                                                }}
                                            >
                                                ← {language === 'th' ? 'กลับ' : 'Back'}
                                            </button>
                                            <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
                                                {language === 'th' ? 'สร้างจุด Checkpoint' : 'Create Checkpoints'}
                                            </h3>
                                        </div>

                                        {/* Add Checkpoint Button */}
                                        <button
                                            onClick={addNewCheckpointRow}
                                            style={{
                                                width: '100%',
                                                padding: '12px',
                                                border: '2px dashed #ccc',
                                                borderRadius: '8px',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                color: '#666',
                                                marginBottom: '16px'
                                            }}
                                        >
                                            + {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoint'}
                                        </button>

                                        {/* Checkpoint List */}
                                        {newCheckpoints.length > 0 && (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr 50px', gap: '8px', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#666', textAlign: 'center' }}>
                                                        {language === 'th' ? 'ลำดับ' : 'Order'}
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                                                        {language === 'th' ? 'ชื่อจุด Checkpoint' : 'Checkpoint Name'}
                                                    </span>
                                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#666' }}>
                                                        {language === 'th' ? 'ประเภท' : 'Type'}
                                                    </span>
                                                    <span></span>
                                                </div>

                                                {newCheckpoints.map((cp, idx) => (
                                                    <div key={idx} style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '50px 1fr 1fr 50px',
                                                        gap: '8px',
                                                        marginBottom: '8px',
                                                        alignItems: 'center'
                                                    }}>
                                                        <span style={{ textAlign: 'center', fontWeight: '600', color: '#333' }}>{idx + 1}</span>
                                                        <input
                                                            type="text"
                                                            value={cp.name}
                                                            onChange={(e) => updateNewCheckpoint(idx, 'name', e.target.value)}
                                                            placeholder={idx === 0 ? 'Start' : `CP${idx}`}
                                                            style={{
                                                                padding: '8px 12px',
                                                                border: '1px solid #ddd',
                                                                borderRadius: '6px',
                                                                fontSize: '14px'
                                                            }}
                                                        />
                                                        <select
                                                            value={cp.type}
                                                            onChange={(e) => updateNewCheckpoint(idx, 'type', e.target.value)}
                                                            style={{
                                                                padding: '8px 12px',
                                                                border: '1px solid #ddd',
                                                                borderRadius: '6px',
                                                                fontSize: '14px',
                                                                background: '#fff'
                                                            }}
                                                        >
                                                            <option value="rfid">rfid</option>
                                                            <option value="manual">manual</option>
                                                        </select>
                                                        <button
                                                            onClick={() => removeNewCheckpoint(idx)}
                                                            style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                border: '1px solid #fca5a5',
                                                                borderRadius: '6px',
                                                                background: '#fef2f2',
                                                                color: '#dc2626',
                                                                cursor: 'pointer',
                                                                fontSize: '16px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                                    <button
                                                        onClick={saveNewCheckpoints}
                                                        disabled={cpSaving || newCheckpoints.some(cp => !cp.name)}
                                                        style={{
                                                            padding: '10px 32px',
                                                            background: cpSaving ? '#93c5fd' : '#0066cc',
                                                            color: '#fff',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            cursor: cpSaving ? 'not-allowed' : 'pointer',
                                                            fontWeight: '600',
                                                            fontSize: '14px'
                                                        }}
                                                    >
                                                        {cpSaving
                                                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                                            : (language === 'th' ? 'บันทึก' : 'Save')
                                                        }
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
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
        </AdminLayout>
    );
}
