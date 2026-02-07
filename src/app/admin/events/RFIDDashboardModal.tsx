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
}

export default function RFIDDashboardModal({ isOpen, onClose, eventId, eventName }: RFIDDashboardModalProps) {
    const { language } = useLanguage();
    const [rfidStatus, setRfidStatus] = useState<RFIDStatus>({
        status: 'Stopped',
        healthy: true,
        totalDataSize: '0 MB',
        lastCompletedTime: '-',
        lastErrorTime: '-',
        errors: []
    });
    const [loading, setLoading] = useState(false);
    const [showAllErrors, setShowAllErrors] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadRFIDStatus();
        }
    }, [isOpen, eventId]);

    const loadRFIDStatus = async () => {
        setLoading(true);
        try {
            // Simulated data - replace with actual API call
            setRfidStatus({
                status: 'Stopped',
                healthy: true,
                totalDataSize: '41.81 MB',
                lastCompletedTime: '2026-02-04 23:30:13',
                lastErrorTime: '2026-01-23 21:14:09',
                errors: [
                    'Split Synchronization failed: SSLHandshakeException: Remote host terminated the handshake',
                    'Split Synchronization failed: UnknownHostException: rqs.racetigertiming.com'
                ]
            });
        } catch (error) {
            console.error('Failed to load RFID status:', error);
        } finally {
            setLoading(false);
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
