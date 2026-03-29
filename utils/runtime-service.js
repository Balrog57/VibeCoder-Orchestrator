import fs from 'fs/promises';
import path from 'path';

const STORAGE_DIR = '.viberemote';
const STORAGE_FILE = 'runtime-state.json';

function countSlots(container) {
    if (!container?.slots || typeof container.slots !== 'object') {
        return 0;
    }

    return Object.keys(container.slots).length;
}

function getStoragePath(rootPath) {
    return path.join(rootPath, STORAGE_DIR, STORAGE_FILE);
}

export function summarizeRuntimeSessions(sessions = {}) {
    const containers = Object.values(sessions || {});
    let slotCount = 0;
    let activeRepoCount = 0;
    let processingCount = 0;
    let waitingPermissionCount = 0;

    for (const container of containers) {
        const slots = container?.slots && typeof container.slots === 'object'
            ? Object.values(container.slots)
            : [];
        slotCount += countSlots(container);

        for (const session of slots) {
            if (session?.activeRepo) {
                activeRepoCount += 1;
            }
            if (session?.isProcessing) {
                processingCount += 1;
            }
            if (session?.pendingPermission) {
                waitingPermissionCount += 1;
            }
        }
    }

    return {
        chatCount: containers.length,
        slotCount,
        activeRepoCount,
        processingCount,
        waitingPermissionCount
    };
}

export function createRuntimeServiceState(overrides = {}) {
    const now = new Date().toISOString();
    return {
        status: 'online',
        pid: process.pid,
        startedAt: now,
        updatedAt: now,
        lastSource: 'startup',
        lastActiveChatId: null,
        lastActiveSlot: 'main',
        restoredChats: 0,
        previousStartedAt: null,
        previousUpdatedAt: null,
        channels: {
            telegram: false,
            gui: false
        },
        summary: {
            chatCount: 0,
            slotCount: 0,
            activeRepoCount: 0,
            processingCount: 0,
            waitingPermissionCount: 0
        },
        ...overrides
    };
}

export function buildRuntimeServiceSnapshot(currentState, {
    sessions = {},
    chatId = null,
    activeSlot = null,
    channels = null,
    lastSource = null,
    status = null
} = {}) {
    return {
        ...currentState,
        status: status || currentState.status || 'online',
        updatedAt: new Date().toISOString(),
        lastSource: lastSource || currentState.lastSource || 'runtime',
        lastActiveChatId: chatId ?? currentState.lastActiveChatId ?? null,
        lastActiveSlot: activeSlot || currentState.lastActiveSlot || 'main',
        channels: channels || currentState.channels || { telegram: false, gui: false },
        summary: summarizeRuntimeSessions(sessions)
    };
}

export async function loadRuntimeServiceState(rootPath) {
    try {
        const storagePath = getStoragePath(rootPath);
        const raw = await fs.readFile(storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export async function saveRuntimeServiceState(rootPath, runtimeState) {
    const storagePath = getStoragePath(rootPath);
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, JSON.stringify(runtimeState, null, 2), 'utf8');
    return storagePath;
}
