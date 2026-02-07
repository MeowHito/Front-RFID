'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useLanguage } from '@/lib/language-context';

interface Event {
    _id: string;
    name: string;
    date: string;
    location: string;
    bannerImage?: string;
    categories?: string[];
}

export default function ChipCodePage() {
    const params = useParams();
    const eventId = params?.eventId as string;
    const { language } = useLanguage();
    const [event, setEvent] = useState<Event | null>(null);
    const [loading, setLoading] = useState(true);
    const [bibNumber, setBibNumber] = useState('');

    useEffect(() => {
        if (eventId) {
            loadEvent();
        }
    }, [eventId]);

    const loadEvent = async () => {
        try {
            const res = await api.get(`/events/${eventId}`);
            setEvent(res.data);
        } catch (error) {
            console.error('Failed to load event:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        // Navigate to results with bib number
        if (bibNumber) {
            window.location.href = `/chipcode/${eventId}/result?bib=${bibNumber}`;
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#87CEEB'
            }}>
                <p style={{ color: '#0066cc', fontSize: '18px' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </p>
            </div>
        );
    }

    if (!event) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#87CEEB'
            }}>
                <p style={{ color: '#c62828', fontSize: '18px' }}>
                    {language === 'th' ? 'ไม่พบอีเวนท์' : 'Event not found'}
                </p>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #87CEEB 0%, #e0f2ff 100%)'
        }}>
            {/* Header */}
            <div style={{
                background: '#87CEEB',
                padding: '40px 20px',
                textAlign: 'center'
            }}>
                <h1 style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#0066cc',
                    marginBottom: '20px'
                }}>
                    {event.name}
                </h1>
            </div>

            {/* Search Section */}
            <div style={{
                background: '#6b8e9e',
                padding: '16px 20px',
                textAlign: 'center',
                color: '#fff'
            }}>
                <h2 style={{ fontSize: '18px', fontWeight: '500' }}>
                    {language === 'th' ? 'ตรวจสอบข้อมูล' : 'Check Data'}
                </h2>
            </div>

            {/* Content */}
            <div style={{
                maxWidth: '600px',
                margin: '40px auto',
                padding: '0 20px'
            }}>
                <div style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '32px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        color: '#666',
                        fontSize: '14px'
                    }}>
                        {language === 'th' ? 'หมายเลข BIB' : 'BIB Number'}
                    </label>
                    <input
                        type="text"
                        value={bibNumber}
                        onChange={(e) => setBibNumber(e.target.value)}
                        placeholder={language === 'th' ? 'กรอกหมายเลข BIB' : 'Enter BIB number'}
                        style={{
                            width: '100%',
                            padding: '14px 16px',
                            border: '2px solid #e0e0e0',
                            borderRadius: '8px',
                            fontSize: '16px',
                            marginBottom: '20px'
                        }}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                        onClick={handleSearch}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        {language === 'th' ? 'ค้นหา' : 'Search'}
                    </button>
                </div>

                {/* Filters */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '40px',
                    marginTop: '40px',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    <span>GENDER</span>
                    <span>DISTANCE</span>
                    <span>AGE GROUP</span>
                </div>
            </div>

            {/* Footer */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'space-between',
                background: '#d4a574',
                padding: '16px 24px',
                alignItems: 'center'
            }}>
                <span style={{ color: '#fff', fontWeight: '500' }}>
                    {new Date(event.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    }).toUpperCase()}
                </span>
                <span style={{ color: '#fff' }}>
                    {language === 'th' ? 'ค้นหาภาพการแข่งขัน' : 'Search Race Photos'}
                </span>
            </div>

            {/* Timing Credit */}
            <div style={{
                position: 'fixed',
                bottom: 60,
                left: 0,
                right: 0,
                textAlign: 'center',
                padding: '8px',
                background: 'rgba(255,255,255,0.8)',
                fontSize: '12px',
                color: '#666'
            }}>
                Timing by ACTION
            </div>
        </div>
    );
}
