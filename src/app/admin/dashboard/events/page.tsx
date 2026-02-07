'use client';

import { useState } from 'react';
import DashboardLayout from '../../DashboardLayout';

// Mock data for events
const mockEvents = [
    {
        id: 'EVT001',
        name: 'DOI INTHANON BY UTMB 2026',
        location: 'ดอยอินทนนท์ เชียงใหม่',
        date: '2026-02-05',
        mode: 'REAL',
        certificateEnabled: true,
        rfidSynced: true,
        isActive: true,
    },
    {
        id: 'EVT002',
        name: 'KHAO YAI TRAIL 50K',
        location: 'อุทยานแห่งชาติเขาใหญ่',
        date: '2026-03-15',
        mode: 'TEST',
        certificateEnabled: false,
        rfidSynced: false,
        isActive: false,
    },
    {
        id: 'EVT003',
        name: 'CHIANGMAI MARATHON 2026',
        location: 'เชียงใหม่',
        date: '2026-04-20',
        mode: 'REAL',
        certificateEnabled: true,
        rfidSynced: true,
        isActive: true,
    },
    {
        id: 'EVT004',
        name: 'PHUKET TRIATHLON',
        location: 'ภูเก็ต',
        date: '2026-05-01',
        mode: 'TEST',
        certificateEnabled: false,
        rfidSynced: false,
        isActive: false,
    },
];

export default function DashboardEventsPage() {
    const [events, setEvents] = useState(mockEvents);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all');

    const handleToggle = (eventId: string, field: 'certificateEnabled' | 'isActive') => {
        setEvents(events.map(event => {
            if (event.id === eventId) {
                return { ...event, [field]: !event[field] };
            }
            return event;
        }));
    };

    const filteredEvents = events.filter(event => {
        const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesMode = filterMode === 'all' || event.mode === filterMode;
        return matchesSearch && matchesMode;
    });

    return (
        <DashboardLayout>
            {/* Content Header */}
            <div className="content-header">
                <h1>
                    จัดการอีเวนต์
                    <small>Event Management</small>
                </h1>
                <nav className="breadcrumb-nav">
                    <a href="/admin">หน้าแรก</a>
                    <span>/</span>
                    <span>จัดการอีเวนต์</span>
                </nav>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar">
                <input
                    type="text"
                    className="search-input"
                    placeholder="ค้นหาอีเวนต์..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value)}
                >
                    <option value="all">ทั้งหมด</option>
                    <option value="REAL">เฉพาะ REAL</option>
                    <option value="TEST">เฉพาะ TEST</option>
                </select>
                <button className="btn-filter">
                    <i className="fas fa-search"></i>
                    ค้นหา
                </button>
            </div>

            {/* Data Table */}
            <div className="data-table-wrapper">
                <div className="data-table-header">
                    <h3>รายการอีเวนต์ ({filteredEvents.length})</h3>
                    <button className="btn-add">
                        <i className="fas fa-plus"></i>
                        เพิ่มอีเวนต์
                    </button>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>Tools</th>
                            <th style={{ width: '100px' }}>Event ID</th>
                            <th>ชื่ออีเวนต์ / สถานที่</th>
                            <th style={{ width: '120px' }}>วันที่</th>
                            <th style={{ width: '80px' }}>Mode</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>Certificate</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>RFID Sync</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>สถานะ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEvents.map((event) => (
                            <tr key={event.id}>
                                <td>
                                    <div className="tools">
                                        <button className="btn-icon edit" title="แก้ไข">
                                            <i className="fas fa-edit"></i>
                                        </button>
                                        <button className="btn-icon results" title="ผลการแข่งขัน">
                                            <i className="fas fa-trophy"></i>
                                        </button>
                                    </div>
                                </td>
                                <td>
                                    <strong>{event.id}</strong>
                                </td>
                                <td>
                                    <div className="event-name-cell">
                                        <div className="name">{event.name}</div>
                                        <div className="location">{event.location}</div>
                                    </div>
                                </td>
                                <td>{event.date}</td>
                                <td>
                                    <span className={`badge ${event.mode === 'REAL' ? 'badge-real' : 'badge-test'}`}>
                                        {event.mode}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <label className="toggle-switch-admin">
                                        <input
                                            type="checkbox"
                                            checked={event.certificateEnabled}
                                            onChange={() => handleToggle(event.id, 'certificateEnabled')}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <div className={`rfid-status ${event.rfidSynced ? 'synced' : 'not-synced'}`}>
                                        <i className={`fas ${event.rfidSynced ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                                        <span>{event.rfidSynced ? 'Synced' : 'Not Synced'}</span>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <label className="toggle-switch-admin">
                                        <input
                                            type="checkbox"
                                            checked={event.isActive}
                                            onChange={() => handleToggle(event.id, 'isActive')}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="data-table-footer">
                    <div className="table-info">
                        แสดง 1-{filteredEvents.length} จาก {filteredEvents.length} รายการ
                    </div>
                    <div className="pagination">
                        <button><i className="fas fa-chevron-left"></i></button>
                        <button className="active">1</button>
                        <button>2</button>
                        <button>3</button>
                        <button><i className="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
