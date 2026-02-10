'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropModalProps {
    isOpen: boolean;
    imageSrc: string; // original base64 or URL
    onCrop: (croppedDataUrl: string) => void;
    onCancel: () => void;
    aspectRatio?: number; // default 2 (16:8)
}

export default function ImageCropModal({
    isOpen,
    imageSrc,
    onCrop,
    onCancel,
    aspectRatio = 2,
}: ImageCropModalProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    const [imgLoaded, setImgLoaded] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

    // Load image
    useEffect(() => {
        if (!isOpen || !imageSrc) return;
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            setImgLoaded(true);
            // Calculate initial scale: fit image to cover the crop area
            if (containerRef.current) {
                const cw = containerRef.current.clientWidth;
                const ch = cw / aspectRatio;
                setContainerSize({ w: cw, h: ch });

                const scaleX = cw / img.width;
                const scaleY = ch / img.height;
                const initialScale = Math.max(scaleX, scaleY);
                setScale(initialScale);
                // Center the image
                const scaledW = img.width * initialScale;
                const scaledH = img.height * initialScale;
                setOffset({
                    x: (cw - scaledW) / 2,
                    y: (ch - scaledH) / 2,
                });
            }
        };
        img.src = imageSrc;
        return () => {
            setImgLoaded(false);
            setOffset({ x: 0, y: 0 });
            setScale(1);
        };
    }, [isOpen, imageSrc, aspectRatio]);

    // Draw on canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !imgLoaded) return;

        const cw = containerSize.w;
        const ch = containerSize.h;
        canvas.width = cw;
        canvas.height = ch;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, cw, ch);

        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, offset.x, offset.y, drawW, drawH);
    }, [imgLoaded, offset, scale, containerSize]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Clamp offset so image always covers the crop area
    const clampOffset = (ox: number, oy: number): { x: number; y: number } => {
        const img = imgRef.current;
        if (!img) return { x: ox, y: oy };
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const cw = containerSize.w;
        const ch = containerSize.h;

        let x = ox;
        let y = oy;

        // Don't allow gaps
        if (x > 0) x = 0;
        if (y > 0) y = 0;
        if (x + drawW < cw) x = cw - drawW;
        if (y + drawH < ch) y = ch - drawH;

        return { x, y };
    };

    // Mouse events
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        const newOffset = clampOffset(
            e.clientX - dragStart.x,
            e.clientY - dragStart.y
        );
        setOffset(newOffset);
    };

    const handleMouseUp = () => setDragging(false);

    // Touch events
    const handleTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        setDragging(true);
        setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!dragging) return;
        const t = e.touches[0];
        const newOffset = clampOffset(
            t.clientX - dragStart.x,
            t.clientY - dragStart.y
        );
        setOffset(newOffset);
    };

    const handleTouchEnd = () => setDragging(false);

    // Zoom
    const handleZoom = (delta: number) => {
        const img = imgRef.current;
        if (!img) return;
        const newScale = Math.max(
            Math.max(containerSize.w / img.width, containerSize.h / img.height),
            scale + delta
        );
        // Adjust offset to zoom toward center
        const cw = containerSize.w;
        const ch = containerSize.h;
        const cx = cw / 2;
        const cy = ch / 2;
        const ratio = newScale / scale;
        const newOffset = clampOffset(
            cx - (cx - offset.x) * ratio,
            cy - (cy - offset.y) * ratio
        );
        setScale(newScale);
        setOffset(newOffset);
    };

    // Export crop
    const handleCrop = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Export at higher resolution for quality
        const exportCanvas = document.createElement('canvas');
        const maxW = 1200;
        const exportW = Math.min(containerSize.w * 2, maxW);
        const exportH = exportW / aspectRatio;
        exportCanvas.width = exportW;
        exportCanvas.height = exportH;

        const ctx = exportCanvas.getContext('2d');
        if (!ctx || !imgRef.current) return;

        const img = imgRef.current;
        const displayScale = exportW / containerSize.w;

        ctx.drawImage(
            img,
            offset.x * displayScale,
            offset.y * displayScale,
            img.width * scale * displayScale,
            img.height * scale * displayScale
        );

        const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.85);
        onCrop(dataUrl);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onCancel}>
            <div style={{
                background: '#fff', borderRadius: 8, padding: 16,
                maxWidth: 700, width: '95%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 12,
                }}>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#333' }}>
                        ✂️ ครอปรูปภาพ (16:8)
                    </h3>
                    <button onClick={onCancel} style={{
                        background: 'none', border: 'none',
                        fontSize: 20, cursor: 'pointer', color: '#999',
                    }}>×</button>
                </div>

                {/* Hint */}
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px 0' }}>
                    🖱️ ลากเมาส์เพื่อปรับตำแหน่งรูป / Drag to reposition
                </p>

                {/* Canvas area */}
                <div
                    ref={containerRef}
                    style={{
                        width: '100%', aspectRatio: `${aspectRatio}`,
                        overflow: 'hidden', borderRadius: 6,
                        border: '2px solid #ddd', cursor: dragging ? 'grabbing' : 'grab',
                        position: 'relative', background: '#1a1a1a',
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <canvas
                        ref={canvasRef}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                </div>

                {/* Zoom controls */}
                <div style={{
                    display: 'flex', justifyContent: 'center',
                    gap: 12, margin: '12px 0',
                    alignItems: 'center',
                }}>
                    <button onClick={() => handleZoom(-0.05)} style={{
                        padding: '4px 14px', background: '#eee', border: '1px solid #ccc',
                        borderRadius: 4, cursor: 'pointer', fontSize: 16, fontWeight: 'bold',
                    }}>−</button>
                    <span style={{ fontSize: 12, color: '#666', minWidth: 60, textAlign: 'center' }}>
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={() => handleZoom(0.05)} style={{
                        padding: '4px 14px', background: '#eee', border: '1px solid #ccc',
                        borderRadius: 4, cursor: 'pointer', fontSize: 16, fontWeight: 'bold',
                    }}>+</button>
                </div>

                {/* Actions */}
                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8,
                }}>
                    <button onClick={onCancel} style={{
                        padding: '8px 20px', background: '#ddd', border: 'none',
                        borderRadius: 4, cursor: 'pointer', fontSize: 14,
                        fontFamily: "'Prompt', sans-serif",
                    }}>ยกเลิก</button>
                    <button onClick={handleCrop} style={{
                        padding: '8px 20px', background: '#00a65a', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: 'pointer',
                        fontSize: 14, fontWeight: 600,
                        fontFamily: "'Prompt', sans-serif",
                    }}>✓ ใช้รูปนี้</button>
                </div>
            </div>
        </div>
    );
}
