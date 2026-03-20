'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import AdminLayout from '../AdminLayout';

interface User {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    avatarUrl?: string;
    isActive?: boolean;
    lastLogin?: string;
    createdAt?: string;
}

const ROLE_OPTIONS = ['user', 'organizer', 'station', 'admin'];

const ROLE_LABELS: Record<string, { th: string; en: string; color: string; bg: string }> = {
    admin_master: { th: 'Admin Master', en: 'Admin Master', color: '#9333ea', bg: '#f3e8ff' },
    admin: { th: 'Admin', en: 'Admin', color: '#dc2626', bg: '#fef2f2' },
    organizer: { th: 'Organizer', en: 'Organizer', color: '#2563eb', bg: '#eff6ff' },
    user: { th: 'User', en: 'User', color: '#6b7280', bg: '#f9fafb' },
    station: { th: 'Station', en: 'Station', color: '#059669', bg: '#ecfdf5' },
};

export default function UsersPage() {
    const { language } = useLanguage();
    const { user: currentUser } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [searchTerm, setSearchTerm] = useState('');

    // Email confirmation popup state
    const [confirmPopup, setConfirmPopup] = useState<{
        show: boolean;
        userId: string;
        userEmail: string;
        userName: string;
        newRole: string;
        oldRole: string;
        emailInput: string;
    } | null>(null);

    // Toast notification
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => { loadUsers(); }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const loadUsers = async () => {
        try {
            const res = await fetch('/api/users?limit=500', { cache: 'no-store' });
            const data = await res.json();
            const list = data?.data || (Array.isArray(data) ? data : []);
            setUsers(list);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = (user: User, newRole: string) => {
        if (newRole === user.role) return;

        // If promoting to admin, show email confirmation popup
        if (newRole === 'admin') {
            setConfirmPopup({
                show: true,
                userId: user._id,
                userEmail: user.email,
                userName: `${user.firstName} ${user.lastName}`.trim(),
                newRole,
                oldRole: user.role,
                emailInput: '',
            });
            return;
        }

        // For other role changes, apply directly
        applyRoleChange(user._id, newRole);
    };

    const applyRoleChange = async (userId: string, newRole: string) => {
        try {
            const res = await fetch(`/api/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: newRole,
                    requestorRole: currentUser?.role,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || err.error || 'Failed to update role');
            }

            // Update local state
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
            setToast({
                message: language === 'th' ? 'เปลี่ยนบทบาทสำเร็จ' : 'Role updated successfully',
                type: 'success',
            });
        } catch (error: any) {
            setToast({
                message: error.message || (language === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred'),
                type: 'error',
            });
        }
    };

    const handleConfirmAdmin = () => {
        if (!confirmPopup) return;
        if (confirmPopup.emailInput !== confirmPopup.userEmail) return;
        applyRoleChange(confirmPopup.userId, confirmPopup.newRole);
        setConfirmPopup(null);
    };

    const handleCancelConfirm = () => {
        setConfirmPopup(null);
    };

    // Filter users by search
    const filteredUsers = users.filter(u => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            u.firstName?.toLowerCase().includes(term) ||
            u.lastName?.toLowerCase().includes(term) ||
            u.email?.toLowerCase().includes(term) ||
            u.role?.toLowerCase().includes(term)
        );
    });

    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const getRoleInfo = (role: string) => ROLE_LABELS[role] || ROLE_LABELS.user;

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'จัดการผู้ใช้งาน', labelEn: 'Manage Users' },
            ]}
            pageTitle={language === 'th' ? 'จัดการผู้ใช้งานและบทบาท' : 'User & Role Management'}
        >
            <div className="admin-card">
                {/* Header */}
                <div className="users-header">
                    <h2 className="users-title">
                        {language === 'th' ? 'ผู้ใช้งานทั้งหมด' : 'All Users'} ({filteredUsers.length})
                    </h2>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder={language === 'th' ? '🔍 ค้นหาชื่อ, อีเมล...' : '🔍 Search name, email...'}
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 10,
                                border: '1px solid var(--admin-border, #e2e8f0)',
                                background: 'var(--admin-bg-secondary, #f8fafc)',
                                color: 'var(--admin-text, #1e293b)',
                                fontSize: 13,
                                minWidth: 220,
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={() => router.push('/admin/users/create')}
                            style={{
                                padding: '8px 18px', borderRadius: 10, border: 'none',
                                background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13,
                                cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                            }}
                        >
                            + {language === 'th' ? 'สร้างผู้ใช้' : 'Create User'}
                        </button>
                    </div>
                </div>

                {/* Users Table */}
                <div className="users-table-wrapper">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th style={{ width: 50 }}>{language === 'th' ? 'ลำดับ' : '#'}</th>
                                <th>{language === 'th' ? 'ชื่อผู้ใช้' : 'User'}</th>
                                <th>{language === 'th' ? 'อีเมล' : 'Email'}</th>
                                <th style={{ width: 180 }}>{language === 'th' ? 'บทบาท' : 'Role'}</th>
                                <th style={{ width: 100 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                <th style={{ width: 80 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="table-loading">
                                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                    </td>
                                </tr>
                            ) : paginatedUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="table-empty">
                                        {language === 'th' ? 'ไม่พบผู้ใช้งาน' : 'No users found'}
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((u, index) => {
                                    const roleInfo = getRoleInfo(u.role);
                                    const isAdminMaster = u.role === 'admin_master';
                                    const isSelf = u._id === currentUser?._id || u.email === currentUser?.email;
                                    const canEdit = !isAdminMaster && !isSelf;

                                    return (
                                        <tr key={u._id}>
                                            <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                                                {(currentPage - 1) * itemsPerPage + index + 1}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 36, height: 36, borderRadius: 10,
                                                        background: isAdminMaster ? 'linear-gradient(135deg, #9333ea, #6d28d9)' : 'linear-gradient(135deg, #64748b, #475569)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                                                        overflow: 'hidden',
                                                    }}>
                                                        {u.avatarUrl ? (
                                                            <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            (u.firstName?.[0] || '') + (u.lastName?.[0] || '')
                                                        ).toString().toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-text, #1e293b)' }}>
                                                            {u.firstName} {u.lastName}
                                                            {isSelf && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 6 }}>(คุณ)</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 13, color: 'var(--admin-text-muted, #64748b)' }}>
                                                    {u.email}
                                                </span>
                                            </td>
                                            <td>
                                                {isAdminMaster ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                        padding: '5px 14px', borderRadius: 8,
                                                        background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)',
                                                        color: '#7c3aed', fontSize: 12, fontWeight: 700,
                                                        border: '1px solid #c4b5fd',
                                                    }}>
                                                        👑 Admin Master
                                                    </span>
                                                ) : canEdit ? (
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u, e.target.value)}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: 8,
                                                            border: `1.5px solid ${roleInfo.color}30`,
                                                            background: roleInfo.bg,
                                                            color: roleInfo.color,
                                                            fontSize: 12, fontWeight: 700,
                                                            cursor: 'pointer', outline: 'none',
                                                            minWidth: 120,
                                                        }}
                                                    >
                                                        {ROLE_OPTIONS.map(r => (
                                                            <option key={r} value={r}>
                                                                {ROLE_LABELS[r]?.[language === 'th' ? 'th' : 'en'] || r}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '5px 14px', borderRadius: 8,
                                                        background: roleInfo.bg,
                                                        color: roleInfo.color,
                                                        fontSize: 12, fontWeight: 700,
                                                        border: `1px solid ${roleInfo.color}20`,
                                                    }}>
                                                        {roleInfo[language === 'th' ? 'th' : 'en']}
                                                        {isSelf && ' (คุณ)'}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: 6,
                                                    background: u.isActive !== false ? '#dcfce7' : '#fee2e2',
                                                    color: u.isActive !== false ? '#16a34a' : '#dc2626',
                                                    fontSize: 11, fontWeight: 700,
                                                }}>
                                                    {u.isActive !== false
                                                        ? (language === 'th' ? 'ใช้งาน' : 'Active')
                                                        : (language === 'th' ? 'ปิดใช้งาน' : 'Inactive')
                                                    }
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => router.push(`/admin/users/create?edit=${u._id}`)}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                                                        background: '#f8fafc', color: '#475569', fontSize: 11, fontWeight: 600,
                                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {language === 'th' ? '✏️ แก้ไข' : '✏️ Edit'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="users-pagination">
                    <div className="pagination-info">
                        <button className="pagination-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lt;</button>
                        <span className="pagination-current">
                            {language === 'th' ? `หน้า ${currentPage} / ${totalPages || 1}` : `Page ${currentPage} / ${totalPages || 1}`}
                        </span>
                        <button className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>&gt;</button>
                    </div>
                    <div className="pagination-per-page">
                        <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="admin-form-select">
                            <option value={10}>10 / page</option>
                            <option value={20}>20 / page</option>
                            <option value={50}>50 / page</option>
                            <option value={100}>100 / page</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Email Confirmation Popup */}
            {confirmPopup?.show && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                }} onClick={handleCancelConfirm}>
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: '32px 28px', maxWidth: 440, width: '90%',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
                            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                                {language === 'th' ? 'ยืนยันการให้บทบาท Admin' : 'Confirm Admin Role'}
                            </h3>
                            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                                {language === 'th'
                                    ? `กรุณาพิมพ์อีเมลของ "${confirmPopup.userName}" เพื่อยืนยัน`
                                    : `Please type the email of "${confirmPopup.userName}" to confirm`
                                }
                            </p>
                        </div>

                        <div style={{
                            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px',
                            marginBottom: 16, fontSize: 12, color: '#dc2626', fontWeight: 600,
                        }}>
                            ⚠️ {language === 'th'
                                ? 'Admin สามารถจัดการระบบทั้งหมดได้ โปรดตรวจสอบให้แน่ใจ'
                                : 'Admins have full system access. Please verify carefully.'}
                        </div>

                        <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                            {language === 'th' ? 'พิมพ์อีเมล:' : 'Type email:'}
                            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>{confirmPopup.userEmail}</span>
                        </div>
                        <input
                            type="email"
                            placeholder={confirmPopup.userEmail}
                            value={confirmPopup.emailInput}
                            onChange={(e) => setConfirmPopup(prev => prev ? { ...prev, emailInput: e.target.value } : null)}
                            autoFocus
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 10,
                                border: confirmPopup.emailInput === confirmPopup.userEmail
                                    ? '2px solid #22c55e' : '1.5px solid #e2e8f0',
                                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                transition: 'border-color 0.2s',
                            }}
                        />

                        {confirmPopup.emailInput.length > 0 && confirmPopup.emailInput !== confirmPopup.userEmail && (
                            <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6, fontWeight: 600 }}>
                                ❌ {language === 'th' ? 'อีเมลไม่ตรงกัน' : 'Email does not match'}
                            </p>
                        )}

                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <button
                                onClick={handleCancelConfirm}
                                style={{
                                    flex: 1, padding: '12px 0', borderRadius: 12,
                                    border: '1.5px solid #e2e8f0', background: '#fff',
                                    color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                                }}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleConfirmAdmin}
                                disabled={confirmPopup.emailInput !== confirmPopup.userEmail}
                                style={{
                                    flex: 1, padding: '12px 0', borderRadius: 12,
                                    border: 'none',
                                    background: confirmPopup.emailInput === confirmPopup.userEmail
                                        ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : '#e2e8f0',
                                    color: confirmPopup.emailInput === confirmPopup.userEmail ? '#fff' : '#94a3b8',
                                    fontWeight: 700, fontSize: 14,
                                    cursor: confirmPopup.emailInput === confirmPopup.userEmail ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {language === 'th' ? '✅ ยืนยันให้เป็น Admin' : '✅ Confirm Admin'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
                    padding: '14px 24px', borderRadius: 14,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626',
                    color: '#fff', fontWeight: 700, fontSize: 14,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    animation: 'slideUp 0.3s ease-out',
                }}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </AdminLayout>
    );
}
