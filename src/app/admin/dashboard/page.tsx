'use client';

import DashboardLayout from '../DashboardLayout';

export default function AdminDashboardPage() {
    // Mock statistics
    const stats = [
        { label: 'อีเวนต์ทั้งหมด', value: 12, icon: 'fa-calendar-alt', color: '#00a65a' },
        { label: 'นักกีฬาลงทะเบียน', value: 1250, icon: 'fa-running', color: '#00c0ef' },
        { label: 'RFID Readers', value: 8, icon: 'fa-broadcast-tower', color: '#f39c12' },
        { label: 'รอออกใบประกาศ', value: 45, icon: 'fa-certificate', color: '#dd4b39' },
    ];

    const recentActivities = [
        { time: '10:32', text: 'นักกีฬา BIB#1234 ผ่านจุด CP2', type: 'timing' },
        { time: '10:28', text: 'RFID Reader #3 ออนไลน์', type: 'system' },
        { time: '10:15', text: 'ลงทะเบียนนักกีฬาใหม่ 5 คน', type: 'registration' },
        { time: '09:45', text: 'Event EVT001 เริ่มการแข่งขัน', type: 'event' },
        { time: '09:30', text: 'ซิงค์ข้อมูล RFID สำเร็จ', type: 'sync' },
    ];

    return (
        <DashboardLayout>
            {/* Content Header */}
            <div className="content-header">
                <h1>
                    แดชบอร์ด
                    <small>Dashboard</small>
                </h1>
                <nav className="breadcrumb-nav">
                    <a href="/admin">หน้าแรก</a>
                    <span>/</span>
                    <span>แดชบอร์ด</span>
                </nav>
            </div>

            {/* Stats Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
                marginBottom: '20px'
            }}>
                {stats.map((stat, index) => (
                    <div key={index} style={{
                        background: '#fff',
                        borderRadius: '4px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        borderLeft: `4px solid ${stat.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '28px', fontWeight: '600', color: '#333' }}>
                                {stat.value.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '13px', color: '#888' }}>{stat.label}</div>
                        </div>
                        <i className={`fas ${stat.icon}`} style={{ fontSize: '40px', color: stat.color, opacity: 0.3 }}></i>
                    </div>
                ))}
            </div>

            {/* Recent Activity */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '20px'
            }}>
                {/* Quick Actions */}
                <div style={{
                    background: '#fff',
                    borderRadius: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                }}>
                    <div style={{
                        padding: '15px',
                        borderBottom: '1px solid #eee',
                        fontWeight: '500',
                        fontSize: '16px'
                    }}>
                        <i className="fas fa-bolt" style={{ marginRight: '8px', color: '#f39c12' }}></i>
                        Quick Actions
                    </div>
                    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                        <button style={{
                            padding: '15px',
                            background: '#00a65a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-plus fa-lg"></i>
                            <span>สร้างอีเวนต์</span>
                        </button>
                        <button style={{
                            padding: '15px',
                            background: '#00c0ef',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-user-plus fa-lg"></i>
                            <span>ลงทะเบียน</span>
                        </button>
                        <button style={{
                            padding: '15px',
                            background: '#f39c12',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-sync fa-lg"></i>
                            <span>Sync RFID</span>
                        </button>
                        <button style={{
                            padding: '15px',
                            background: '#605ca8',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-tv fa-lg"></i>
                            <span>Live Monitor</span>
                        </button>
                        <button style={{
                            padding: '15px',
                            background: '#dd4b39',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-trophy fa-lg"></i>
                            <span>ดูผลการแข่งขัน</span>
                        </button>
                        <button style={{
                            padding: '15px',
                            background: '#3c8dbc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <i className="fas fa-file-alt fa-lg"></i>
                            <span>รายงาน</span>
                        </button>
                    </div>
                </div>

                {/* Recent Activity */}
                <div style={{
                    background: '#fff',
                    borderRadius: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                }}>
                    <div style={{
                        padding: '15px',
                        borderBottom: '1px solid #eee',
                        fontWeight: '500',
                        fontSize: '16px'
                    }}>
                        <i className="fas fa-history" style={{ marginRight: '8px', color: '#00a65a' }}></i>
                        Recent Activity
                    </div>
                    <div style={{ padding: '15px' }}>
                        {recentActivities.map((activity, index) => (
                            <div key={index} style={{
                                display: 'flex',
                                gap: '10px',
                                padding: '10px 0',
                                borderBottom: index < recentActivities.length - 1 ? '1px solid #f5f5f5' : 'none'
                            }}>
                                <span style={{
                                    fontSize: '11px',
                                    color: '#888',
                                    whiteSpace: 'nowrap'
                                }}>{activity.time}</span>
                                <span style={{ fontSize: '13px', color: '#333' }}>{activity.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
