export interface FollowedRunner {
    runnerId: string;
    eventKey: string;
    eventId?: string;
    runnerName: string;
    bib: string;
    campaignName?: string;
    category?: string;
    ageGroup?: string;
    gender?: string;
    latestCheckpoint?: string;
    followedAt: number;
}

const STORAGE_KEY = 'followed_runners';
const CHANGE_EVENT = 'followed-runners-changed';

function dispatchChange(items: FollowedRunner[]) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<FollowedRunner[]>(CHANGE_EVENT, { detail: items }));
}

function normalizeItems(items: unknown): FollowedRunner[] {
    if (!Array.isArray(items)) return [];
    return items
        .filter((item): item is FollowedRunner => !!item && typeof item === 'object' && typeof (item as FollowedRunner).runnerId === 'string' && typeof (item as FollowedRunner).eventKey === 'string')
        .map((item) => ({
            ...item,
            followedAt: Number.isFinite(item.followedAt) ? item.followedAt : Date.now(),
        }));
}

export function loadFollowedRunners(): FollowedRunner[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return normalizeItems(JSON.parse(raw));
    } catch {
        return [];
    }
}

export function saveFollowedRunners(items: FollowedRunner[]) {
    if (typeof window === 'undefined') return;
    const normalized = normalizeItems(items);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    dispatchChange(normalized);
}

export function isRunnerFollowed(items: FollowedRunner[], runnerId: string): boolean {
    return items.some((item) => item.runnerId === runnerId);
}

export function toggleFollowedRunner(items: FollowedRunner[], runner: FollowedRunner): FollowedRunner[] {
    if (isRunnerFollowed(items, runner.runnerId)) {
        return items.filter((item) => item.runnerId !== runner.runnerId);
    }

    return [
        {
            ...runner,
            followedAt: Date.now(),
        },
        ...items.filter((item) => item.runnerId !== runner.runnerId),
    ];
}

export function getFollowedRunnersForEvent(items: FollowedRunner[], eventKey: string, eventId?: string): FollowedRunner[] {
    return items.filter((item) => item.eventKey === eventKey || (!!eventId && item.eventId === eventId));
}

export function subscribeFollowedRunners(callback: (items: FollowedRunner[]) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
            callback(loadFollowedRunners());
        }
    };

    const handleCustom = (event: Event) => {
        const detail = (event as CustomEvent<FollowedRunner[]>).detail;
        callback(Array.isArray(detail) ? normalizeItems(detail) : loadFollowedRunners());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHANGE_EVENT, handleCustom as EventListener);

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(CHANGE_EVENT, handleCustom as EventListener);
    };
}
