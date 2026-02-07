'use client';

import Link from 'next/link';
import { useState } from 'react';

interface DashboardHeaderProps {
    currentEvent?: {
        id: string;
        name: string;
    };
}

export default function DashboardHeader({ currentEvent }: DashboardHeaderProps) {
    const [showUserMenu, setShowUserMenu] = useState(false);

    // Mock data
    const mockEvent = currentEvent || { id: 'EVT001', name: 'DOI INTHANON BY UTMB 2026' };
    const rfidOnline = true;
    const serverOnline = true;

    return (
        <header className="admin-dashboard-header">
            {/* Left - Brand */}
            <Link href="/admin" className="brand">
                <i className="fas fa-bolt"></i>
                <span>ACTION ADMIN</span>
            </Link>

            {/* Center - Current Event & Status */}
            <div className="header-center">
                <div className="current-event">
                    <span className="event-id">{mockEvent.id}</span>
                    <span className="event-name">{mockEvent.name}</span>
                </div>
                <button className="btn-change-event">
                    <i className="fas fa-exchange-alt"></i>
                    เปลี่ยน Event
                </button>

                <div className="system-status">
                    <div className="status-item">
                        <span className={`status-indicator ${rfidOnline ? 'online' : 'offline'}`}></span>
                        <span>RFID: {rfidOnline ? 'Online' : 'Offline'}</span>
                    </div>
                    <div className="status-item">
                        <span className={`status-indicator ${serverOnline ? 'online' : 'offline'}`}></span>
                        <span>Server: {serverOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>
            </div>

            {/* Right - User Profile */}
            <div className="header-right">
                <div
                    className="user-profile"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                >
                    <div className="user-avatar">
                        <span>A</span>
                    </div>
                    <span className="user-name">Admin</span>
                    <i className="fas fa-chevron-down" style={{ fontSize: '10px' }}></i>
                </div>

                {showUserMenu && (
                    <div style={{
                        position: 'absolute',
                        top: '50px',
                        right: '15px',
                        background: '#fff',
                        borderRadius: '4px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                        minWidth: '180px',
                        zIndex: 1001
                    }}>
                        <Link href="/admin/profile" style={{
                            display: 'block',
                            padding: '10px 15px',
                            color: '#333',
                            textDecoration: 'none',
                            fontSize: '13px'
                        }}>
                            <i className="fas fa-user" style={{ marginRight: '8px' }}></i>
                            โปรไฟล์
                        </Link>
                        <Link href="/admin/settings" style={{
                            display: 'block',
                            padding: '10px 15px',
                            color: '#333',
                            textDecoration: 'none',
                            fontSize: '13px'
                        }}>
                            <i className="fas fa-cog" style={{ marginRight: '8px' }}></i>
                            ตั้งค่า
                        </Link>
                        <div style={{ borderTop: '1px solid #eee' }}></div>
                        <Link href="/" style={{
                            display: 'block',
                            padding: '10px 15px',
                            color: '#dd4b39',
                            textDecoration: 'none',
                            fontSize: '13px'
                        }}>
                            <i className="fas fa-sign-out-alt" style={{ marginRight: '8px' }}></i>
                            ออกจากระบบ
                        </Link>
                    </div>
                )}
            </div>
        </header>
    );
}
