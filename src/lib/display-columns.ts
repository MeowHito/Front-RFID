/**
 * Column-order plumbing shared by /admin/display (the editor) and /event/[id]
 * (the public table). Both must agree on how `campaign.displayColumns` is read
 * back, or the admin drags a column and the public page ignores it.
 *
 * Two shapes can be stored, and both stay supported:
 *
 *   legacy — only the toggleable columns the admin enabled, in their order.
 *            Fixed columns (Rank / Runner / Status / Progress) were not movable
 *            back then, so they are slotted back into their original positions.
 *
 *   full   — every visible column including the fixed ones, in their order.
 *            Recognised by the presence of at least one fixed key. This is what
 *            /admin/display writes now that all columns can be dragged.
 */

export interface ColumnOrderDef {
    key: string;
    fixed?: boolean;
}

/** Deduplicated saved keys, dropping anything this column set doesn't know. */
function knownSavedKeys(saved: readonly string[] | null | undefined, columns: ColumnOrderDef[]): string[] {
    const allKeys = new Set(columns.map(c => c.key));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const key of saved || []) {
        if (!allKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        result.push(key);
    }
    return result;
}

/**
 * Full left-to-right key order for a column set, given what the admin saved.
 * Every key of `columns` comes back exactly once — callers filter for
 * visibility afterwards.
 */
export function buildColumnOrder(saved: readonly string[] | null | undefined, columns: ColumnOrderDef[]): string[] {
    const allKeys = columns.map(c => c.key);
    const savedKeys = knownSavedKeys(saved, columns);
    if (savedKeys.length === 0) return [...allKeys];

    const fixedKeys = new Set(columns.filter(c => c.fixed).map(c => c.key));
    if (savedKeys.some(k => fixedKeys.has(k))) {
        // Full order — trust it verbatim, then park anything it didn't mention
        // (columns the admin hid, or keys this page knows and the editor doesn't)
        // at the end where visibility filtering will drop them anyway.
        return [...savedKeys, ...allKeys.filter(k => !savedKeys.includes(k))];
    }

    // Legacy order: fill the non-fixed slots in sequence, leaving fixed columns put.
    const toggleableKeys = allKeys.filter(k => !fixedKeys.has(k));
    const toggleOrdered = [...savedKeys, ...toggleableKeys.filter(k => !savedKeys.includes(k))];
    const result: string[] = [];
    let next = 0;
    for (const key of allKeys) {
        result.push(fixedKeys.has(key) ? key : toggleOrdered[next++]);
    }
    return result;
}

/**
 * The array to persist: the visible columns in their current order. Fixed
 * columns are always visible, so they ride along and make this a "full" order.
 */
export function serializeColumnOrder(
    order: readonly string[],
    columns: ColumnOrderDef[],
    selected: readonly string[],
): string[] {
    return order.filter(key => {
        const col = columns.find(c => c.key === key);
        if (!col) return false;
        return col.fixed || selected.includes(key);
    });
}

/** Move `fromKey` to sit where `toKey` currently is. Returns a new array. */
export function moveKey(order: readonly string[], fromKey: string, toKey: string): string[] {
    const arr = [...order];
    const from = arr.indexOf(fromKey);
    const to = arr.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return arr;
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    return arr;
}
