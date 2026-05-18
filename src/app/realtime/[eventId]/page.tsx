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

interface Runner {
    _id: string;
    bib: string;
    name: string;
    gender: string;
    nationality: string;
    passTime?: string;
}

export default function RealtimePage() {
    const params = useParams();
    const eventId = params?.eventId as string;
    const { language } = useLanguage();
    const [event, setEvent] = useState<Event | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Realtime');

    useEffect(() => {
        if (eventId) {
            loadEvent();
            loadRunners();
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

    const loadRunners = async () => {
        try {
            const res = await api.get(`/runners/by-event/${eventId}`);
            setRunners(res.data || []);
        } catch (error) {
            console.error('Failed to load runners:', error);
            // Use sample data if API fails
            setRunners([
                { _id: '1', bib: '1516', name: 'วลัยรัตน์ สาม์ปทร์', gender: 'Female', nationality: 'THA', passTime: '10:01:47' },
                { _id: '2', bib: '1501', name: 'ศศิมิต ปังโอทาร', gender: 'Male', nationality: 'THA', passTime: '10:00:39' },
                { _id: '3', bib: '1503', name: 'อิศรพงศ์ มั่งมี', gender: 'Male', nationality: 'THA', passTime: '09:57:01' },
                { _id: '4', bib: '1509', name: 'โชคชนะทร อินทมุษ', gender: 'Male', nationality: 'THA', passTime: '09:48:24' },
                { _id: '5', bib: '1520', name: 'Panani Chongchongchai', gender: 'Female', nationality: 'THA', passTime: '09:40:03' },
            ]);
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5'
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
                background: '#f5f5f5'
            }}>
                <p style={{ color: '#c62828', fontSize: '18px' }}>
                    {language === 'th' ? 'ไม่พบอีเวนท์' : 'Event not found'}
                </p>
            </div>
        );
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
            {/* Header */}
            <header style={{
                background: '#1a1a2e',
                padding: '8px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: '#fff', fontSize: '12px' }}>📧 Action.in.th@gmail.com</span>
                <div style={{ color: '#fff', fontSize: '14px' }}>
                    <span>👤 admin system</span>
                    <span style={{ marginLeft: '16px' }}>{language === 'th' ? 'ออกจากระบบ' : 'Logout'}</span>
                </div>
            </header>

            {/* Nav */}
            <nav style={{
                background: '#fff',
                padding: '16px 24px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    fontStyle: 'italic',
                    letterSpacing: '2px'
                }}>
                    ∆CTI<span style={{ color: '#0066cc' }}>O</span>N
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <span>{language === 'th' ? 'โปรไฟล์' : 'Profile'}</span>
                    <select style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                        <option>TH</option>
                        <option>EN</option>
                    </select>
                </div>
            </nav>

            {/* Event Banner */}
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                {event.bannerImage && (
                    <img
                        src={event.bannerImage}
                        alt={event.name}
                        style={{
                            maxWidth: '500px',
                            width: '100%',
                            borderRadius: '12px',
                            marginBottom: '24px'
                        }}
                    />
                )}
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {event.name}
                </h1>
                <p style={{ color: '#666' }}>{formatDate(event.date)}</p>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '24px',
                padding: '0 24px',
                borderBottom: '1px solid #e0e0e0'
            }}>
                {['Result', 'LIVE', 'Summary', 'Realtime'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 0',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab ? '3px solid #0066cc' : 'none',
                            color: activeTab === tab ? '#0066cc' : '#666',
                            fontWeight: activeTab === tab ? '600' : '400',
                            cursor: 'pointer'
                        }}
                    >
                        {tab === 'Realtime' && '⌚ '}
                        {tab}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                gap: '16px',
                padding: '16px 24px',
                flexWrap: 'wrap'
            }}>
                <select style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '150px' }}>
                    <option>Finish</option>
                </select>
                <select style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '200px' }}>
                    <option>{language === 'th' ? 'ประเภทที่ต้องการค้นหา' : 'Race Category'}</option>
                </select>
                <select style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '100px' }}>
                    <option>{language === 'th' ? 'เพศ' : 'Gender'}</option>
                </select>
                <select style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '120px' }}>
                    <option>{language === 'th' ? 'กลุ่มอายุ' : 'Age Group'}</option>
                </select>
            </div>

            {/* Results Table */}
            <div style={{ padding: '0 24px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                            <th style={{ padding: '12px', textAlign: 'left', color: '#666', fontSize: '14px' }}>Bib ↕</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: '#666', fontSize: '14px' }}>{language === 'th' ? 'ชื่อ' : 'Name'} ↕</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: '#666', fontSize: '14px' }}>{language === 'th' ? 'เพศ' : 'Gender'} ↕</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: '#666', fontSize: '14px' }}>{language === 'th' ? 'สัญชาติ' : 'Nationality'} ↕</th>
                            <th style={{ padding: '12px', textAlign: 'left', color: '#666', fontSize: '14px' }}>Pass Time ↕</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runners.map((runner, idx) => (
                            <tr key={runner._id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '12px', color: '#0066cc' }}>{runner.bib}</td>
                                <td style={{ padding: '12px', color: '#0066cc' }}>{runner.name}</td>
                                <td style={{ padding: '12px', color: runner.gender === 'Female' ? '#e91e63' : '#666' }}>
                                    {runner.gender}
                                </td>
                                <td style={{ padding: '12px', color: '#666' }}>{runner.nationality}</td>
                                <td style={{ padding: '12px', color: '#e91e63' }}>{runner.passTime}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
