'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import { authHeaders } from '@/lib/authHeaders';
import AdminLayout from '../../AdminLayout';

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    status?: string;
}

const ROLE_OPTIONS: { value: string; label_th: string; label_en: string; description_th: string; description_en: string }[] = [
    {
        value: 'admin',
        label_th: 'Admin (ผู้ดูแลระบบ)',
        label_en: 'Admin (Full Access)',
        description_th: 'เข้าถึงและจัดการทุกฟีเจอร์ของระบบได้',
        description_en: 'Full access — can manage everything',
    },
    {
        value: 'organizer',
        label_th: 'Organizer (ผู้จัดงาน)',
        label_en: 'Organizer (View Only)',
        description_th: 'ดูข้อมูลของอีเวนต์ที่กำหนดให้เท่านั้น (ห้ามแก้ไข/เพิ่ม/ลบ)',
        description_en: 'View-only access to assigned events. Cannot edit, add, or delete.',
    },
    {
        value: 'station',
        label_th: 'Station (จุดเช็คอิน)',
        label_en: 'Station (Checkpoint Monitor)',
        description_th: 'ใช้งานได้เฉพาะหน้า Checkpoint Monitor ของอีเวนต์ที่กำหนดเท่านั้น',
        description_en: 'Can ONLY access Checkpoint Monitor for assigned events.',
    },
    {
        value: 'user',
        label_th: 'User (ผู้ใช้ทั่วไป)',
        label_en: 'User (Public)',
        description_th: 'บัญชีผู้ใช้ทั่วไป ไม่มีสิทธิ์เข้าหลังบ้าน',
        description_en: 'Regular user account. No admin panel access.',
    },
];

function roleNeedsEvents(role: string): boolean {
    return role === 'organizer' || role === 'station';
}

function CreateUserContent() {
    const { language } = useLanguage();
    const { user: currentUser, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('edit');
    const isEdit = !!editId;
    const th = language === 'th';

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
    const [role, setRole] = useState('organizer');
    const [allEventsAccess, setAllEventsAccess] = useState(false);
    const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

    // Campaigns dropdown
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [campaignSearch, setCampaignSearch] = useState('');

    const isAdminGuard = currentUser?.role === 'admin' || currentUser?.role === 'admin_master';
    const needEvents = roleNeedsEvents(role);

    // Guard the page client-side — server still enforces this
    useEffect(() => {
        if (authLoading) return;
        if (!isAdminGuard) router.push('/admin');
    }, [authLoading, isAdminGuard, router]);

    // Load campaigns
    useEffect(() => {
        fetch('/api/campaigns?limit=200', { cache: 'no-store', headers: authHeaders() })
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
        fetch(`/api/users/${editId}`, { cache: 'no-store', headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data && data._id) {
                    setEmail(data.email || '');
                    setUsername(data.username || '');
                    setFirstName(data.firstName || '');
                    setLastName(data.lastName || '');
                    setPhone(data.phone || '');
                    setRole(data.role || 'organizer');
                    setAllEventsAccess(data.allEventsAccess || false);
                    setSelectedCampaigns((data.allowedCampaigns || []).map((c: any) => typeof c === 'string' ? c : c?._id || String(c)));
                }
            })
            .catch(() => setToast({ msg: th ? 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ' : 'Failed to load user', type: 'error' }))
            .finally(() => setLoadingUser(false));
    }, [editId, th]);

    // Toast auto-dismiss
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3500);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // When role changes to admin/user, clear event scope (backend will too)
    useEffect(() => {
        if (role === 'admin') {
            setAllEventsAccess(true);
            setSelectedCampaigns([]);
        } else if (role === 'user') {
            setAllEventsAccess(false);
            setSelectedCampaigns([]);
        }
    }, [role]);

    const toggleCampaign = (id: string) => {
        setSelectedCampaigns(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const validate = (): string | null => {
        if (!email.trim()) return th ? 'กรุณาระบุอีเมล' : 'Please enter email';
        if (!isEdit && password.length < 6) {
            return th ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' : 'Password must be at least 6 characters';
        }
        if (needEvents && selectedCampaigns.length === 0) {
            return th
                ? 'กรุณาเลือกอีเวนต์อย่างน้อย 1 รายการ สำหรับบทบาทนี้'
                : 'Please assign at least one event for this role';
        }
        return null;
    };

    const handleSave = async () => {
        const err = validate();
        if (err) {
            setToast({ msg: err, type: 'error' });
            return;
        }

        setSaving(true);
        try {
            if (isEdit) {
                const updateBody: any = { email, username, firstName, lastName, phone, role };
                const res1 = await fetch(`/api/users/${editId}`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(updateBody),
                });
                if (!res1.ok) {
                    const errData = await res1.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error || 'Failed to update user');
                }
                const res2 = await fetch(`/api/users/${editId}/permissions`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify({ allowedCampaigns: selectedCampaigns }),
                });
                if (!res2.ok) {
                    const errData = await res2.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error || 'Failed to update permissions');
                }
                setToast({ msg: th ? 'บันทึกสำเร็จ' : 'Saved successfully', type: 'success' });
                setTimeout(() => router.push('/admin/users'), 800);
            } else {
                const createBody: any = {
                    email,
                    password,
                    username: username || email.split('@')[0],
                    firstName,
                    lastName,
                    phone,
                    role,
                    allEventsAccess: role === 'admin' ? true : false,
                    allowedCampaigns: role === 'admin' ? [] : selectedCampaigns,
                };
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify(createBody),
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error || 'Failed to create user');
                }
                setToast({ msg: th ? 'สร้างบัญชีสำเร็จ' : 'User created successfully', type: 'success' });
                setTimeout(() => router.push('/admin/users'), 800);
            }
        } catch (e: any) {
            setToast({ msg: e.message || 'Error', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const filteredCampaigns = campaigns.filter(c =>
        !campaignSearch ||
        c.name?.toLowerCase().includes(campaignSearch.toLowerCase()) ||
        c.slug?.toLowerCase().includes(campaignSearch.toLowerCase())
    );

    const currentRoleInfo = ROLE_OPTIONS.find(r => r.value === role);

    if (loadingUser || authLoading) {
        return (
            <AdminLayout
                breadcrumbItems={[
                    { label: 'จัดการผู้ใช้งาน', labelEn: 'Users', href: '/admin/users' },
                    { label: 'กำลังโหลด...', labelEn: 'Loading...' },
                ]}
            >
                <div className="admin-card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    {th ? 'กำลังโหลด...' : 'Loading...'}
                </div>
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
                            {th
                                ? 'กำหนดบทบาทและขอบเขตอีเวนต์ — สิทธิ์ภายในจะถูกกำหนดอัตโนมัติตามบทบาท'
                                : 'Assign role and event scope — module permissions are derived automatically from the role.'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => router.push('/admin/users')} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {th ? 'ยกเลิก' : 'Cancel'}
                        </button>
                        <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
                            {saving ? '...' : (th ? '💾 บันทึก' : '💾 Save')}
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
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@example.com" disabled={isEdit}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', background: isEdit ? '#f8fafc' : '#fff', boxSizing: 'border-box', color: '#0f172a' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'ชื่อผู้ใช้งาน' : 'Username'}</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={th ? 'ระบุชื่อทีมงาน' : 'Display name'}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }} />
                        </div>
                        {!isEdit && (
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'รหัสผ่าน' : 'Password'} *</label>
                                <div style={{ position: 'relative' }}>
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร"
                                        style={{ width: '100%', padding: '10px 44px 10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }} />
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
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'นามสกุล' : 'Last Name'}</label>
                            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'เบอร์โทร' : 'Phone'}</label>
                            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{th ? 'บทบาทหลัก (Role)' : 'Main Role'} *</label>
                            <select value={role} onChange={e => setRole(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box', background: '#fff', color: '#0f172a' }}>
                                {ROLE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{th ? opt.label_th : opt.label_en}</option>
                                ))}
                            </select>
                            {currentRoleInfo && (
                                <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{th ? '📋 รายละเอียดสิทธิ์:' : '📋 Permission scope:'}</span>{' '}
                                    {th ? currentRoleInfo.description_th : currentRoleInfo.description_en}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Section 2: Event Access (organizer/station only) */}
                {needEvents && (
                    <section style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                            <div style={{ background: '#f3e8ff', color: '#7c3aed', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📅</div>
                            <div style={{ flex: 1 }}>
                                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>2. {th ? 'ขอบเขตอีเวนต์ (Event Access)' : 'Event Access Scope'}</h2>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                                    {th
                                        ? 'เลือกอีเวนต์ที่อนุญาตให้ผู้ใช้รายนี้เข้าถึง — สามารถเลือกได้หลายรายการ'
                                        : 'Select which events this user can access — multiple allowed'}
                                </p>
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <input
                                type="text"
                                value={campaignSearch}
                                onChange={e => setCampaignSearch(e.target.value)}
                                placeholder={th ? '🔍 ค้นหาชื่ออีเวนต์...' : '🔍 Search events...'}
                                style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#fff' }}
                            />
                        </div>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, maxHeight: 320, overflowY: 'auto', background: '#fff' }}>
                            {filteredCampaigns.length === 0 ? (
                                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                    {th ? 'ไม่พบอีเวนต์' : 'No events found'}
                                </div>
                            ) : filteredCampaigns.map(c => {
                                const checked = selectedCampaigns.includes(c._id);
                                return (
                                    <label key={c._id}
                                        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', gap: 12, background: checked ? '#f0fdf4' : '#fff' }}
                                    >
                                        <input type="checkbox" checked={checked} onChange={() => toggleCampaign(c._id)}
                                            style={{ width: 18, height: 18, accentColor: '#22c55e', cursor: 'pointer' }} />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 }}>{c.name}</span>
                                        {c.status && (
                                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                                                {c.status}
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>

                        {selectedCampaigns.length > 0 && (
                            <div style={{ marginTop: 16, padding: '12px 16px', background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12, color: '#166534', fontWeight: 700 }}>
                                ✅ {th ? `เลือกแล้ว ${selectedCampaigns.length} อีเวนต์` : `${selectedCampaigns.length} event(s) selected`}
                                {selectedCampaigns.length > 1 && (
                                    <span style={{ fontWeight: 400, marginLeft: 6 }}>
                                        — {th
                                            ? 'ผู้ใช้จะเห็นหน้าเลือกอีเวนต์เพื่อกดดาวเลือกงานเอง'
                                            : 'User will see an event picker to star their active event'}
                                    </span>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* Section info for admin role */}
                {role === 'admin' && (
                    <section style={{ background: '#fef2f2', borderRadius: 16, border: '1px solid #fecaca', padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#991b1b' }}>
                            <div style={{ fontSize: 24 }}>🛡️</div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 14 }}>
                                    {th ? 'ผู้ใช้นี้จะได้สิทธิ์ Admin เต็มรูปแบบ' : 'This user will receive FULL admin privileges'}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>
                                    {th
                                        ? 'สามารถเข้าถึง/แก้ไข/ลบข้อมูลของทุกอีเวนต์ในระบบได้ — ไม่จำเป็นต้องเลือกอีเวนต์'
                                        : 'Can view, edit, and delete data across all events. Event scope is not required.'}
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>

            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 10000, padding: '14px 24px', borderRadius: 14,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                }}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
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
