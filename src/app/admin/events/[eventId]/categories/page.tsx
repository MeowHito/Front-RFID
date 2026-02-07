'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../../../AdminLayout';

interface Category {
    _id: string;
    name: string;
    distance: number;
    unit: string;
    type: string;
    date: string;
    syncDate: string;
    autoFix: boolean;
    isComplete: boolean;
    checkpoints: Checkpoint[];
}

interface Checkpoint {
    _id: string;
    name: string;
    distance: number;
}

interface Event {
    _id: string;
    name: string;
}

export default function CategoriesPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = params.eventId as string;
    const { language } = useLanguage();
    const [event, setEvent] = useState<Event | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [eventId]);

    const loadData = async () => {
        try {
            // Load event data
            const eventRes = await api.get(`/events/${eventId}`);
            setEvent(eventRes.data);

            // Simulated category data - replace with actual API
            setCategories([
                {
                    _id: '1',
                    name: 'CX15K',
                    distance: 15,
                    unit: 'km',
                    type: 'Trail Running',
                    date: '28/12/2025 07:00',
                    syncDate: '04/02/2026',
                    autoFix: false,
                    isComplete: false,
                    checkpoints: []
                },
                {
                    _id: '2',
                    name: 'CX30K',
                    distance: 30,
                    unit: 'km',
                    type: 'Trail Running',
                    date: '27/12/2025 07:00',
                    syncDate: '04/02/2026',
                    autoFix: false,
                    isComplete: false,
                    checkpoints: []
                },
                {
                    _id: '3',
                    name: 'CX50K',
                    distance: 50,
                    unit: 'km',
                    type: 'Trail Running',
                    date: '27/12/2025 07:00',
                    syncDate: '04/02/2026',
                    autoFix: false,
                    isComplete: false,
                    checkpoints: []
                },
                {
                    _id: '4',
                    name: 'CX70K',
                    distance: 70,
                    unit: 'km',
                    type: 'Trail Running',
                    date: '27/12/2025 05:00',
                    syncDate: '04/02/2026',
                    autoFix: false,
                    isComplete: false,
                    checkpoints: []
                }
            ]);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (categoryId: string, field: 'autoFix' | 'isComplete') => {
        setCategories(prev => prev.map(cat =>
            cat._id === categoryId
                ? { ...cat, [field]: !cat[field] }
                : cat
        ));
    };

    const toggleCheckpoints = (categoryId: string) => {
        setExpandedCategory(prev => prev === categoryId ? null : categoryId);
    };

    const copyLink = (categoryId: string, type: 'chipcode' | 'realtime') => {
        const url = `${window.location.origin}/${type}/${eventId}/${categoryId}`;
        navigator.clipboard.writeText(url);
        alert(language === 'th' ? 'คัดลอกลิงก์แล้ว!' : 'Link copied!');
    };

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                { label: 'ประเภทการแข่งขัน', labelEn: 'Categories' }
            ]}
            pageTitle={event ? `${language === 'th' ? 'อีเวนท์' : 'Event'}: ${event.name}` : ''}
            pageTitleEn={language === 'th' ? 'จัดการข้อมูลประเภทการแข่งขันของคุณ' : 'Manage your competition categories'}
        >
            <div className="admin-card">
                {/* Back Button */}
                <div className="categories-back">
                    <button onClick={() => router.back()} className="btn-back">
                        &lt; {language === 'th' ? 'ย้อนกลับ' : 'Back'}
                    </button>
                </div>

                {/* Header */}
                <div className="categories-header">
                    <h2 className="categories-title">
                        {language === 'th' ? 'ประเภทการแข่งขันทั้งหมด' : 'All Categories'} ( {categories.length} )
                    </h2>
                    <div className="categories-toolbar">
                        <button className="btn-action-outline">
                            <span>⊕</span> {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoint'}
                        </button>
                        <button className="btn-action-outline">
                            <span>⊕</span> {language === 'th' ? 'เพิ่มระยะ/ประเภท' : 'Add Category'}
                        </button>
                        <button className="btn-action-primary">
                            <span>👤</span> {language === 'th' ? 'เพิ่มผู้เข้าร่วมแข่งขัน' : 'Add Participant'}
                        </button>
                    </div>
                </div>

                {/* Categories List */}
                <div className="categories-list">
                    {loading ? (
                        <div className="categories-loading">
                            {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="categories-empty">
                            {language === 'th' ? 'ยังไม่มีประเภทการแข่งขัน' : 'No categories yet'}
                        </div>
                    ) : (
                        categories.map((category) => (
                            <div key={category._id} className="category-card">
                                {/* Distance Badge */}
                                <div className="category-distance-badge">
                                    <span className="distance-number">{category.distance}</span>
                                    <span className="distance-unit">{category.unit}</span>
                                </div>

                                {/* Category Info */}
                                <div className="category-info">
                                    <h3 className="category-name">{category.name}</h3>
                                    <div className="category-meta">
                                        <div className="meta-row">
                                            <span className="meta-label">{language === 'th' ? 'วันที่จัดงาน' : 'Event Date'}:</span>
                                            <span className="meta-value">{category.date}</span>
                                        </div>
                                        <div className="meta-row">
                                            <span className="meta-label">{language === 'th' ? 'ระยะทาง' : 'Distance'}:</span>
                                            <span className="meta-value">{category.distance}</span>
                                        </div>
                                        <div className="meta-row">
                                            <span className="meta-type">{category.type}</span>
                                        </div>
                                        <div className="meta-row">
                                            <span className="meta-sync">⏱️ {category.syncDate}</span>
                                        </div>
                                    </div>

                                    {/* Checkpoints Section */}
                                    <div className="category-checkpoints">
                                        <button
                                            className="checkpoints-toggle"
                                            onClick={() => toggleCheckpoints(category._id)}
                                        >
                                            &gt; Checkpoint
                                        </button>
                                        {expandedCategory === category._id && (
                                            <div className="checkpoints-list">
                                                {category.checkpoints.length === 0 ? (
                                                    <span className="no-checkpoints">
                                                        {language === 'th' ? 'ยังไม่มี checkpoint' : 'No checkpoints'}
                                                    </span>
                                                ) : (
                                                    category.checkpoints.map(cp => (
                                                        <div key={cp._id} className="checkpoint-item">
                                                            {cp.name} - {cp.distance}km
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Category Actions */}
                                <div className="category-actions">
                                    {/* Action Icons */}
                                    <div className="category-action-icons">
                                        <button
                                            className="action-icon-btn"
                                            onClick={() => copyLink(category._id, 'chipcode')}
                                            title={language === 'th' ? 'คัดลอก ChipCode' : 'Copy ChipCode'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                            </svg>
                                        </button>
                                        <button
                                            className="action-icon-btn"
                                            onClick={() => copyLink(category._id, 'realtime')}
                                            title={language === 'th' ? 'คัดลอก Realtime' : 'Copy Realtime'}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <polyline points="12 6 12 12 16 14" />
                                            </svg>
                                        </button>
                                        <button className="action-icon-btn" title={language === 'th' ? 'ผู้เข้าร่วม' : 'Participants'}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                            </svg>
                                        </button>
                                        <button className="action-icon-btn" title={language === 'th' ? 'ดูรายละเอียด' : 'Details'}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="16" x2="12" y2="12" />
                                                <line x1="12" y1="8" x2="12.01" y2="8" />
                                            </svg>
                                        </button>
                                        <button className="action-icon-btn edit" title={language === 'th' ? 'แก้ไข' : 'Edit'}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Toggles */}
                                    <div className="category-toggles">
                                        <div className="toggle-group">
                                            <span className="toggle-label">Auto-fix</span>
                                            <label className="toggle-switch small">
                                                <input
                                                    type="checkbox"
                                                    checked={category.autoFix}
                                                    onChange={() => handleToggle(category._id, 'autoFix')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div className="toggle-group">
                                            <span className="toggle-label">{language === 'th' ? 'จบงาน' : 'Complete'}</span>
                                            <label className="toggle-switch small">
                                                <input
                                                    type="checkbox"
                                                    checked={category.isComplete}
                                                    onChange={() => handleToggle(category._id, 'isComplete')}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
