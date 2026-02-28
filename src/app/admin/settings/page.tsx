'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

export default function SettingsPage() {
    const { language } = useLanguage();
    const { user, updatePassword } = useAuth();
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);

        if (newPw.length < 6) {
            setMsg({ type: 'error', text: language === 'th' ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' : 'New password must be at least 6 characters' });
            return;
        }
        if (newPw !== confirmPw) {
            setMsg({ type: 'error', text: language === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกัน' : 'New passwords do not match' });
            return;
        }

        setSaving(true);
        try {
            await updatePassword(oldPw, newPw);
            setMsg({ type: 'success', text: language === 'th' ? 'เปลี่ยนรหัสผ่านสำเร็จ' : 'Password changed successfully' });
            setOldPw('');
            setNewPw('');
            setConfirmPw('');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : (language === 'th' ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ' : 'Failed to change password');
            setMsg({ type: 'error', text: message });
        } finally {
            setSaving(false);
        }
    };

    const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';
    const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

    return (
        <AdminLayout breadcrumbItems={[{ label: language === 'th' ? 'ตั้งค่าระบบ' : 'System Settings' }]}>
            <div className="max-w-lg mx-auto">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                    {language === 'th' ? '⚙️ ตั้งค่าระบบ' : '⚙️ System Settings'}
                </h2>

                {/* Account info */}
                {user && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6 border border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            {language === 'th' ? 'บัญชีปัจจุบัน' : 'Current Account'}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <div>
                                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                    {user.firstName} {user.lastName}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                            </div>
                            <span className="ml-auto text-xs font-bold px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 uppercase">
                                {user.role}
                            </span>
                        </div>
                    </div>
                )}

                {/* Change Password */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">
                        🔒 {language === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change Password'}
                    </h3>

                    {msg && (
                        <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${msg.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                            {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
                        </div>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                            <label className={labelClass}>
                                {language === 'th' ? 'รหัสผ่านเดิม' : 'Current Password'}
                            </label>
                            <input
                                type="password"
                                value={oldPw}
                                onChange={e => setOldPw(e.target.value)}
                                className={inputClass}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>
                                {language === 'th' ? 'รหัสผ่านใหม่' : 'New Password'}
                            </label>
                            <input
                                type="password"
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                className={inputClass}
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>
                                {language === 'th' ? 'ยืนยันรหัสผ่านใหม่' : 'Confirm New Password'}
                            </label>
                            <input
                                type="password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                className={inputClass}
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {saving
                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (language === 'th' ? '💾 บันทึกรหัสผ่านใหม่' : '💾 Save New Password')}
                        </button>
                    </form>
                </div>
            </div>
        </AdminLayout>
    );
}
