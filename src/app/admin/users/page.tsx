'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../AdminLayout';

interface User {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    avatarUrl?: string;
    status?: string;
    eventCount?: number;
}

export default function UsersPage() {
    const { language } = useLanguage();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (userId: string) => {
        if (!confirm(language === 'th' ? 'ต้องการลบผู้ใช้นี้?' : 'Delete this user?')) return;
        try {
            await api.delete(`/users/${userId}`);
            setUsers(prev => prev.filter(u => u._id !== userId));
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert(language === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred');
        }
    };

    const getRoleLabel = (role: string) => {
        const roleMap: { [key: string]: { th: string; en: string } } = {
            admin: { th: 'admin', en: 'admin' },
            organizer: { th: 'organizer', en: 'organizer' },
            user: { th: 'user', en: 'user' },
        };
        return roleMap[role]?.[language === 'th' ? 'th' : 'en'] || role;
    };

    const totalPages = Math.ceil(users.length / itemsPerPage);
    const paginatedUsers = users.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'การตั้งค่าผู้ใช้งาน', labelEn: 'User Settings' }
            ]}
            pageTitle={language === 'th' ? 'เพิ่มและจัดการผู้ใช้งานในระบบ' : 'Add and manage system users'}
        >
            <div className="admin-card">
                {/* Header */}
                <div className="users-header">
                    <h2 className="users-title">
                        {language === 'th' ? 'ผู้ใช้งานทั้งหมด' : 'All Users'} ( {users.length} )
                    </h2>
                    <button className="btn-add-user">
                        + {language === 'th' ? 'เพิ่มผู้ใช้งาน' : 'Add User'}
                    </button>
                </div>

                {/* Users Table */}
                <div className="users-table-wrapper">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>{language === 'th' ? 'ลำดับ' : '#'}</th>
                                <th>
                                    {language === 'th' ? 'ชื่อผู้ใช้' : 'Username'}
                                    <span className="sort-icon">↕</span>
                                </th>
                                <th>
                                    {language === 'th' ? 'ประเภท' : 'Type'}
                                    <span className="sort-icon">↕</span>
                                </th>
                                <th>
                                    {language === 'th' ? 'อีเมล' : 'Email'}
                                    <span className="sort-icon">↕</span>
                                </th>
                                <th>{language === 'th' ? 'รูปโปรไฟล์' : 'Profile'}</th>
                                <th>
                                    {language === 'th' ? 'สถานะ' : 'Status'}
                                    <span className="sort-icon">↕</span>
                                </th>
                                <th>
                                    {language === 'th' ? 'จำนวนอีเวนท์' : 'Events'}
                                    <span className="sort-icon">↕</span>
                                </th>
                                <th>{language === 'th' ? 'จัดการ' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="table-loading">
                                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                    </td>
                                </tr>
                            ) : paginatedUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="table-empty">
                                        {language === 'th' ? 'ไม่พบผู้ใช้งาน' : 'No users found'}
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((user, index) => (
                                    <tr key={user._id}>
                                        <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                                        <td className="user-name-cell">
                                            <a href={`/admin/users/${user._id}`} className="user-name-link">
                                                {user.firstName} {user.lastName}
                                            </a>
                                        </td>
                                        <td>{getRoleLabel(user.role)}</td>
                                        <td className="user-email-cell">
                                            <a href={`mailto:${user.email}`} className="user-email-link">
                                                {user.email}
                                            </a>
                                        </td>
                                        <td>
                                            <div className="user-avatar-small">
                                                {user.avatarUrl ? (
                                                    <img src={user.avatarUrl} alt="Avatar" />
                                                ) : (
                                                    <span className="avatar-placeholder-small">👤</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${user.status === 'active' ? 'active' : ''}`}>
                                                {language === 'th' ? 'ใช้งาน' : 'Active'}
                                            </span>
                                        </td>
                                        <td>{user.eventCount || 0}</td>
                                        <td>
                                            <button
                                                className="btn-delete"
                                                onClick={() => handleDelete(user._id)}
                                            >
                                                🗑️ {language === 'th' ? 'ลบ' : 'Delete'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="users-pagination">
                    <div className="pagination-info">
                        <button
                            className="pagination-btn"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                        >
                            &lt;
                        </button>
                        <span className="pagination-current">{currentPage}</span>
                        <button
                            className="pagination-btn"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                        >
                            &gt;
                        </button>
                    </div>
                    <div className="pagination-per-page">
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="admin-form-select"
                        >
                            <option value={10}>10 / page</option>
                            <option value={20}>20 / page</option>
                            <option value={50}>50 / page</option>
                        </select>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
