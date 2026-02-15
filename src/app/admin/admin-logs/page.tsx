'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import AdminLayout from '../AdminLayout';

interface AdminLogEntry {
    _id: string;
    loginAccount: string;
    accountName: string;
    clientIp: string;
    countryRegion: string;
    provinceStateCity: string;
    city: string;
    serviceProvider: string;
    startTime: string;
    remark: string;
}

export default function AdminLogsPage() {
    const { language } = useLanguage();
    const { token } = useAuth();
    const [logs, setLogs] = useState<AdminLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        loadLogs();
    }, [currentPage]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin-logs?page=${currentPage}&limit=${itemsPerPage}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const result = await res.json();
                setLogs(result.data || []);
                setTotal(result.total || 0);
            }
        } catch (error) {
            console.error('Failed to load admin logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fmt = (d: string) => {
        if (!d) return '-';
        return new Date(d).toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const totalPages = Math.ceil(total / itemsPerPage);

    return (
        <AdminLayout
            breadcrumbItems={[{ label: 'Admin Log', labelEn: 'Admin Log' }]}
            pageTitle="Admin Log"
        >
            <div className="admin-card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                        {language === 'th' ? 'ประวัติเข้าสู่ระบบ' : 'Login History'} ({total})
                    </span>
                    <button onClick={() => { setCurrentPage(1); loadLogs(); }}
                        style={{ padding: '3px 10px', borderRadius: 3, border: '1px solid #3c8dbc', background: '#3c8dbc', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                        Refresh
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                            <tr style={{ background: '#f5f7fa' }}>
                                {['#', 'Login Account', 'Account Name', 'Client IP', 'Country/Region', 'Province/State', 'City', 'Service Provider', 'Start Time', 'Remark'].map(h => (
                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d2d6de', fontWeight: 600, color: '#555', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 11 }}>Loading...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 11 }}>
                                    {language === 'th' ? 'ยังไม่มีข้อมูล - กรุณา Logout แล้ว Login ใหม่เพื่อบันทึก Log' : 'No data - Please logout and login again to record a log'}
                                </td></tr>
                            ) : (
                                logs.map((log, i) => (
                                    <tr key={log._id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={td}>{(currentPage - 1) * itemsPerPage + i + 1}</td>
                                        <td style={td}>{log.loginAccount}</td>
                                        <td style={td}>{log.accountName}</td>
                                        <td style={td}><code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 2, fontSize: 10 }}>{log.clientIp}</code></td>
                                        <td style={td}>{log.countryRegion}</td>
                                        <td style={td}>{log.provinceStateCity}</td>
                                        <td style={td}>{log.city}</td>
                                        <td style={td}>{log.serviceProvider}</td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(log.startTime)}</td>
                                        <td style={td}>
                                            <span style={{ background: '#e6f7e6', color: '#2e7d32', padding: '1px 5px', borderRadius: 2, fontSize: 10 }}>{log.remark}</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 3 }}>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                            style={pgBtn(currentPage === 1)}>&laquo;</button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const p = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
                            return <button key={p} onClick={() => setCurrentPage(p)}
                                style={{ ...pgBtn(false), background: currentPage === p ? '#3c8dbc' : '#fff', color: currentPage === p ? '#fff' : '#333' }}>{p}</button>;
                        })}
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                            style={pgBtn(currentPage === totalPages)}>&raquo;</button>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

const td: React.CSSProperties = { padding: '5px 8px', color: '#333', verticalAlign: 'middle', fontSize: 11 };
const pgBtn = (off: boolean): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 2, border: '1px solid #d2d6de', background: off ? '#f5f5f5' : '#fff', color: off ? '#aaa' : '#333', fontSize: 11, cursor: off ? 'not-allowed' : 'pointer' });
