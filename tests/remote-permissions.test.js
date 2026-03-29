import { describe, expect, it } from 'vitest';
import { createSessionState } from '../utils/session-state.js';
import {
    normalizePermissionMode,
    queueRemotePermission,
    requiresRemotePermission,
    resolveRemotePermission
} from '../utils/remote-permissions.js';

describe('remote permission helpers', () => {
    it('normalizes permission modes and detects sensitive actions', () => {
        expect(normalizePermissionMode('broken')).toBe('local');

        const session = createSessionState({ permissionMode: 'confirm_remote' });
        expect(requiresRemotePermission(session, 'open_ide')).toBe(true);
        expect(requiresRemotePermission(session, 'set_workspace_mode', { mode: 'worktree' })).toBe(true);
        expect(requiresRemotePermission(session, 'set_workspace_mode', { mode: 'project' })).toBe(false);
    });

    it('queues and resolves remote permission requests', () => {
        let session = createSessionState({ permissionMode: 'strict' });
        session = queueRemotePermission(session, {
            action: 'open_run_ide',
            payload: { runIndex: 1 },
            source: 'telegram'
        });

        expect(session.state).toBe('waiting_permission');
        expect(session.pendingPermission).toMatchObject({
            action: 'open_run_ide',
            payload: { runIndex: 1 },
            source: 'telegram',
            status: 'pending'
        });

        session = resolveRemotePermission(session, true, { note: 'approved from test' });
        expect(session.state).toBe('idle');
        expect(session.pendingPermission).toBeNull();
        expect(session.permissionHistory[0]).toMatchObject({
            action: 'open_run_ide',
            status: 'approved',
            note: 'approved from test'
        });
    });
});
