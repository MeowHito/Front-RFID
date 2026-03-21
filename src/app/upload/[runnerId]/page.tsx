'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';

export default function UploadPhotoPage() {
    const params = useParams();
    const runnerId = params.runnerId as string;

    const [runner, setRunner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [uploadedPhoto, setUploadedPhoto] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownload = () => {
        if (!uploadedPhoto) return;
        const link = document.createElement('a');
        link.href = uploadedPhoto;
        link.download = `BIB${runner?.bib || 'photo'}_${runner?.firstNameTh || runner?.firstName || ''}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Fetch runner info
    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRunner(data);
                } else {
                    setError('ไม่พบนักวิ่ง — Runner not found');
                }
            } catch {
                setError('เกิดข้อผิดพลาด — Connection error');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError('');

        try {
            // Resize image to max 800px and compress
            const base64 = await resizeAndCompress(file, 800, 0.8);

            // Upload to backend
            const res = await fetch(`/api/runners/${runnerId}/photo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: base64 }),
            });

            if (res.ok) {
                setUploadedPhoto(base64);
                setSuccess(true);
            } else {
                setError('อัปโหลดไม่สำเร็จ — Upload failed');
            }
        } catch {
            setError('เกิดข้อผิดพลาด — Upload error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
                fontFamily: "'Prompt', sans-serif", padding: 20,
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: 50, height: 50,
                            border: '4px solid #334155', borderTopColor: '#4ade80',
                            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                            margin: '0 auto 20px',
                        }} />
                        <p style={{ color: '#94a3b8', fontSize: 16 }}>กำลังโหลด...</p>
                    </div>
                ) : error && !runner ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>❌</div>
                        <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 800 }}>{error}</p>
                    </div>
                ) : success ? (
                    <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease-out' }}>
                        {/* Success badge */}
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: 'rgba(74,222,128,0.15)', border: '1px solid #4ade80',
                                borderRadius: 100, padding: '6px 20px',
                                color: '#4ade80', fontSize: 15, fontWeight: 800,
                            }}>✅ อัปโหลดสำเร็จ!</span>
                        </div>

                        {/* Photo card */}
                        <div style={{
                            position: 'relative', borderRadius: 24, overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                            border: '2px solid rgba(74,222,128,0.3)',
                        }}>
                            {uploadedPhoto && (
                                <img
                                    src={uploadedPhoto}
                                    alt="uploaded"
                                    style={{ width: '100%', display: 'block', maxHeight: '55vh', objectFit: 'cover' }}
                                />
                            )}
                            {/* Runner info overlay */}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'linear-gradient(to top, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.6) 70%, transparent 100%)',
                                padding: '32px 20px 20px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{
                                            fontSize: 11, fontWeight: 700, color: '#64748b',
                                            textTransform: 'uppercase', letterSpacing: 3, marginBottom: 2,
                                        }}>BIB</div>
                                        <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                                            {runner?.bib || '-'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            display: 'inline-block', background: '#ef4444',
                                            padding: '4px 14px', borderRadius: 8,
                                            fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 6,
                                        }}>{runner?.category || '-'}</div>
                                        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                                            {runner?.firstNameTh || runner?.firstName}
                                        </p>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
                                            {runner?.lastNameTh || runner?.lastName}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', margin: '12px 0 16px' }}>
                            รูปจะแสดงบนหน้าจอสแกนอัตโนมัติ
                        </p>

                        {/* Buttons */}
                        <button
                            onClick={handleDownload}
                            style={{
                                width: '100%', padding: '14px 20px', borderRadius: 14,
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                color: '#fff', fontSize: 17, fontWeight: 800,
                                border: 'none', cursor: 'pointer',
                                boxShadow: '0 8px 24px rgba(59,130,246,0.35)',
                                marginBottom: 12,
                            }}
                        >
                            💾 ดาวน์โหลดรูป
                        </button>
                        <button
                            onClick={() => { setSuccess(false); setUploadedPhoto(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            style={{
                                width: '100%', padding: '14px 20px', borderRadius: 14,
                                background: 'rgba(255,255,255,0.08)', color: '#94a3b8',
                                fontSize: 15, fontWeight: 700,
                                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                            }}
                        >
                            📸 อัปโหลดรูปใหม่
                        </button>
                    </div>
                ) : (
                    <div style={{
                        width: '100%', maxWidth: 400, textAlign: 'center',
                        animation: 'fadeIn 0.5s ease-out',
                    }}>
                        {/* Runner info card */}
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 20,
                            padding: '24px 20px', marginBottom: 24,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <div style={{
                                display: 'inline-block', background: '#ef4444',
                                padding: '6px 20px', borderRadius: 10,
                                fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 12,
                            }}>
                                {runner?.category || '-'}
                            </div>
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: '#64748b',
                                textTransform: 'uppercase', letterSpacing: 3, marginBottom: 4,
                            }}>BIB</div>
                            <div style={{
                                fontSize: 48, fontWeight: 900, color: '#fff',
                                lineHeight: 1, marginBottom: 12,
                            }}>{runner?.bib || '-'}</div>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                {runner?.firstNameTh || runner?.firstName} {runner?.lastNameTh || runner?.lastName}
                            </p>
                            {runner?.firstNameTh && (
                                <p style={{ fontSize: 14, color: '#94a3b8' }}>
                                    {runner.firstName} {runner.lastName}
                                </p>
                            )}
                        </div>

                        {/* Upload section */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />

                        {error && (
                            <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>
                        )}

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                width: '100%', padding: '16px 20px', borderRadius: 16,
                                background: uploading ? '#334155' : 'linear-gradient(135deg, #4ade80, #22c55e)',
                                color: uploading ? '#94a3b8' : '#020617',
                                fontSize: 18, fontWeight: 900, border: 'none',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                boxShadow: uploading ? 'none' : '0 10px 30px rgba(74,222,128,0.3)',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {uploading ? (
                                <>⏳ กำลังอัปโหลด...</>
                            ) : (
                                <>📸 ถ่ายรูป / เลือกรูป</>
                            )}
                        </button>

                        <p style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>
                            เลือกรูปจากกล้องหรือแกลเลอรี่
                        </p>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                * { font-family: 'Prompt', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
            `}</style>
        </>
    );
}

/** Resize an image file to max dimension and compress to JPEG base64 */
function resizeAndCompress(file: File, maxSize: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round((h * maxSize) / w);
                        w = maxSize;
                    } else {
                        w = Math.round((w * maxSize) / h);
                        h = maxSize;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
