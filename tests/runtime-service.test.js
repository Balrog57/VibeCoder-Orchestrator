import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createSessionState } from '../utils/session-state.js';
import {
    buildRuntimeServiceSnapshot,
    createRuntimeServiceState,
    loadRuntimeServiceState,
    saveRuntimeServiceState,
    summarizeRuntimeSessions
} from '../utils/runtime-service.js';

async function makeTempRoot(prefix) {
    return fs.mkdtemp(path.join(os.tmpdir(), `viberemote-runtime-${prefix}-`));
}

describe('runtime service state', () => {
    it('summarizes remote session containers', () => {
        const sessions = {
            '1': {
                activeSlot: 'main',
                slots: {
                    main: createSessionState({ activeRepo: 'demo', isProcessing: true }),
                    verify: createSessionState({ pendingPermission: { id: 'perm-1', action: 'open_ide' } })
                }
            }
        };

        expect(summarizeRuntimeSessions(sessions)).toEqual({
            chatCount: 1,
            slotCount: 2,
            activeRepoCount: 1,
            processingCount: 1,
            waitingPermissionCount: 1
        });
    });

    it('persists runtime snapshots to disk', async () => {
        const root = await makeTempRoot('persist');
        const base = createRuntimeServiceState({
            channels: { telegram: true, gui: false }
        });
        const snapshot = buildRuntimeServiceSnapshot(base, {
            sessions: {
                '1': {
                    activeSlot: 'main',
                    slots: {
                        main: createSessionState({ activeRepo: 'demo' })
                    }
                }
            },
            chatId: '1',
            activeSlot: 'main',
            lastSource: 'test'
        });

        const savedPath = await saveRuntimeServiceState(root, snapshot);
        expect(savedPath).toContain(path.join('.viberemote', 'runtime-state.json'));

        const restored = await loadRuntimeServiceState(root);
        expect(restored).toMatchObject({
            lastSource: 'test',
            lastActiveChatId: '1',
            lastActiveSlot: 'main',
            channels: { telegram: true, gui: false },
            summary: {
                chatCount: 1,
                activeRepoCount: 1
            }
        });
    });
});
