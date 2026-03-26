'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import AdminLayout from '../../AdminLayout';

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    status?: string;
}

interface ModulePerm {
    view: boolean;
    create: boolean;
    delete: boolean;
}

const MODULE_DEFS = [
    { key: 'participants', icon: '👥', th: 'ฐานข้อมูลนักกีฬา', en: 'Athlete Database', desc_th: 'ข้อมูลส่วนตัว, BIB, ไซส์เสื้อ', desc_en: 'Personal info, BIB, shirt size' },
    { key: 'checkpoints', icon: '📍', th: 'จุดเช็คอิน (Checkpoints)', en: 'Checkpoints', desc_th: 'จัดการจุดและข้อมูลเช็คอิน', desc_en: 'Manage checkpoint data' },
    { key: 'rfidCheckin', icon: '📺', th: 'หน้าจอเช็คอิน (RFID)', en: 'RFID Check-in Display', desc_th: 'รันระบบหน้าจอแสดงผลหน้างาน', desc_en: 'Run on-site display system' },
    { key: 'photos', icon: '🖼️', th: 'จัดการภาพถ่าย (QR)', en: 'Photo Management (QR)', desc_th: 'ตรวจสอบรูปที่นักวิ่งอัปโหลด', desc_en: 'Review runner uploaded photos' },
    { key: 'certificates', icon: '🏅', th: 'ใบประกาศ / E-Certificate', en: 'Certificates', desc_th: 'ออกใบประกาศผลการแข่งขัน', desc_en: 'Generate race certificates' },
    { key: 'reports', icon: '📊', th: 'รายงานสถิติ', en: 'Reports & Statistics', desc_th: 'รายงานยอดผู้เข้าร่วมงาน', desc_en: 'Participant statistics report' },
    { key: 'results', icon: '🏆', th: 'ผลการแข่งขัน', en: 'Race Results', desc_th: 'จัดการและเผยแพร่ผลลัพธ์', desc_en: 'Manage and publish results' },
    { key: 'settings', icon: '⚙️', th: 'ตั้งค่าทั่วไป', en: 'General Settings', desc_th: 'จัดการข้อมูลและเครื่องมือระบบ', desc_en: 'System data and tools' },
    { key: 'userManagement', icon: '🛡️', th: 'จัดการผู้ใช้งานระบบ', en: 'User Management', desc_th: 'สร้าง/แก้ไขบัญชีผู้ใช้และสิทธิ์', desc_en: 'Create/edit user accounts and permissions' },
];

const ROLE_TEMPLATES: Record<string, { label_th: string; label_en: string; perms: Record<string, ModulePerm> }> = {
    custom: { label_th: '-- กำหนดสิทธิ์เอง (Custom) --', label_en: '-- Custom Permissions --', perms: {} },
    checkin_staff: {
        label_th: 'เจ้าหน้าที่จุด Check-in (RFID)', label_en: 'Check-in Staff (RFID)',
        perms: {
            participants: { view: true, create: false, delete: false },
            checkpoints: { view: true, create: false, delete: false },
            rfidCheckin: { view: true, create: true, delete: false },
        },
    },
    photo_admin: {
        label_th: 'เจ้าหน้าที่ตรวจรูปถ่าย (Photo Admin)', label_en: 'Photo Admin',
        perms: {
            participants: { view: true, create: false, delete: false },
            photos: { view: true, create: true, delete: true },
        },
    },
    organizer_readonly: {
        label_th: 'ผู้จัดงาน (Organizer - Read Only)', label_en: 'Organizer (Read Only)',
        perms: {
            participants: { view: true, create: false, delete: false },
            checkpoints: { view: true, create: false, delete: false },
            reports: { view: true, create: false, delete: false },
            results: { view: true, create: false, delete: false },
            certificates: { view: true, create: false, delete: false },
        },
    },
};

const DEFAULT_PERM: ModulePerm = { view: false, create: false, delete: false };

function CreateUserContent() {
    const { language } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('edit');
    const isEdit = !!editId;

    const [saving, setSaving] = useState(false);
    const [loadingUser, setLoadingUser] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Form state
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState('user');
    const [roleTemplate, setRoleTemplate] = useState('custom');
    const [allEventsAccess, setAllEventsAccess] = useState(false);
    const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
    const [modulePerms, setModulePerms] = useState<Record<string, ModulePerm>>({});

    // Campaigns dropdown
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [campaignDropOpen, setCampaignDropOpen] = useState(false);
    const [campaignSearch, setCampaignSearch] = useState('');

    // Load campaigns
    useEffect(() => {
        fetch('/api/campaigns?limit=200', { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                const list = data?.data || (Array.isArray(data) ? data : []);
                setCampaigns(list);
            })
            .catch(() => { });
    }, []);

    // Load existing user for edit
    useEffect(() => {
        if (!editId) return;
        setLoadingUser(true);
        fetch(`/api/users/${editId}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                if (data && data._id) {
                    setEmail(data.email || '');
                    setUsername(data.username || '');
                    setFirstName(data.firstName || '');
                    setLastName(data.lastName || '');
                    setPhone(data.phone || '');
                    setRole(data.role || 'user');
                    setAllEventsAccess(data.allEventsAccess || false);
                    setSelectedCampaigns((data.allowedCampaigns || []).map((c: any) => typeof c === 'string' ? c : c?._id || String(c)));
                    setModulePerms(data.modulePermissions || {});
                }
            })
            .catch(() => { })
            .finally(() => setLoadingUser(false));
    }, [editId]);

    // Toast auto-dismiss
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3500);
            return () => clearTimeout(t);
        }
    }, [toast]);

    const getPerm = useCallback((moduleKey: string): ModulePerm => {
        return modulePerms[moduleKey] || { ...DEFAULT_PERM };
    }, [modulePerms]);

    const setPerm = useCallback((moduleKey: string, field: keyof ModulePerm, value: boolean) => {
        setModulePerms(prev => {
            const current = prev[moduleKey] || { ...DEFAULT_PERM };
            return { ...prev, [moduleKey]: { ...current, [field]: value } };
        });
        setRoleTemplate('custom');
    }, []);

    const applyTemplate = (templateKey: string) => {
        setRoleTemplate(templateKey);
        if (templateKey === 'custom') return;
        const t = ROLE_TEMPLATES[templateKey];
        if (!t) return;
        const newPerms: Record<string, ModulePerm> = {};
        MODULE_DEFS.forEach(m => {
            newPerms[m.key] = t.perms[m.key] || { ...DEFAULT_PERM };
        });
        setModulePerms(newPerms);
    };

    const toggleCampaign = (id: string) => {
        setSelectedCampaigns(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const handleSave = async () => {
        if (!email) {
            setToast({ msg: language === 'th' ? 'กรุณาระบุอีเมล' : 'Please enter email', type: 'error' });
            return;
        }
        if (!isEdit && !password) {
            setToast({ msg: language === 'th' ? 'กรุณาระบุรหัสผ่าน' : 'Please enter password', type: 'error' });
            return;
        }
        setSaving(true);
        try {
            if (isEdit) {
                // Update user info
                const updateBody: any = { email, username, firstName, lastName, phone, role };
                const res1 = await fetch(`/api/users/${editId}`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(updateBody),
                });
                if (!res1.ok) {
                    const err = await res1.json();
                    throw new Error(err.message || err.error || 'Failed to update user');
                }
                // Update permissions
                const res2 = await fetch(`/api/users/${editId}/permissions`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify({ allEventsAccess, allowedCampaigns: selectedCampaigns, modulePermissions: modulePerms }),
                });
                if (!res2.ok) {
                    const err = await res2.json();
                    throw new Error(err.message || err.error || 'Failed to update permissions');
                }
                setToast({ msg: language === 'th' ? 'บันทึกสำเร็จ' : 'Saved successfully', type: 'success' });
                setTimeout(() => router.push('/admin/users'), 1000);
            } else {
                // Create new user
                const createBody: any = {
                    email, password, username: username || email.split('@')[0],
                    firstName, lastName, phone, role,
                    allEventsAccess, allowedCampaigns: selectedCampaigns, modulePermissions: modulePerms,
                };
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify(createBody),
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.message || err.error || 'Failed to create user');
                }
                setToast({ msg: language === 'th' ? 'สร้างบัญชีสำเร็จ' : 'User created successfully', type: 'success' });
                setTimeout(() => router.push('/admin/users'), 1000);
            }
        } catch (e: any) {
            setToast({ msg: e.message || 'Error', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const filteredCampaigns = campaigns.filter(c =>
        !campaignSearch || c.name?.toLowerCase().includes(campaignSearch.toLowerCase()) || c.slug?.toLowerCase().includes(campaignSearch.toLowerCase())
    );

    const th = language === 'th';

    if (loadingUser) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'จัดการผู้ใช้งาน', labelEn: 'Users', href: '/admin/users' }, { label: 'กำลังโหลด...', labelEn: 'Loading...' }]}>
                <div className="admin-card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{th ? 'กำลังโหลด...' : 'Loading...'}</div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'จัดการผู้ใช้งาน', labelEn: 'Users', href: '/admin/users' },
                { label: isEdit ? 'แก้ไขผู้ใช้' : 'สร้างผู้ใช้ใหม่', labelEn: isEdit ? 'Edit User' : 'Create User' },
            ]}
        >
            <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 40 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <button onClick={() => router.push('/admin/users')} style={{ color: '#64748b', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            ← {th ? 'กลับไปหน้ารวมผู้ใช้' : 'Back to Users'}
                        </button>
                        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {isEdit ? (th ? 'แก้ไขบัญชีผู้ใช้งาน' : 'Edit User Account') : (th ? 'สร้างบัญชีผู้ใช้งานใหม่' : 'Create New User Account')}
                        </h1>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                            {th ? 'กำหนดสิทธิ์การเข้าถึงข้อมูลอย่างละเอียด สำหรับทีมงานหรือผู้จัดงาน' : 'Configure detailed access permissions for staff or organizers'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => router.push('/admin/users')} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {th ? 'ยกเลิก' : 'Cancel'}
                        </button>
                        <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
                            {saving ? '...' : (th ? '💾 บันทึกข้อมูล' : '💾 Save')}
                        </button>
                    </div>
                </div>

                {/* Section 1: Account Info */}
                <section style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                        <div style={{ background: '#eff6ff', color: '#2563eb', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🪪</div>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>1. {th ? 'ข้อมูลบัญชีผู้ใช้' : 'Account Information'}</h2>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{th ? 'ข้อมูลพื้นฐานสำหรับการเข้าสู่ระบบ' : 'Basic info for login'}</p>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'อีเมลเข้าสู่ระบบ' : 'Login Email'} *</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@action.in.th" disabled={isEdit}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', background: isEdit ? '#f8fafc' : '#fff', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'ชื่อผู้ใช้งาน' : 'Username'}</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={th ? 'ระบุชื่อทีมงาน' : 'Display name'}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        {!isEdit && (
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'รหัสผ่าน' : 'Password'} *</label>
                                <div style={{ position: 'relative' }}>
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••"
                                        style={{ width: '100%', padding: '10px 44px 10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', padding: 4 }}>
                                        {showPassword ? '🙈' : '👁'}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'ชื่อจริง' : 'First Name'}</label>
                            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'นามสกุล' : 'Last Name'}</label>
                            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'เบอร์โทร' : 'Phone'}</label>
                            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'บทบาทหลัก (Role)' : 'Main Role'}</label>
                            <select value={role} onChange={e => setRole(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box', background: '#fff' }}>
                                <option value="user">User</option>
                                <option value="organizer">Organizer</option>
                                <option value="station">Station</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'แม่แบบสิทธิ์ (Template)' : 'Permission Template'}</label>
                            <select value={roleTemplate} onChange={e => applyTemplate(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box', background: '#fff' }}>
                                {Object.entries(ROLE_TEMPLATES).map(([key, tpl]) => (
                                    <option key={key} value={key}>{th ? tpl.label_th : tpl.label_en}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Section 2: Event Access */}
                <section style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                        <div style={{ background: '#f3e8ff', color: '#7c3aed', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📅</div>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>2. {th ? 'ขอบเขตอีเวนต์ (Event Access)' : 'Event Access Scope'}</h2>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{th ? 'เลือกงานวิ่งที่อนุญาตให้ผู้ใช้นี้เข้าถึงข้อมูลได้' : 'Select which events this user can access'}</p>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                            {th ? 'เข้าถึงทุกอีเวนต์' : 'All Events'}
                            <input type="checkbox" checked={allEventsAccess} onChange={e => setAllEventsAccess(e.target.checked)}
                                style={{ width: 18, height: 18, accentColor: '#22c55e', cursor: 'pointer' }} />
                        </label>
                    </div>

                    {!allEventsAccess && (
                        <>
                            <div style={{ position: 'relative', maxWidth: 500 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'ค้นหาและเลือกอีเวนต์' : 'Search & select events'}</label>
                                <div onClick={() => setCampaignDropOpen(!campaignDropOpen)}
                                    style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', background: '#fff', gap: 8 }}>
                                    <span style={{ color: '#94a3b8', fontSize: 14 }}>🔍</span>
                                    <input type="text" value={campaignSearch} onChange={e => { setCampaignSearch(e.target.value); setCampaignDropOpen(true); }}
                                        onClick={e => { e.stopPropagation(); setCampaignDropOpen(true); }}
                                        placeholder={th ? 'พิมพ์ชื่ออีเวนต์...' : 'Type event name...'}
                                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent' }} />
                                    <span style={{ color: '#94a3b8', fontSize: 10 }}>▼</span>
                                </div>
                                {campaignDropOpen && (
                                    <div style={{ position: 'absolute', zIndex: 50, width: '100%', marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto' }}>
                                        {filteredCampaigns.length === 0 ? (
                                            <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{th ? 'ไม่พบอีเวนต์' : 'No events found'}</div>
                                        ) : filteredCampaigns.map(c => (
                                            <label key={c._id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', gap: 10 }}
                                                className="hover:bg-slate-50">
                                                <input type="checkbox" checked={selectedCampaigns.includes(c._id)} onChange={() => toggleCampaign(c._id)}
                                                    style={{ width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer' }} />
                                                <span style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>{c.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selectedCampaigns.length > 0 && (
                                <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                        {th ? 'อีเวนต์ที่เลือกแล้ว' : 'Selected Events'} ({selectedCampaigns.length})
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {selectedCampaigns.map(id => {
                                            const c = campaigns.find(x => x._id === id);
                                            return (
                                                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, border: '1px solid #bbf7d0' }}>
                                                    {c?.name || id}
                                                    <button onClick={() => toggleCampaign(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Section 3: Module Permissions */}
                <section style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: 28, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ background: '#fff7ed', color: '#ea580c', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔓</div>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>3. {th ? 'สิทธิ์การใช้งานเมนู (Module Permissions)' : 'Module Permissions'}</h2>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{th ? 'กำหนดความสามารถในการ ดู, แก้ไข, ลบ หรือดึงข้อมูลออก ในแต่ละฟีเจอร์' : 'Set view, create, delete, export per module'}</p>
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto', padding: '0 16px 16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600, fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', borderRadius: '10px 0 0 10px' }}>{th ? 'เมนู / ฟีเจอร์' : 'Module'}</th>
                                    <th style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', width: 90 }}>
                                        {th ? 'เปิดดู' : 'View'}<br /><span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>View / Run</span>
                                    </th>
                                    <th style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', width: 90 }}>
                                        {th ? 'เพิ่ม/แก้ไข' : 'Create/Edit'}<br /><span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>Create / Edit</span>
                                    </th>
                                    <th style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: '#dc2626', width: 90, borderRadius: '0 10px 10px 0' }}>
                                        {th ? 'ลบข้อมูล' : 'Delete'}<br /><span style={{ fontSize: 10, fontWeight: 400, color: '#fca5a5' }}>Delete</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {MODULE_DEFS.map(mod => {
                                    const p = getPerm(mod.key);
                                    return (
                                        <tr key={mod.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ background: '#f1f5f9', width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{mod.icon}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{th ? mod.th : mod.en}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{th ? mod.desc_th : mod.desc_en}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            {(['view', 'create', 'delete'] as const).map(field => (
                                                <td key={field} style={{ padding: '14px 8px', textAlign: 'center' }}>
                                                    <input type="checkbox" checked={p[field]} onChange={e => setPerm(mod.key, field, e.target.checked)}
                                                        style={{ width: 20, height: 20, accentColor: field === 'delete' ? '#dc2626' : '#22c55e', cursor: 'pointer', borderRadius: 4 }} />
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Close campaign dropdown on outside click */}
            {campaignDropOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setCampaignDropOpen(false)} />
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 10000, padding: '14px 24px', borderRadius: 14,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s ease-out',
                }}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
            <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </AdminLayout>
    );
}

export default function CreateUserPage() {
    return (
        <Suspense fallback={null}>
            <CreateUserContent />
        </Suspense>
    );
}
