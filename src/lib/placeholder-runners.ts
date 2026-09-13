/**
 * Spare-chip placeholders the timing crew registers in RaceTiger ("Temp18",
 * "Temp7_17", "Temp13_39" with lastName "-"). A Full Sync imports every RaceTiger
 * row, so they land as real Runner docs and show up on the public results page as
 * DNS entries. They are hidden there until the chip is actually used.
 *
 * The match is deliberately strict so no real runner can be caught by it:
 *   • firstName is exactly "Temp" + digits (optionally "_" + digits), nothing else
 *   • lastName is empty or "-"
 *   • status is still not_started and there is no timing evidence of any kind
 * As soon as a spare chip is assigned to a person (renamed) or records a scan,
 * the row stops matching and shows up normally.
 */
const PLACEHOLDER_FIRST_NAME = /^temp\d+(?:_\d+)?$/i;

export interface PlaceholderCheckable {
    firstName?: string;
    lastName?: string;
    status?: string;
    isStarted?: boolean;
    gunTime?: number;
    netTime?: number;
    gunTimeStr?: string;
    netTimeStr?: string;
    elapsedTime?: number;
    passedCount?: number;
    latestCheckpoint?: string;
    manualCheckpoints?: unknown[];
}

export function isPlaceholderRunner(runner: PlaceholderCheckable): boolean {
    if (!PLACEHOLDER_FIRST_NAME.test(String(runner.firstName ?? '').trim())) return false;
    const lastName = String(runner.lastName ?? '').trim();
    if (lastName !== '' && lastName !== '-') return false;
    if (runner.status !== 'not_started') return false;
    if (runner.isStarted) return false;
    if ((runner.gunTime ?? 0) > 0 || (runner.netTime ?? 0) > 0 || (runner.elapsedTime ?? 0) > 0) return false;
    if (runner.gunTimeStr || runner.netTimeStr) return false;
    if ((runner.passedCount ?? 0) > 0) return false;
    if (runner.latestCheckpoint) return false;
    if (Array.isArray(runner.manualCheckpoints) && runner.manualCheckpoints.length > 0) return false;
    return true;
}
