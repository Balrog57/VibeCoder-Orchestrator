import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createSessionState } from '../utils/session-state.js';
import { loadPersistedSessions, savePersistedSessions } from '../utils/session-persistence.js';

async function makeTempRoot(prefix) {
    return fs.mkdtemp(path.join(os.tmpdir(), `viberemote-${prefix}-`));
}

describe('session persistence', () => {
    it('saves and restores slot containers with idle-safe state', async () => {
        const root = await makeTempRoot('persist');
        const sessions = {
            '123': {
                activeSlot: 'research',
                slots: {
                    main: createSessionState({
                        activeRepo: 'demo-main',
                        taskProfile: 'implement'
                    }),
                    research: createSessionState({
                        activeRepo: 'demo-research',
                        taskProfile: 'explore',
                        state: 'waiting_permission',
                        pendingPermission: { id: 'perm-1', action: 'open_ide', status: 'pending' },
                        workspaceMode: 'worktree'
                    })
                }
            }
        };

        const savedPath = await savePersistedSessions(root, sessions);
        expect(savedPath).toContain(path.join('.viberemote', 'session-state.json'));

        const restored = await loadPersistedSessions(root);
        expect(restored['123'].activeSlot).toBe('research');
        expect(restored['123'].slots.main.activeRepo).toBe('demo-main');
        expect(restored['123'].slots.research.activeRepo).toBe('demo-research');
        expect(restored['123'].slots.research.state).toBe('waiting_permission');
        expect(restored['123'].slots.research.isProcessing).toBe(false);
        expect(restored['123'].slots.research.activeRun).toBeNull();
        expect(restored['123'].slots.research.workspacePath).toBeNull();
        expect(restored['123'].slots.research.pendingPermission).toMatchObject({
            action: 'open_ide',
            status: 'pending'
        });
    });
});
