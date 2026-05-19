'use client';

import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface HlsPlayerProps {
    src: string;
    /** Seek to this many seconds inside the manifest on load. */
    startSeconds?: number;
    /** Stop playback this many seconds after start (best-effort, enforced via timeupdate). */
    durationSeconds?: number;
    /** Render a live Thailand-time clock overlay on the top-left (mimics a security cam). */
    showTimestamp?: boolean;
    /** When false, set controlsList="nodownload" + disable PiP + block context menu so
     *  viewers can't trivially save the video. (Admin enforcement is still via signed URLs.) */
    allowDownload?: boolean;
    onLoadedMetadata?: (video: HTMLVideoElement) => void;
    className?: string;
}

/**
 * Plays HLS (.m3u8) streams in the browser. Uses native HLS on Safari and falls
 * back to hls.js everywhere else. hls.js is lazy-loaded so non-video pages don't pay
 * the bundle cost.
 *
 * Optional features:
 *   - Top-left timestamp overlay (Thailand timezone, ticks every second)
 *   - Download/PiP/context-menu suppression when allowDownload === false
 */
export default function HlsPlayer({
    src,
    startSeconds = 0,
    durationSeconds,
    showTimestamp = false,
    allowDownload = true,
    onLoadedMetadata,
    className,
}: HlsPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        let cancelled = false;

        // Safari has native HLS — no library needed.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            if (startSeconds > 0) {
                const onMeta = () => {
                    if (!cancelled) video.currentTime = startSeconds;
                    video.removeEventListener('loadedmetadata', onMeta);
                };
                video.addEventListener('loadedmetadata', onMeta);
            }
            return () => {
                cancelled = true;
                video.removeAttribute('src');
                video.load();
            };
        }

        // Everywhere else: load hls.js lazily.
        let hls: Hls | null = null;
        (async () => {
            const mod = await import('hls.js');
            if (cancelled) return;
            const HlsCtor = mod.default;
            if (!HlsCtor.isSupported()) {
                video.src = src;
                return;
            }
            hls = new HlsCtor({
                lowLatencyMode: false,
                backBufferLength: 30,
            });
            hls.loadSource(src);
            hls.attachMedia(video);
            hlsRef.current = hls;

            if (startSeconds > 0) {
                hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
                    if (!cancelled) video.currentTime = startSeconds;
                });
            }
        })();

        return () => {
            cancelled = true;
            if (hls) {
                hls.destroy();
                hls = null;
            }
            hlsRef.current = null;
            video.removeAttribute('src');
            video.load();
        };
    }, [src, startSeconds]);

    // Best-effort clip end: pause when we hit start + duration.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !durationSeconds || durationSeconds <= 0) return;
        const stopAt = startSeconds + durationSeconds;
        const onTime = () => {
            if (video.currentTime >= stopAt) {
                video.pause();
            }
        };
        video.addEventListener('timeupdate', onTime);
        return () => video.removeEventListener('timeupdate', onTime);
    }, [startSeconds, durationSeconds]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <video
                ref={videoRef}
                controls
                preload="metadata"
                playsInline
                className={className}
                controlsList={allowDownload ? undefined : 'nodownload noplaybackrate'}
                disablePictureInPicture={!allowDownload}
                onContextMenu={(e) => { if (!allowDownload) e.preventDefault(); }}
                onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget)}
            />
            {showTimestamp && <CctvTimestampOverlay />}
        </div>
    );
}

/**
 * Live wall-clock overlay (Asia/Bangkok). Re-renders every second.
 * Renders inside an absolutely-positioned div so the parent must be `position: relative`.
 */
export function CctvTimestampOverlay() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    return (
        <div
            style={{
                position: 'absolute',
                top: 8,
                left: 12,
                padding: '4px 10px',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 4,
                letterSpacing: 0.5,
                pointerEvents: 'none',
                zIndex: 10,
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
        >
            <span style={{ color: '#ef4444', marginRight: 6 }}>●</span>
            {formatter.format(now)}
            <span style={{ marginLeft: 6, fontSize: 10, color: '#cbd5e1' }}>ICT</span>
        </div>
    );
}
