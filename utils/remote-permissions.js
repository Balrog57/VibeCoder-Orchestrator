import crypto from 'crypto';

export const PERMISSION_MODES = Object.freeze([
    'local',
    'confirm_remote',
    'strict'
]);

const CONFIRM_REMOTE_ACTIONS = new Set([
    'open_ide',
    'open_run_ide',
    'set_workspace_mode:worktree'
]);

const STRICT_ACTIONS = new Set([
    ...CONFIRM_REMOTE_ACTIONS,
    'create_repo',
    'manual_save'
]);

function buildRequestId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `perm-${Date.now()}`;
}

export function normalizePermissionMode(mode) {
    return PERMISSION_MODES.includes(mode) ? mode : 'local';
}

export function getPermissionActionKey(action, payload = {}) {
    if (action === 'set_workspace_mode') {
        return `set_workspace_mode:${payload.mode || 'project'}`;
    }

    return action;
}

export function requiresRemotePermission(session, action, payload = {}) {
    const mode = normalizePermissionMode(session?.permissionMode);
    if (mode === 'local') {
        return false;
    }

    const actionKey = getPermissionActionKey(action, payload);
    if (mode === 'strict') {
        return STRICT_ACTIONS.has(actionKey) || STRICT_ACTIONS.has(action);
    }

    return CONFIRM_REMOTE_ACTIONS.has(actionKey) || CONFIRM_REMOTE_ACTIONS.has(action);
}

export function createPermissionRequest({ action, payload = {}, source = 'remote' } = {}) {
    return {
        id: buildRequestId(),
        action,
        payload: { ...payload },
        source,
        createdAt: new Date().toISOString(),
        status: 'pending'
    };
}

export function queueRemotePermission(session, requestSpec) {
    const request = createPermissionRequest(requestSpec);
    return {
        ...session,
        state: 'waiting_permission',
        dispatchMode: 'local',
        pendingPermission: request
    };
}

export function resolveRemotePermission(session, approved, extra = {}) {
    const pendingPermission = session?.pendingPermission || null;
    const historyEntry = pendingPermission
        ? {
            ...pendingPermission,
            status: approved ? 'approved' : 'denied',
            resolvedAt: new Date().toISOString(),
            ...extra
        }
        : null;

    return {
        ...session,
        state: session?.isProcessing ? 'running_cli' : 'idle',
        dispatchMode: session?.isProcessing ? 'pipeline' : 'idle',
        pendingPermission: null,
        permissionHistory: historyEntry
            ? [historyEntry, ...(Array.isArray(session?.permissionHistory) ? session.permissionHistory : [])].slice(0, 10)
            : Array.isArray(session?.permissionHistory)
                ? [...session.permissionHistory]
                : []
    };
}
