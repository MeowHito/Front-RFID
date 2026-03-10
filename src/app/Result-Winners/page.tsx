'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResultWinnersRedirectPage() {
    const router = useRouter();
    const [error, setError] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.slug) {
                        router.replace(`/Result-Winners/${data.slug}`);
                        return;
                    }
                    if (data?._id) {
                        router.replace(`/Result-Winners/${data._id}`);
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
        <div style={{
            fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a',
            height: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
        }}>
            {error ? (
                <>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>⚠️</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', marginBottom: 8 }}>
                        ไม่พบกิจกรรมที่กดดาว
                    </div>
                    <div style={{ fontSize: 16, color: '#94a3b8' }}>
                        กรุณาไปที่หน้า Admin Events แล้วกดดาวเลือกกิจกรรม หรือใช้ลิงก์ /Result-Winners/ชื่อกิจกรรม โดยตรง
                    </div>
                </>
            ) : (
                <>
                    <div style={{
                        width: 40, height: 40,
                        border: '4px solid #334155', borderTopColor: '#22c55e',
                        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                    <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 20 }}>
                        กำลังเปลี่ยนเส้นทาง...
                    </div>
                </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
