/**
 * Shared permission utilities for frontend route/menu access control.
 *
 * Module keys match the keys stored in user.modulePermissions:
 *   participants, checkpoints, rfidCheckin, photos, certificates, reports, results, settings, userManagement
 *
 * Special markers:
 *   _always       → visible to all authenticated users
 *   _admin_only   → visible only to admin / admin_master
 */

export type PermAction = 'view' | 'create' | 'delete' | 'export';

export interface ModulePerm {
    view: boolean;
    create: boolean;
    delete: boolean;
    export: boolean;
}

// ---------------------------------------------------------------------------
// Route → module mapping
// ---------------------------------------------------------------------------

export const ROUTE_TO_MODULE: Record<string, string> = {
    // Admin-only pages (hidden & blocked for non-admin)
    '/admin/events': '_admin_only',
    '/admin/events/create': '_admin_only',
    '/admin/checkpoints': '_admin_only',
    '/admin/checkpoints/create': '_admin_only',

    // Module-gated pages
    '/admin/participants': 'participants',
    '/admin/categories': 'participants',
    '/admin/bib-check': 'participants',
    '/admin/id-card-import': 'participants',
    '/admin/live-monitor': 'rfidCheckin',
    '/admin/checkpoint-monitor': 'checkpoints',
    '/admin/rfid-config': 'rfidCheckin',
    '/admin/chip-mapping': 'rfidCheckin',
    '/admin/raw-data': 'rfidCheckin',
    '/admin/results': 'results',
    '/admin/display': 'results',
    '/admin/age-group-ranking': 'results',
    '/admin/certificates': 'certificates',
    '/admin/eslip': 'certificates',
    '/admin/links': 'results',
    '/admin/export': 'reports',
    '/admin/users': 'userManagement',
    '/admin/users/create': 'userManagement',
    '/admin/settings': 'settings',

    // Always accessible
    '/admin/profile': '_always',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isAdminRole(role?: string): boolean {
    return role === 'admin' || role === 'admin_master';
}

/**
 * Check whether a user can access a given admin route.
 * Returns true if allowed, false if blocked.
 */
export function canAccessRoute(
    pathname: string,
    role?: string,
    modulePermissions?: Record<string, ModulePerm>,
): boolean {
    // Admin always has full access
    if (isAdminRole(role)) return true;

    // Find the best matching route key (exact first, then longest prefix)
    const normalized = pathname.split('?')[0];
    let modKey = ROUTE_TO_MODULE[normalized];
    if (!modKey) {
        // Try prefix match (e.g. /admin/events/abc → /admin/events)
        const keys = Object.keys(ROUTE_TO_MODULE).sort((a, b) => b.length - a.length);
        for (const k of keys) {
            if (normalized.startsWith(k + '/') || normalized === k) {
                modKey = ROUTE_TO_MODULE[k];
                break;
            }
        }
    }

    if (!modKey) return true; // Unknown route, allow (fallback)
    if (modKey === '_always') return true;
    if (modKey === '_admin_only') return false;

    const perms = modulePermissions || {};
    return perms[modKey]?.view === true;
}

/**
 * Check a specific action on a module for a user.
 */
export function hasPermission(
    moduleKey: string,
    action: PermAction,
    role?: string,
    modulePermissions?: Record<string, ModulePerm>,
): boolean {
    if (isAdminRole(role)) return true;
    const perms = modulePermissions || {};
    return perms[moduleKey]?.[action] === true;
}
