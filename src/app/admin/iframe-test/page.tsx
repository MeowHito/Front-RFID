'use client';

import { useState } from 'react';
import AdminLayout from '../AdminLayout';

export default function IframeTestPage() {
    const [url, setUrl] = useState(
        'https://nc.racetigertiming.com/live/portal?id=49c600cca11b4b9f959a577d7b445721&partner=000001&portalId=1'
    );
    const [inputVal, setInputVal] = useState(url);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    return (
        <AdminLayout>
            <div style={{ padding: 24 }}>
                <h2 style={{ marginBottom: 16, fontWeight: 700, fontSize: 20 }}>
                    RaceTiger Live Portal — iframe Test
                </h2>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 6,
                            border: '1px solid #cbd5e1', fontSize: 13,
                        }}
                        placeholder="Live portal URL"
                    />
                    <button
                        onClick={() => { setLoaded(false); setError(false); setUrl(inputVal); }}
                        style={{
                            padding: '8px 20px', borderRadius: 6, background: '#2563eb',
                            color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
                        }}
                    >
                        Load
                    </button>
                </div>

                {error && (
                    <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: 12, color: '#dc2626' }}>
                        ❌ iframe ถูก block หรือโหลดไม่ได้ — ลอง Open in New Tab แทน
                    </div>
                )}
                {loaded && !error && (
                    <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 12, color: '#16a34a' }}>
                        ✅ โหลดสำเร็จ — ฝัง iframe ได้
                    </div>
                )}

                <div style={{ border: '2px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#f8fafc' }}>
                    <iframe
                        key={url}
                        src={url}
                        width="100%"
                        height="700px"
                        frameBorder="0"
                        onLoad={() => setLoaded(true)}
                        onError={() => setError(true)}
                        style={{ display: 'block' }}
                        title="RaceTiger Live Portal"
                    />
                </div>

                <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                    หากหน้าขาวหรือ Error Console → iframe ถูก block ด้วย CSP/X-Frame-Options
                    &nbsp;|&nbsp;
                    <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                        เปิดใน New Tab ↗
                    </a>
                </div>
            </div>
        </AdminLayout>
    );
}
