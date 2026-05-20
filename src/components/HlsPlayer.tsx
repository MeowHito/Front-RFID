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
    /** Live HLS mode — enables autoplay+muted (autoplay rules), tunes hls.js for
     *  low-latency live playback, and skips seek/clip logic. Pass `true` for live feeds. */
    live?: boolean;
    onLoadedMetadata?: (video: HTMLVideoElement) => void;
    className?: string;
}

/**
 * Plays HLS (.m3u8) streams in the browser. Uses native HLS on Safari and falls
 * back to hls.js everywhere else. hls.js is lazy-loaded so non-video pages don't pay
 * the bundle cost.
 *
 * Optional features:
 *   - `live` flag for live feeds (autoplay + tuned hls.js config)
 *   - Top-left timestamp overlay (Thailand timezone, ticks every second)
 *   - Download/PiP/context-menu suppression when allowDownload === false
 *   - Inline fatal-error overlay so debugging doesn't require DevTools
 */
export default function HlsPlayer({
    src,
    startSeconds = 0,
    durationSeconds,
    showTimestamp = false,
    allowDownload = true,
    live = false,
    onLoadedMetadata,
    className,
}: HlsPlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [fatalError, setFatalError] = useState<string | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        let cancelled = false;
        setFatalError(null);

        // Safari has native HLS — no library needed.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            if (live) {
                video.muted = true; // browsers block unmuted autoplay
                video.play().catch(() => { /* autoplay blocked — user must tap */ });
            } else if (startSeconds > 0) {
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
                setFatalError('Browser does not support MSE/HLS');
                video.src = src;
                return;
            }
            // Live and VOD need different tuning:
            //   - Live: short liveSyncDuration so player stays near the edge,
            //           minimal backBufferLength to avoid memory bloat on long sessions,
            //           lowLatencyMode tries LL-HLS chunked transfer when available.
            //   - VOD: larger buffer is fine; no live tuning. Pin startPosition so hls.js
            //           does NOT snap to the live edge when the underlying manifest is
            //           still being recorded (no #EXT-X-ENDLIST). Without this, opening a
            //           still-recording clip would always start at "now" instead of the
            //           scan moment we asked for.
            const config = live
                ? { lowLatencyMode: true, liveSyncDuration: 2, liveMaxLatencyDuration: 10, backBufferLength: 10 }
                : { lowLatencyMode: false, backBufferLength: 30, startPosition: Math.max(0, startSeconds) };
            hls = new HlsCtor(config);
            hls.loadSource(src);
            hls.attachMedia(video);
            hlsRef.current = hls;

            // Wait for the first parsed manifest, then either autoplay (live) or seek (VOD)
            hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
                if (cancelled) return;
                if (live) {
                    video.muted = true;
                    video.play().catch(() => { /* autoplay blocked */ });
                } else if (startSeconds > 0) {
                    // Force the seek even though startPosition was already passed in the
                    // config — covers VOD streams where the manifest reports duration but
                    // hls.js still defaults to 0, and live-flagged manifests where the
                    // engine would otherwise snap to the latest segment.
                    try { video.currentTime = startSeconds; } catch { /* ignore */ }
                }
            });

            // Surface fatal HLS errors so the user can see what went wrong without DevTools.
            // Common ones: networkError (CORS / 404 / TLS), mediaError (codec mismatch).
            hls.on(HlsCtor.Events.ERROR, (_evt: unknown, data: { fatal?: boolean; type?: string; details?: string; reason?: string }) => {
                if (data?.fatal) {
                    const msg = [data.type, data.details, data.reason].filter(Boolean).join(' · ');
                    setFatalError(msg || 'HLS playback error');
                }
            });
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
    }, [src, startSeconds, live]);

    // Best-effort clip end: pause when we hit start + duration. (VOD only)
    useEffect(() => {
        if (live) return;
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
    }, [startSeconds, durationSeconds, live]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <video
                ref={videoRef}
                controls
                preload={live ? 'auto' : 'metadata'}
                playsInline
                autoPlay={live || undefined}
                muted={live || undefined}
                className={className}
                controlsList={allowDownload ? undefined : 'nodownload noplaybackrate'}
                disablePictureInPicture={!allowDownload}
                onContextMenu={(e) => { if (!allowDownload) e.preventDefault(); }}
                onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget)}
            />
            {showTimestamp && <CctvTimestampOverlay />}
            {fatalError && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)',
                    color: '#fecaca', fontSize: 12, padding: 16, textAlign: 'center',
                    pointerEvents: 'none',
                }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>HLS Playback Failed</div>
                    <div style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>{fatalError}</div>
                    <div style={{ marginTop: 8, fontSize: 10, color: '#cbd5e1' }}>
                        ตรวจสอบ: CORS, SSL cert, MediaMTX HLS muxer, network access
                    </div>
                </div>
            )}
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
