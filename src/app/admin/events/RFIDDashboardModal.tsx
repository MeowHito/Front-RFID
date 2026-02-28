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

interface SyncLogEntry {
    _id: string;
    status: string;
    message: string;
    recordsProcessed?: number;
    recordsFailed?: number;
    startTime?: string;
    endTime?: string;
    createdAt?: string;
    errorDetails?: Record<string, any>;
}

interface RFIDStatus {
    status: 'Running' | 'Stopped';
    healthy: boolean;
    totalDataSize: string;
    lastCompletedTime: string;
    lastErrorTime: string;
    errors: string[];
    recentLogs: SyncLogEntry[];
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
    categoryMappedCount: number;
}

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
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
        recentLogs: [],
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
    const [runningImportEvents, setRunningImportEvents] = useState(false);
    const [requirementsLoading, setRequirementsLoading] = useState(false);
    const [syncRequirements, setSyncRequirements] = useState<SyncRequirements>({
        allowRFIDSync: false,
        hasToken: false,
        hasRaceId: false,
        eventCount: 0,
        mappedEventCount: 0,
        categoryMappedCount: 0,
    });
    const [showAllErrors, setShowAllErrors] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (type: Toast['type'], message: string) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
    };

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
    const hasEventMapping =
        syncRequirements.eventCount >= 1;

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
                ? 'ยังไม่มี Event — กด "Import Events from RaceTiger" เพื่อสร้างอัตโนมัติ'
                : 'No events yet — click "Import Events from RaceTiger" to create them automatically';
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
            const categories = Array.isArray(campaign?.categories) ? campaign.categories : [];

            const mappedEventCount = events.filter((event: any) => {
                const value = event?.rfidEventId;
                if (value === null || value === undefined) return false;
                if (typeof value === 'number') return Number.isFinite(value);
                if (typeof value === 'string') return value.trim() !== '';
                return false;
            }).length;

            const categoryMappedCount = categories.filter((category: any) => {
                const value = category?.remoteEventNo;
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
                categoryMappedCount,
            });
        } catch (error) {
            console.warn('Failed to load sync requirements:', error);
            setSyncRequirements({
                allowRFIDSync: false,
                hasToken: false,
                hasRaceId: false,
                eventCount: 0,
                mappedEventCount: 0,
                categoryMappedCount: 0,
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
                recentLogs: logs,
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

    const importEventsFromRaceTiger = async () => {
        if (!syncRequirements.allowRFIDSync || !syncRequirements.hasToken || !syncRequirements.hasRaceId) {
            setRfidStatus(prev => ({
                ...prev,
                errors: [
                    language === 'th'
                        ? 'กรุณาเปิดใช้งาน RFID Sync และใส่ Token/Race ID ก่อน'
                        : 'Please enable RFID Sync and set Token/Race ID first',
                    ...prev.errors,
                ],
            }));
            return;
        }

        setRunningImportEvents(true);
        try {
            const res = await fetch(`/api/sync/import-events?id=${eventId}`, {
                method: 'POST',
                cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                const message = json?.error || json?.message || 'Import events failed';
                throw new Error(message);
            }

            const result = (json?.data ?? json) as any;
            const evImported = result?.imported ?? 0;
            const evUpdated = result?.updated ?? 0;
            const runInserted = result?.runners?.inserted ?? 0;
            const runUpdated = result?.runners?.updated ?? 0;
            const cpCreated = result?.checkpoints?.created ?? 0;
            const scoreUpdated = result?.score?.updated ?? 0;
            const scoreStatusChanges = result?.score?.statusChanges ?? 0;

            const cpNames: string[] = result?.checkpoints?.names ?? [];
            const cpNamesStr = cpNames.length ? ` (${cpNames.join(', ')})` : '';
            const debugInfo = result?.debug ? `\n🔍 Debug: ${JSON.stringify(result.debug).substring(0, 200)}` : '';
            const summaryMessage = language === 'th'
                ? `✅ Import สำเร็จ!\n📁 Events: สร้าง ${evImported}, อัปเดต ${evUpdated}\n🏃 Runners: เพิ่ม ${runInserted}, อัปเดต ${runUpdated}\n📍 Checkpoints: สร้าง ${cpCreated}${cpNamesStr}\n⏱️ Timing: อัปเดต ${scoreUpdated}, สถานะ ${scoreStatusChanges}${debugInfo}`
                : `✅ Import completed!\n📁 Events: created ${evImported}, updated ${evUpdated}\n🏃 Runners: inserted ${runInserted}, updated ${runUpdated}\n📍 Checkpoints: created ${cpCreated}${cpNamesStr}\n⏱️ Timing: ${scoreUpdated} updates, ${scoreStatusChanges} status changes${debugInfo}`;

            showToast('success', summaryMessage);
            setRfidStatus(prev => ({
                ...prev,
                errors: [summaryMessage, ...prev.errors],
            }));

            await loadSyncRequirements();
            await loadRFIDStatus();
        } catch (error: any) {
            const errMsg = `${language === 'th' ? '❌ Import Events ล้มเหลว' : '❌ Import Events failed'}: ${error?.message || 'unknown error'}`;
            showToast('error', errMsg);
            setRfidStatus(prev => ({
                ...prev,
                errors: [errMsg, ...prev.errors],
            }));
        } finally {
            setRunningImportEvents(false);
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
                ? `✅ ซิงค์สำเร็จ! หน้า ${summary.pagesFetched || 0}, ดึง ${summary.rowsFetched || 0} แถว, เพิ่ม ${summary.inserted || 0}, อัปเดต ${summary.updated || 0} runners`
                : `✅ Full sync completed! Pages ${summary.pagesFetched || 0}, fetched ${summary.rowsFetched || 0} rows, inserted ${summary.inserted || 0}, updated ${summary.updated || 0} runners`;

            showToast('success', summaryMessage);
            setRfidStatus(prev => ({
                ...prev,
                errors: [summaryMessage, ...prev.errors],
            }));

            await loadRFIDStatus();
        } catch (error: any) {
            console.warn('Failed to run full sync:', error);
            const errMsg = `${language === 'th' ? '❌ ซิงค์ล้มเหลว' : '❌ Full sync failed'}: ${error?.message || 'unknown error'}`;
            showToast('error', errMsg);
            setRfidStatus(prev => ({
                ...prev,
                errors: [errMsg, ...prev.errors],
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
            const itemCount = previewData?.response?.itemCount ?? 0;
            showToast('info', language === 'th'
                ? `✅ Preview ${type.toUpperCase()} สำเร็จ — พบ ${itemCount} รายการ`
                : `✅ Preview ${type.toUpperCase()} success — ${itemCount} items found`);
            setRfidStatus(prev => ({
                ...prev,
                latestPreview: previewData,
            }));

            await loadRFIDStatus();
        } catch (error: any) {
            console.warn('Failed to run preview:', error);
            const errMsg = `❌ Preview ${type.toUpperCase()} ${language === 'th' ? 'ล้มเหลว' : 'failed'}: ${error?.message || 'unknown error'}`;
            showToast('error', errMsg);
            setRfidStatus(prev => ({
                ...prev,
                errors: [errMsg, ...prev.errors],
            }));
        } finally {
            setRunningPreview(null);
        }
    };

    if (!isOpen) return null;

    const toastColors: Record<Toast['type'], string> = {
        success: '#16a34a',
        error: '#dc2626',
        info: '#2563eb',
    };

    return (
        <>
            {/* Toast container */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        style={{
                            background: toastColors[toast.type],
                            color: '#fff',
                            padding: '12px 16px',
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                            fontSize: '0.82rem',
                            whiteSpace: 'pre-line',
                            lineHeight: 1.5,
                            cursor: 'pointer',
                            animation: 'slideIn 0.2s ease',
                        }}
                        onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
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
                                            style={{ background: '#8e44ad' }}
                                            onClick={importEventsFromRaceTiger}
                                            disabled={requirementsLoading || runningImportEvents || !!runningPreview || runningFullSync || !syncRequirements.allowRFIDSync || !syncRequirements.hasToken || !syncRequirements.hasRaceId}
                                        >
                                            {runningImportEvents
                                                ? (language === 'th' ? 'กำลัง Import...' : 'Importing...')
                                                : (language === 'th' ? 'Import Events จากเว็บจีน' : 'Import Events from RaceTiger')}
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={() => runPreview('info')}
                                            disabled={requirementsLoading || !!runningPreview || runningFullSync || runningImportEvents || !!getBlockedReason('preview')}
                                        >
                                            {runningPreview === 'info' ? '...' : 'Preview INFO'}
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={() => runPreview('bio')}
                                            disabled={requirementsLoading || !!runningPreview || runningFullSync || runningImportEvents || !!getBlockedReason('preview')}
                                        >
                                            {runningPreview === 'bio' ? '...' : 'Preview BIO'}
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={() => runPreview('split')}
                                            disabled={requirementsLoading || !!runningPreview || runningFullSync || runningImportEvents || !!getBlockedReason('preview')}
                                        >
                                            {runningPreview === 'split' ? '...' : 'Preview SPLIT'}
                                        </button>
                                        <button
                                            className="btn-primary"
                                            onClick={runFullSync}
                                            disabled={requirementsLoading || !!runningPreview || runningFullSync || runningImportEvents || !!getBlockedReason('full-sync')}
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

                                {/* Sync Logs — detailed */}
                                <div className="rfid-errors-section">
                                    <h4 className="rfid-errors-title">
                                        {language === 'th' ? 'Sync Logs (ลบอัตโนมัติทุก 1 ชม.)' : 'Sync Logs (auto-deleted every 1hr)'}
                                    </h4>
                                    <div className="rfid-errors-list">
                                        {rfidStatus.recentLogs.length === 0 && (
                                            <div className="rfid-error-item" style={{ color: '#94a3b8' }}>
                                                {language === 'th' ? 'ไม่มี log' : 'No logs'}
                                            </div>
                                        )}
                                        {rfidStatus.recentLogs
                                            .slice(0, showAllErrors ? 10 : 3)
                                            .map((log, idx) => {
                                                const isError = log.status === 'error';
                                                const isSuccess = log.status === 'success';
                                                const errObj = log.errorDetails?.error;
                                                const fullSyncSummary = log.errorDetails?.fullSync?.summary;
                                                const duration = log.startTime && log.endTime
                                                    ? Math.round((new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000)
                                                    : null;
                                                return (
                                                    <div key={log._id || idx} className="rfid-error-item" style={{
                                                        borderLeft: `3px solid ${isError ? '#ef4444' : isSuccess ? '#22c55e' : '#f59e0b'}`,
                                                        marginBottom: 8, padding: '8px 12px',
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                            <span style={{ fontWeight: 700, fontSize: 12, color: isError ? '#ef4444' : isSuccess ? '#22c55e' : '#f59e0b' }}>
                                                                {isError ? '❌ ERROR' : isSuccess ? '✅ SUCCESS' : '⏳ PENDING'}
                                                            </span>
                                                            <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                                                {formatDate(log.createdAt)}
                                                                {duration !== null && ` (${duration}s)`}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: '#334155', marginBottom: 4, wordBreak: 'break-word' }}>
                                                            {log.message}
                                                        </div>
                                                        {(log.recordsProcessed != null || log.recordsFailed != null) && (
                                                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                                                ✅ Processed: {log.recordsProcessed ?? 0} | ❌ Failed: {log.recordsFailed ?? 0}
                                                            </div>
                                                        )}
                                                        {/* Full sync summary */}
                                                        {fullSyncSummary && (
                                                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4, background: '#f8fafc', padding: '6px 8px', borderRadius: 4 }}>
                                                                <div>📄 Pages: {fullSyncSummary.pagesFetched} | Rows: {fullSyncSummary.rowsFetched} | Mapped: {fullSyncSummary.rowsMapped}</div>
                                                                <div>🏃 Inserted: {fullSyncSummary.inserted} | Updated: {fullSyncSummary.updated} | Skipped: {fullSyncSummary.rowsSkipped}</div>
                                                                {fullSyncSummary.skippedNoResult > 0 && (
                                                                    <div>🚫 No score data: {fullSyncSummary.skippedNoResult}</div>
                                                                )}
                                                                {fullSyncSummary.scoreUpdates > 0 && (
                                                                    <div>⏱️ Score updates: {fullSyncSummary.scoreUpdates} | Status changes: {fullSyncSummary.scoreStatusChanges}</div>
                                                                )}
                                                                {Array.isArray(fullSyncSummary.errors) && fullSyncSummary.errors.length > 0 && (
                                                                    <div style={{ color: '#ef4444', marginTop: 4 }}>
                                                                        ⚠️ Processing errors:
                                                                        {fullSyncSummary.errors.slice(0, 5).map((e: string, i: number) => (
                                                                            <div key={i} style={{ marginLeft: 8, fontSize: 10 }}>• {e}</div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {/* Error details */}
                                                        {isError && errObj && (
                                                            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, background: '#fef2f2', padding: '6px 8px', borderRadius: 4 }}>
                                                                <div><strong>Error:</strong> {errObj.message || 'Unknown'}</div>
                                                                {errObj.name && <div><strong>Type:</strong> {errObj.name}</div>}
                                                                {errObj.stack && (
                                                                    <details style={{ marginTop: 4 }}>
                                                                        <summary style={{ cursor: 'pointer', fontSize: 10, color: '#94a3b8' }}>Stack trace</summary>
                                                                        <pre style={{ fontSize: 9, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: 4 }}>
                                                                            {errObj.stack}
                                                                        </pre>
                                                                    </details>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    {rfidStatus.recentLogs.length > 3 && (
                                        <button
                                            className="rfid-show-more"
                                            onClick={() => setShowAllErrors(!showAllErrors)}
                                        >
                                            {showAllErrors
                                                ? (language === 'th' ? 'แสดงน้อยลง' : 'Show less')
                                                : (language === 'th' ? `แสดงทั้งหมด (${rfidStatus.recentLogs.length})` : `Show all (${rfidStatus.recentLogs.length})`)
                                            }
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            className="btn-primary"
                            style={{ background: '#475569' }}
                            onClick={() => { loadRFIDStatus(); loadSyncRequirements(); showToast('info', language === 'th' ? 'รีเฟรชข้อมูลแล้ว' : 'Refreshed'); }}
                            disabled={loading || requirementsLoading}
                        >
                            {language === 'th' ? '🔄 รีเฟรช' : '🔄 Refresh'}
                        </button>
                        <button className="btn-primary" onClick={onClose}>
                            {language === 'th' ? 'ปิด' : 'Close'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
