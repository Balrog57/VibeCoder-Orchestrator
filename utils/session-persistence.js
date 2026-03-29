import fs from 'fs/promises';
import path from 'path';
import { createSessionState, ensureSessionState } from './session-state.js';
import { getDefaultWorkspaceStatus } from './workspace-sessions.js';

const STORAGE_DIR = '.viberemote';
const STORAGE_FILE = 'session-state.json';

function sanitizeSession(session) {
    const normalized = ensureSessionState(session);
    const nextState = normalized.pendingPermission ? 'waiting_permission' : 'idle';
    const nextDispatchMode = normalized.pendingPermission ? 'local' : 'idle';
    return {
        ...normalized,
        isProcessing: false,
        activeRun: null,
        state: nextState,
        dispatchMode: nextDispatchMode,
        workspacePath: null,
        workspaceStatus: getDefaultWorkspaceStatus(normalized.workspaceMode),
        workspaceFallbackReason: null
    };
}

function sanitizeContainer(container) {
    if (!container || typeof container !== 'object' || container.sessionId) {
        return {
            activeSlot: 'main',
            slots: {
                main: sanitizeSession(container || createSessionState())
            }
        };
    }

    const slots = container.slots && typeof container.slots === 'object' ? container.slots : {};
    const nextSlots = {};
    for (const [slot, session] of Object.entries(slots)) {
        nextSlots[slot] = sanitizeSession(session);
    }

    if (!nextSlots.main) {
        nextSlots.main = createSessionState();
    }

    return {
        activeSlot: container.activeSlot || 'main',
        slots: nextSlots
    };
}

function getStoragePath(rootPath) {
    return path.join(rootPath, STORAGE_DIR, STORAGE_FILE);
}

export async function loadPersistedSessions(rootPath) {
    try {
        const storagePath = getStoragePath(rootPath);
        const raw = await fs.readFile(storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).map(([chatId, container]) => [chatId, sanitizeContainer(container)])
        );
    } catch {
        return {};
    }
}

export async function savePersistedSessions(rootPath, sessions) {
    const storagePath = getStoragePath(rootPath);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });

    const serializable = Object.fromEntries(
        Object.entries(sessions || {}).map(([chatId, container]) => [chatId, sanitizeContainer(container)])
    );

    await fs.writeFile(storagePath, JSON.stringify(serializable, null, 2), 'utf8');
    return storagePath;
}
