'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ScanningRedirectPage() {
    const router = useRouter();
    const [error, setError] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured');
                if (res.ok) {
                    const data = await res.json();
                    if (data?.slug) {
                        router.replace(`/scanning/${data.slug}`);
                        return;
                    }
                    // fallback: use _id if slug missing
                    if (data?._id) {
                        router.replace(`/scanning/${data._id}`);
                        return;
                    }
                }
                setError(true);
            } catch {
                setError(true);
            }
        })();
    }, [router]);

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <div style={{
                position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: '#020617', fontFamily: "'Prompt', sans-serif",
            }}>
                {error ? (
                    <>
                        <div style={{ fontSize: 80, marginBottom: 24 }}>⚠️</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', marginBottom: 8 }}>
                            ไม่พบกิจกรรมที่กดดาว
                        </div>
                        <div style={{ fontSize: 16, color: '#94a3b8' }}>
                            กรุณาไปที่หน้า Admin Events แล้วกดดาวเลือกกิจกรรม หรือใช้ลิงก์ /scanning/ชื่อกิจกรรม โดยตรง
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: 40, height: 40,
                            border: '4px solid #334155', borderTopColor: '#4ade80',
                            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                        <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 20 }}>
                            กำลังเปลี่ยนเส้นทาง...
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
