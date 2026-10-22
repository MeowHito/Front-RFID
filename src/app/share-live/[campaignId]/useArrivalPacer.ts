'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Turns batched arrivals into a steady stream an announcer can read.
 *
 * Checkpoint passes reach us in lumps — RaceTiger is polled, so at SPONSOR RUN 2026 the
 * FINISH list grew by 30–99 runners at once every 1–2 minutes. Shown as-is, a whole lump
 * lands on screen in one frame and the announcer cannot tell who is new. This releases
 * the lump one runner at a time, in crossing order, spread over roughly the time until
 * the next lump is expected — so the stream stays continuous without falling behind.
 *
 * Whatever is on the list the first time a checkpoint loads is history, not news: it is
 * shown straight away and never animated.
 */

const MIN_GAP_MS = 800;
const MAX_GAP_MS = 4000;
const TICK_MS = 200;
// Past this many waiting, the oldest are shown at once rather than drip-fed minutes late.
const MAX_QUEUE = 60;
const FEED_MAX = 150;
const DEFAULT_BATCH_INTERVAL_MS = 30000;

export interface PacerOptions {
    /** Runners the current filters hide are released instantly instead of taking a turn. */
    isVisible: (key: string) => boolean;
    paused: boolean;
    onReveal?: (key: string) => void;
}

export interface FeedEntry {
    key: string;
    /** Wall-clock ms it was released at (drives the "new" highlight). */
    at: number;
}

export interface PacerState {
    /** Released runners, newest first. */
    feed: FeedEntry[];
    queued: number;
    flush: () => void;
}

/**
 * `arrivals`: keys of every runner that has passed, oldest crossing first (null while the
 * checkpoint's first answer is still loading).
 * `resetKey`: change it (e.g. the checkpoint) to start over with a fresh history.
 *
 * All bookkeeping runs on one short timer that reads the latest inputs from refs, so a new
 * answer is picked up within one tick and React state only changes from that timer.
 */
export function useArrivalPacer(arrivals: string[] | null, resetKey: string, opts: PacerOptions): PacerState {
    const [feed, setFeed] = useState<FeedEntry[]>([]);
    const [queued, setQueued] = useState(0);
    const inputRef = useRef({ arrivals, resetKey, opts });
    useEffect(() => { inputRef.current = { arrivals, resetKey, opts }; });

    const appliedResetKeyRef = useRef<string | null>(null);
    const appliedArrivalsRef = useRef<string[] | null>(null);
    const queueRef = useRef<string[]>([]);
    const knownRef = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);
    const lastRevealAtRef = useRef(0);
    const lastBatchAtRef = useRef(0);
    const batchIntervalRef = useRef(DEFAULT_BATCH_INTERVAL_MS);
    // Everyone queued should be on screen by then — a little before the next batch is due.
    const drainByRef = useRef(0);

    const release = useCallback((keys: string[], announce: boolean) => {
        if (keys.length === 0) return;
        const at = Date.now();
        if (announce) keys.forEach(k => inputRef.current.opts.onReveal?.(k));
        const released = new Set(keys);
        setFeed(prev => [
            ...[...keys].reverse().map(key => ({ key, at })),
            ...prev.filter(e => !released.has(e.key)),
        ].slice(0, FEED_MAX));
    }, []);

    // New answer: queue whoever we have not seen yet. The first answer is history.
    const takeArrivals = useCallback((list: string[]) => {
        const present = new Set(list);
        if (!initializedRef.current) {
            initializedRef.current = true;
            knownRef.current = present;
            // Back-dated so none of it flashes as "just arrived".
            const at = Date.now() - 60_000;
            setFeed(list.slice(-FEED_MAX).reverse().map(key => ({ key, at })));
            return;
        }
        // A pass that vanished (strict mode dropped a bogus read) leaves the queue too.
        queueRef.current = queueRef.current.filter(k => present.has(k));
        const fresh = list.filter(k => !knownRef.current.has(k));
        if (fresh.length === 0) return;
        fresh.forEach(k => knownRef.current.add(k));
        const now = Date.now();
        if (lastBatchAtRef.current > 0) {
            const gap = Math.min(180_000, Math.max(10_000, now - lastBatchAtRef.current));
            batchIntervalRef.current = batchIntervalRef.current * 0.6 + gap * 0.4;
        }
        lastBatchAtRef.current = now;
        drainByRef.current = now + batchIntervalRef.current * 0.8;
        queueRef.current.push(...fresh);
    }, []);

    useEffect(() => {
        const tick = () => {
            const { arrivals: list, resetKey: key, opts: { isVisible, paused } } = inputRef.current;
            if (appliedResetKeyRef.current !== key) {
                appliedResetKeyRef.current = key;
                appliedArrivalsRef.current = null;
                queueRef.current = [];
                knownRef.current = new Set();
                initializedRef.current = false;
                lastRevealAtRef.current = 0;
                lastBatchAtRef.current = 0;
                batchIntervalRef.current = DEFAULT_BATCH_INTERVAL_MS;
                drainByRef.current = 0;
                setFeed([]);
            }
            if (list && list !== appliedArrivalsRef.current) {
                appliedArrivalsRef.current = list;
                takeArrivals(list);
            }

            const q = queueRef.current;
            if (q.length > 0 && !paused) {
                // Hidden by the filters → no turn needed.
                const hidden: string[] = [];
                while (q.length > 0 && !isVisible(q[0])) hidden.push(q.shift()!);
                if (q.length > MAX_QUEUE) hidden.push(...q.splice(0, q.length - MAX_QUEUE));
                release(hidden, false);
                if (q.length > 0) {
                    // Spread what is left evenly over the time left before the next batch.
                    const now = Date.now();
                    const visibleWaiting = q.filter(isVisible).length || 1;
                    const gap = Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, (drainByRef.current - now) / visibleWaiting));
                    if (now - lastRevealAtRef.current >= gap) {
                        lastRevealAtRef.current = now;
                        release([q.shift()!], true);
                    }
                }
            }
            setQueued(q.length);
        };
        tick();
        const id = setInterval(tick, TICK_MS);
        return () => clearInterval(id);
    }, [release, takeArrivals]);

    const flush = useCallback(() => {
        const all = queueRef.current.splice(0);
        release(all, false);
        lastRevealAtRef.current = Date.now();
        setQueued(0);
    }, [release]);

    return { feed, queued, flush };
}
