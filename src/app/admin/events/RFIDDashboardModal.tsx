'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import '../admin.css';

interface RFIDDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventId: string;
    eventName: string;
}

interface RFIDStatus {
    status: 'Running' | 'Stopped';
    healthy: boolean;
    totalDataSize: string;
    lastCompletedTime: string;
    lastErrorTime: string;
    errors: string[];
    statistics: {
        total: number;
        success: number;
        error: number;
    };
    latestPreview: any | null;
}

type PreviewType = 'info' | 'bio' | 'split';

interface SyncRequirements {
    allowRFIDSync: boolean;
    hasToken: boolean;
    hasRaceId: boolean;
    eventCount: number;
    mappedEventCount: number;
}

export default function RFIDDashboardModal({ isOpen, onClose, eventId, eventName }: RFIDDashboardModalProps) {
    const { language } = useLanguage();
    const [rfidStatus, setRfidStatus] = useState<RFIDStatus>({
        status: 'Stopped',
        healthy: true,
        totalDataSize: '-',
        lastCompletedTime: '-',
        lastErrorTime: '-',
        errors: [],
        statistics: {
            total: 0,
            success: 0,
            error: 0,
        },
        latestPreview: null,
    });
    const [loading, setLoading] = useState(false);
    const [runningPreview, setRunningPreview] = useState<PreviewType | null>(null);
    const [runningFullSync, setRunningFullSync] = useState(false);
    const [requirementsLoading, setRequirementsLoading] = useState(false);
    const [syncRequirements, setSyncRequirements] = useState<SyncRequirements>({
        allowRFIDSync: false,
        hasToken: false,
        hasRaceId: false,
        eventCount: 0,
        mappedEventCount: 0,
    });
    const [showAllErrors, setShowAllErrors] = useState(false);

    const toApiData = (json: any) => json?.data ?? json;

    const formatDate = (value?: string | Date) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    useEffect(() => {
        if (isOpen) {
            loadRFIDStatus();
            loadSyncRequirements();
        }
    }, [isOpen, eventId]);

    const hasCredentials = syncRequirements.hasToken && syncRequirements.hasRaceId;
    const hasEventMapping = syncRequirements.eventCount === 1 || syncRequirements.mappedEventCount > 0;

    const getBlockedReason = (target: 'preview' | 'full-sync'): string | null => {
        if (!syncRequirements.allowRFIDSync) {
            return language === 'th'
                ? 'กรุณาเปิดใช้งาน RFID Sync สำหรับกิจกรรมนี้ก่อน'
                : 'Please enable RFID Sync for this campaign first';
        }
        if (!hasCredentials) {
            return language === 'th'
                ? 'กรุณาใส่ RFID Token และ Race ID ในหน้าแก้ไขกิจกรรมก่อน'
                : 'Please set RFID Token and Race ID in campaign edit page first';
        }
        if (target === 'full-sync' && syncRequirements.eventCount === 0) {
            return language === 'th'
                ? 'ยังไม่มี Event ในกิจกรรมนี้ (ต้องสร้าง Event อย่างน้อย 1 รายการก่อน Sync All Runners)'
                : 'This campaign has no events yet (create at least 1 event before Sync All Runners)';
        }
        if (target === 'full-sync' && !hasEventMapping) {
            return language === 'th'
                ? 'ไม่พบ RFID Event ID ที่แมปกับ Event (กรุณาตั้งค่า RFID Event ID ใน Event ก่อน)'
                : 'No RFID Event ID mapping found (please set RFID Event ID on events first)';
        }
        return null;
    };

    const loadSyncRequirements = async () => {
        setRequirementsLoading(true);
        try {
            const [campaignRes, eventsRes] = await Promise.all([
                fetch(`/api/campaigns/${eventId}`, { cache: 'no-store' }),
                fetch(`/api/events/by-campaign/${eventId}`, { cache: 'no-store' }),
            ]);

            const campaignPayload = campaignRes.ok ? await campaignRes.json().catch(() => ({})) : {};
            const eventsPayload = eventsRes.ok ? await eventsRes.json().catch(() => ([])) : [];

            const campaign = (campaignPayload as any)?.data ?? campaignPayload ?? {};
            const eventsSource = (eventsPayload as any)?.data ?? eventsPayload ?? [];
            const events = Array.isArray(eventsSource) ? eventsSource : [];

            const mappedEventCount = events.filter((event: any) => {
                const value = event?.rfidEventId;
                if (value === null || value === undefined) return false;
                if (typeof value === 'number') return Number.isFinite(value);
                if (typeof value === 'string') return value.trim() !== '';
                return false;
            }).length;

            setSyncRequirements({
                allowRFIDSync: Boolean(campaign?.allowRFIDSync),
                hasToken: Boolean(typeof campaign?.rfidToken === 'string' && campaign.rfidToken.trim()),
                hasRaceId: Boolean(typeof campaign?.raceId === 'string' && campaign.raceId.trim()),
                eventCount: events.length,
                mappedEventCount,
            });
        } catch (error) {
            console.warn('Failed to load sync requirements:', error);
            setSyncRequirements({
                allowRFIDSync: false,
                hasToken: false,
                hasRaceId: false,
                eventCount: 0,
                mappedEventCount: 0,
            });
        } finally {
            setRequirementsLoading(false);
        }
    };

    const loadRFIDStatus = async () => {
        setLoading(true);
        try {
            const [syncRes, latestPayloadRes] = await Promise.all([
                fetch(`/api/sync/data?id=${eventId}`, { cache: 'no-store' }),
                fetch(`/api/sync/last-payload?id=${eventId}`, { cache: 'no-store' }),
            ]);

            if (!syncRes.ok) {
                throw new Error('Failed to load sync data');
            }

            const syncJson = await syncRes.json();
            const syncData = toApiData(syncJson);
            const logs = Array.isArray(syncData?.recentLogs) ? syncData.recentLogs : [];

            let latestPayloadData: any = null;
            if (latestPayloadRes.ok) {
                const payloadJson = await latestPayloadRes.json();
                latestPayloadData = toApiData(payloadJson);
            }

            const latestSuccess = logs.find((log: any) => log.status === 'success');
            const latestError = logs.find((log: any) => log.status === 'error');
            const errors = logs
                .filter((log: any) => log.status === 'error' && typeof log.message === 'string')
                .map((log: any) => log.message);

            setRfidStatus({
                status: runningPreview || runningFullSync ? 'Running' : 'Stopped',
                healthy: (syncData?.statistics?.error || 0) === 0,
                totalDataSize: `${syncData?.statistics?.total || 0} logs`,
                lastCompletedTime: formatDate(latestSuccess?.createdAt),
                lastErrorTime: formatDate(latestError?.createdAt),
                errors,
                statistics: {
                    total: syncData?.statistics?.total || 0,
                    success: syncData?.statistics?.success || 0,
                    error: syncData?.statistics?.error || 0,
                },
                latestPreview: latestPayloadData?.preview || null,
            });
        } catch (error) {
            console.error('Failed to load RFID status:', error);
            setRfidStatus(prev => ({
                ...prev,
                errors: [language === 'th' ? 'โหลดข้อมูลซิงค์ไม่สำเร็จ' : 'Failed to load sync data'],
            }));
        } finally {
            setLoading(false);
        }
    };

    const runFullSync = async () => {
        const blockedReason = getBlockedReason('full-sync');
        if (blockedReason) {
            setRfidStatus(prev => ({
                ...prev,
                errors: [blockedReason, ...prev.errors],
            }));
            return;
        }

        setRunningFullSync(true);
        try {
            const res = await fetch(`/api/sync/full-sync?id=${eventId}`, {
                method: 'POST',
                cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                const message = json?.error || json?.message || 'Full sync failed';
                throw new Error(message);
            }

            const syncData = toApiData(json);
            const summary = syncData?.summary || {};
            const summaryMessage = language === 'th'
                ? `ซิงค์ทั้งหมดสำเร็จ: หน้า ${summary.pagesFetched || 0}, ดึง ${summary.rowsFetched || 0}, เพิ่ม ${summary.inserted || 0}, อัปเดต ${summary.updated || 0}`
                : `Full sync completed: pages ${summary.pagesFetched || 0}, fetched ${summary.rowsFetched || 0}, inserted ${summary.inserted || 0}, updated ${summary.updated || 0}`;

            setRfidStatus(prev => ({
                ...prev,
                errors: [summaryMessage, ...prev.errors],
            }));

            await loadRFIDStatus();
        } catch (error: any) {
            console.warn('Failed to run full sync:', error);
            setRfidStatus(prev => ({
                ...prev,
                errors: [
                    `${language === 'th' ? 'ซิงค์ทั้งหมดล้มเหลว' : 'Full sync failed'}: ${error?.message || 'unknown error'}`,
                    ...prev.errors,
                ],
            }));
        } finally {
            setRunningFullSync(false);
        }
    };

    const runPreview = async (type: PreviewType) => {
        const blockedReason = getBlockedReason('preview');
        if (blockedReason) {
            setRfidStatus(prev => ({
                ...prev,
                errors: [blockedReason, ...prev.errors],
            }));
            return;
        }

        setRunningPreview(type);
        try {
            const res = await fetch(`/api/sync/preview?id=${eventId}&type=${type}&page=1`, {
                cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                const message = json?.error || json?.message || 'Preview failed';
                throw new Error(message);
            }

            const previewData = toApiData(json);
            setRfidStatus(prev => ({
                ...prev,
                latestPreview: previewData,
            }));

            await loadRFIDStatus();
        } catch (error: any) {
            console.warn('Failed to run preview:', error);
            setRfidStatus(prev => ({
                ...prev,
                errors: [
                    `${type.toUpperCase()} ${language === 'th' ? 'ล้มเหลว' : 'failed'}: ${error?.message || 'unknown error'}`,
                    ...prev.errors,
                ],
            }));
        } finally {
            setRunningPreview(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content rfid-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">
                        {language === 'th' ? 'แดชบอร์ดการการเชื่อมต่อ RFID' : 'RFID Connection Dashboard'}
                    </h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {/* Body */}
                <div className="modal-body">
                    {loading ? (
                        <div className="modal-loading">
                            {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                        </div>
                    ) : (
                        <>
                            {/* Status Row */}
                            <div className="rfid-row">
                                <span className="rfid-label">Status:</span>
                                <span className="rfid-value">
                                    {rfidStatus.status}
                                    <span className={`rfid-health ${rfidStatus.healthy ? 'healthy' : 'unhealthy'}`}>
                                        ({rfidStatus.healthy ? 'Healthy' : 'Unhealthy'})
                                    </span>
                                </span>
                            </div>

                            {/* Total Data Size */}
                            <div className="rfid-row">
                                <span className="rfid-label">Total Data Size:</span>
                                <span className="rfid-value">{rfidStatus.totalDataSize}</span>
                            </div>

                            <div className="rfid-row">
                                <span className="rfid-label">Logs (S/E):</span>
                                <span className="rfid-value">
                                    {rfidStatus.statistics.success}/{rfidStatus.statistics.error}
                                    <span style={{ color: '#999', marginLeft: 8 }}>
                                        (Total {rfidStatus.statistics.total})
                                    </span>
                                </span>
                            </div>

                            {/* Last Completed Time */}
                            <div className="rfid-row">
                                <span className="rfid-label">Last Completed Time:</span>
                                <span className="rfid-value">{rfidStatus.lastCompletedTime}</span>
                            </div>

                            {/* Last Error Time */}
                            <div className="rfid-row">
                                <span className="rfid-label">Last Error Time:</span>
                                <span className="rfid-value">{rfidStatus.lastErrorTime}</span>
                            </div>

                            {/* Manual Preview Buttons */}
                            <div className="rfid-errors-section" style={{ marginTop: 12 }}>
                                <h4 className="rfid-errors-title">
                                    {language === 'th' ? 'ทดสอบดึงข้อมูลจากเว็บจีน' : 'Test pull from RaceTiger'}
                                </h4>
                                {(getBlockedReason('preview') || getBlockedReason('full-sync')) && (
                                    <div className="rfid-error-item" style={{ borderLeft: '3px solid #f59e0b' }}>
                                        {getBlockedReason('full-sync') || getBlockedReason('preview')}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        className="btn-primary"
                                        onClick={() => runPreview('info')}
                                        disabled={requirementsLoading || !!runningPreview || runningFullSync || !!getBlockedReason('preview')}
                                    >
                                        {runningPreview === 'info' ? '...' : 'Preview INFO'}
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={() => runPreview('bio')}
                                        disabled={requirementsLoading || !!runningPreview || runningFullSync || !!getBlockedReason('preview')}
                                    >
                                        {runningPreview === 'bio' ? '...' : 'Preview BIO'}
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={() => runPreview('split')}
                                        disabled={requirementsLoading || !!runningPreview || runningFullSync || !!getBlockedReason('preview')}
                                    >
                                        {runningPreview === 'split' ? '...' : 'Preview SPLIT'}
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={runFullSync}
                                        disabled={requirementsLoading || !!runningPreview || runningFullSync || !!getBlockedReason('full-sync')}
                                    >
                                        {runningFullSync
                                            ? (language === 'th' ? 'กำลังซิงค์...' : 'Syncing...')
                                            : (language === 'th' ? 'Sync All Runners' : 'Sync All Runners')}
                                    </button>
                                </div>
                            </div>

                            {/* Latest Payload Preview */}
                            {rfidStatus.latestPreview && (
                                <div className="rfid-errors-section" style={{ marginTop: 12 }}>
                                    <h4 className="rfid-errors-title">
                                        {language === 'th' ? 'Payload ล่าสุดจากเว็บจีน' : 'Latest payload from RaceTiger'}
                                    </h4>
                                    <div className="rfid-error-item">
                                        <strong>Endpoint:</strong> {rfidStatus.latestPreview?.request?.endpoint || '-'}
                                    </div>
                                    <div className="rfid-error-item">
                                        <strong>HTTP:</strong> {rfidStatus.latestPreview?.response?.httpStatus || '-'}
                                        {' | '}
                                        <strong>Items:</strong> {rfidStatus.latestPreview?.response?.itemCount ?? 0}
                                    </div>
                                    <div className="rfid-error-item">
                                        <strong>Fetched:</strong> {formatDate(rfidStatus.latestPreview?.fetchedAt)}
                                    </div>
                                    <div className="rfid-error-item" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                        <strong>Sample:</strong>
                                        <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
{JSON.stringify(rfidStatus.latestPreview?.response?.payloadSample || null, null, 2)}
                                        </pre>
                                    </div>
                                    <div className="rfid-error-item" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                        <strong>Raw Snippet:</strong>
                                        <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
{rfidStatus.latestPreview?.response?.rawSnippet || '-'}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Error Details */}
                            <div className="rfid-errors-section">
                                <h4 className="rfid-errors-title">Error Details:</h4>
                                <div className="rfid-errors-list">
                                    {rfidStatus.errors.slice(0, showAllErrors ? undefined : 2).map((error, idx) => (
                                        <div key={idx} className="rfid-error-item">
                                            {error}
                                        </div>
                                    ))}
                                </div>
                                {rfidStatus.errors.length > 2 && (
                                    <button
                                        className="rfid-show-more"
                                        onClick={() => setShowAllErrors(!showAllErrors)}
                                    >
                                        {showAllErrors
                                            ? (language === 'th' ? 'แสดงน้อยลง' : 'Show less')
                                            : (language === 'th' ? 'แสดงเพิ่มเติม' : 'Show more')
                                        }
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn-primary" onClick={onClose}>
                        {language === 'th' ? 'ปิด' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
