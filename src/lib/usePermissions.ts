'use client';

import { useMemo } from 'react';
import { useAuth } from './auth-context';
import { isAdminRole, hasPermission, type PermAction } from './permissions';

/**
 * Hook that exposes permission helpers for the current user.
 * Usage:
 *   const { isAdmin, canCreate, canDelete, canExport, readOnly } = usePermissions('participants');
 */
export function usePermissions(moduleKey?: string) {
    const { user } = useAuth();

    return useMemo(() => {
        const admin = isAdminRole(user?.role);

        const check = (mod: string, action: PermAction) =>
            hasPermission(mod, action, user?.role, user?.modulePermissions);

        return {
            isAdmin: admin,
            /** Can view the module (only meaningful if moduleKey provided) */
            canView: moduleKey ? check(moduleKey, 'view') : admin,
            /** Can create / edit within the module */
            canCreate: moduleKey ? check(moduleKey, 'create') : admin,
            /** Can delete within the module */
            canDelete: moduleKey ? check(moduleKey, 'delete') : admin,
            /** Can export data from the module */
            canExport: moduleKey ? check(moduleKey, 'export') : admin,
            /** Shorthand: user can view but NOT create/edit */
            readOnly: moduleKey ? !check(moduleKey, 'create') : !admin,
        };
    }, [user, moduleKey]);
}
