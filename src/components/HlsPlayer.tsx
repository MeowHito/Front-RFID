'use client';

import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface HlsPlayerProps {
    src: string;
    /** Seek to this many seconds inside the manifest on load. */
    startSeconds?: number;
    /** Stop playback this many seconds after start (best-effort, enforced via timeupdate). */
    durationSeconds?: number;
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
 *   - Download/PiP/context-menu suppression when allowDownload === false
 *   - Inline fatal-error overlay so debugging doesn't require DevTools
 */
export default function HlsPlayer({
    src,
    startSeconds = 0,
    durationSeconds,
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

        // Progressive MP4 (fragmented or otherwise) — let the browser handle it directly.
        // We detect by extension on the URL path (ignoring querystring). Beta archived
        // recordings now point s3MasterManifestUrl at the fmp4 file in S3 so the player
        // gets the full timeline with HTTP Range seeking instead of a 7-second LL-HLS
        // rolling window that 404s post-unpublish.
        const urlPath = (() => {
            try { return new URL(src, window.location.href).pathname.toLowerCase(); }
            catch { return src.toLowerCase(); }
        })();
        const isMp4 = urlPath.endsWith('.mp4') || urlPath.endsWith('.m4v') || urlPath.endsWith('.webm');
        if (isMp4) {
            // preload strategy when startSeconds > 0 (Beta fmp4 from S3, typical for the
            // /runner/[id] flow): MediaMTX writes fragmented mp4 with no seek index, so
            // preload="auto" makes the browser greedily download from byte 0 forward
            // until it reaches the requested time — that can mean pulling tens of MB
            // before playback starts on a 95 MB clip.
            //
            // preload="metadata" makes the browser fetch ftyp+moov first, then issue
            // a targeted Range for the fragment near the requested seek position. On
            // a 100 MB / 6-minute fmp4 that drops time-to-first-frame from 30+ seconds
            // to a couple of seconds.
            //
            // For startSeconds == 0 (live preview from the modal open) we keep "auto"
            // so playback begins as soon as decoding can.
            video.preload = startSeconds > 0 ? 'metadata' : 'auto';
            video.src = src;
            const tryPlay = () => {
                video.muted = true;
                video.play().catch(() => { /* autoplay blocked → user clicks play manually */ });
            };
            if (startSeconds > 0) {
                const onMeta = () => {
                    if (!cancelled) {
                        try { video.currentTime = startSeconds; } catch { /* ignore */ }
                        tryPlay();
                    }
                    video.removeEventListener('loadedmetadata', onMeta);
                };
                video.addEventListener('loadedmetadata', onMeta);
            } else {
                const onCan = () => {
                    if (!cancelled) tryPlay();
                    video.removeEventListener('loadeddata', onCan);
                };
                video.addEventListener('loadeddata', onCan);
            }
            return () => {
                cancelled = true;
                video.removeAttribute('src');
                video.load();
            };
        }

        // Safari has native HLS — no library needed.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.preload = 'auto';
            video.src = src;
            const tryPlay = () => {
                video.muted = true;
                video.play().catch(() => { /* autoplay blocked — user must tap */ });
            };
            if (live) {
                tryPlay();
            } else {
                const onMeta = () => {
                    if (cancelled) return;
                    if (startSeconds > 0) {
                        try { video.currentTime = startSeconds; } catch { /* ignore */ }
                    }
                    tryPlay();
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
            // Tuned for the MPEGTS / s3-sync pipeline:
            //   - segments are 6 s .ts on S3 with Cache-Control: max-age=31536000 immutable
            //   - manifest is index.m3u8 on S3 with Cache-Control: max-age=2
            //   - S3 edge gives ~30-60 ms RTT from most regions
            // The aggressive prefetch / parallel fragment fetch flags below cut time-to-
            // first-frame from ~600 ms (default hls.js cold start) to <50 ms once the
            // manifest cache is warm.
            const config = live
                ? {
                    lowLatencyMode: true,
                    liveSyncDuration: 2,
                    liveMaxLatencyDuration: 10,
                    backBufferLength: 10,
                    autoStartLoad: true,
                    startFragPrefetch: true,
                    // Don't burn the first request on ABR probing — go straight to playback.
                    abrEwmaDefaultEstimate: 5_000_000, // 5 Mbps initial guess
                }
                : {
                    lowLatencyMode: false,
                    backBufferLength: 30,
                    startPosition: Math.max(0, startSeconds),
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    autoStartLoad: true,
                    // Pre-fetch the next fragment while the current one decodes — turns a
                    // mid-clip seek into a single round-trip instead of two.
                    startFragPrefetch: true,
                    // Skip ABR cold-start delay on VOD: assume the segment will arrive
                    // quickly (S3 STANDARD ~30-60 ms RTT). If the guess is wrong, ABR
                    // corrects within one fragment.
                    abrEwmaDefaultEstimate: 5_000_000,
                };
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
                } else {
                    if (startSeconds > 0) {
                        // Force the seek even though startPosition was already passed in the
                        // config — covers VOD streams where the manifest reports duration but
                        // hls.js still defaults to 0, and live-flagged manifests where the
                        // engine would otherwise snap to the latest segment.
                        try { video.currentTime = startSeconds; } catch { /* ignore */ }
                    }
                    // Muted autoplay so playback begins immediately when the modal opens
                    // rather than after the user clicks the play button. Browsers allow
                    // muted autoplay without a gesture.
                    video.muted = true;
                    video.play().catch(() => { /* autoplay blocked — user clicks play */ });
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

