'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';

interface HlsPlayerProps {
    src: string;
    /** Seek to this many seconds inside the manifest on load (rounded to nearest segment). */
    startSeconds?: number;
    /** Stop playback this many seconds after start (best-effort, enforced via timeupdate). */
    durationSeconds?: number;
    onLoadedMetadata?: (video: HTMLVideoElement) => void;
    className?: string;
}

/**
 * Plays HLS (.m3u8) streams in the browser.
 *
 * Uses native HLS when supported (Safari / iOS) and falls back to hls.js everywhere
 * else (Chrome / Firefox / Edge / Android Chrome). Loads hls.js lazily so the
 * library isn't pulled into pages that don't need it.
 */
export default function HlsPlayer({
    src,
    startSeconds = 0,
    durationSeconds,
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
                // Last-resort: try plain video src.
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
        <video
            ref={videoRef}
            controls
            preload="metadata"
            className={className}
            onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget)}
        />
    );
}
