import crypto from 'crypto';
import { getDefaultWorkspaceStatus, normalizeWorkspaceMode } from './workspace-sessions.js';
import { normalizePermissionMode } from './remote-permissions.js';

export const SESSION_STATES = Object.freeze([
    'idle',
    'browsing_workspace',
    'awaiting_repo_name',
    'awaiting_notes_input',
    'awaiting_prompt',
    'running_cli',
    'waiting_permission',
    'fallback_retry',
    'review_ready',
    'failed'
]);

export const EVENT_FILTERS = Object.freeze([
    'all',
    'telegram',
    'gui',
    'permission',
    'pipeline'
]);

const DEFAULT_STATE = Object.freeze({
    activeRepo: null,
    browserPath: '',
    state: 'idle',
    sessionId: null,
    sessionMode: 'remote-cli',
    dispatchMode: 'idle',
    permissionMode: 'local',
    pendingPermission: null,
    permissionHistory: [],
    workspaceMode: 'project',
    workspacePath: null,
    workspaceStatus: 'project',
    workspaceFallbackReason: null,
    taskProfile: 'code',
    defaultCli: null,
    defaultModel: null,
    defaultIde: null,
    disabledClis: [],
    disabledIdes: [],
    fallbackMaxAttempts: 3,
    fallbackCliOrder: [],
    isProcessing: false,
    awaitingNotesInput: false,
    lastPrompt: null,
    lastSummary: null,
    lastFiles: [],
    lastTestResult: null,
    saveNotes: '',
    lastTrace: null,
    fallbackCount: 0,
    activeRun: null,
    runHistory: [],
    remoteEventHistory: [],
    eventFilter: 'all',
    locale: 'fr'
});

function buildSessionId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `session-${Date.now()}`;
}

export function createSessionState(overrides = {}) {
    return ensureSessionState({
        ...DEFAULT_STATE,
        ...overrides
    });
}

export function ensureSessionState(session = {}) {
    const merged = {
        ...DEFAULT_STATE,
        ...session
    };

    if (!SESSION_STATES.includes(merged.state)) {
        merged.state = 'idle';
    }

    merged.sessionId = merged.sessionId || buildSessionId();
    merged.workspaceMode = normalizeWorkspaceMode(merged.workspaceMode);
    merged.permissionMode = normalizePermissionMode(merged.permissionMode);
    merged.eventFilter = EVENT_FILTERS.includes(merged.eventFilter) ? merged.eventFilter : 'all';
    merged.disabledClis = Array.isArray(merged.disabledClis) ? [...merged.disabledClis] : [];
    merged.disabledIdes = Array.isArray(merged.disabledIdes) ? [...merged.disabledIdes] : [];
    merged.fallbackCliOrder = Array.isArray(merged.fallbackCliOrder) ? [...merged.fallbackCliOrder] : [];
    merged.fallbackMaxAttempts = Number.isFinite(merged.fallbackMaxAttempts)
        ? Math.max(1, Math.min(5, Number(merged.fallbackMaxAttempts)))
        : 3;
    merged.lastFiles = Array.isArray(merged.lastFiles) ? [...merged.lastFiles] : [];
    merged.runHistory = Array.isArray(merged.runHistory) ? [...merged.runHistory] : [];
    merged.remoteEventHistory = Array.isArray(merged.remoteEventHistory) ? [...merged.remoteEventHistory] : [];
    merged.permissionHistory = Array.isArray(merged.permissionHistory) ? [...merged.permissionHistory] : [];
    merged.activeRun = merged.activeRun ? { ...merged.activeRun } : null;
    merged.pendingPermission = merged.pendingPermission ? { ...merged.pendingPermission } : null;
    merged.workspaceStatus = merged.workspaceStatus || getDefaultWorkspaceStatus(merged.workspaceMode);
    merged.workspacePath = merged.workspacePath || null;
    merged.workspaceFallbackReason = merged.workspaceFallbackReason || null;

    if (merged.state === 'awaiting_notes_input') {
        merged.awaitingNotesInput = true;
    }

    return merged;
}

export function setSessionState(session, nextState, extra = {}) {
    if (!SESSION_STATES.includes(nextState)) {
        throw new Error(`Etat de session inconnu: ${nextState}`);
    }

    const nextSession = ensureSessionState({
        ...session,
        ...extra,
        state: nextState
    });

    if (nextState !== 'awaiting_notes_input') {
        nextSession.awaitingNotesInput = Boolean(extra.awaitingNotesInput);
    }

    if (nextState === 'idle') {
        nextSession.dispatchMode = extra.dispatchMode || 'idle';
    }

    return nextSession;
}

export function startSessionRun(session, prompt) {
    const nextSession = ensureSessionState(session);
    nextSession.isProcessing = true;
    nextSession.lastPrompt = prompt;
    nextSession.dispatchMode = 'pipeline';
    nextSession.state = 'running_cli';
    nextSession.activeRun = {
        id: `${nextSession.sessionId}-${Date.now()}`,
        prompt,
        startedAt: new Date().toISOString(),
        attempts: 0
    };
    return nextSession;
}

export function recordFallback(session, trace) {
    const nextSession = ensureSessionState(session);
    nextSession.lastTrace = trace ? { ...trace } : null;
    if (trace?.status === 'failed') {
        nextSession.fallbackCount += 1;
        nextSession.state = 'fallback_retry';
    }
    if (nextSession.activeRun) {
        nextSession.activeRun.attempts = (nextSession.activeRun.attempts || 0) + 1;
    }
    return nextSession;
}

export function finishSessionRun(session, { state = 'idle', dispatchMode = 'idle', lastTrace = null } = {}) {
    const nextSession = ensureSessionState(session);
    nextSession.isProcessing = false;
    nextSession.state = state;
    nextSession.dispatchMode = dispatchMode;
    if (lastTrace) {
        nextSession.lastTrace = { ...lastTrace };
    }
    if (nextSession.activeRun) {
        nextSession.activeRun.finishedAt = new Date().toISOString();
    }
    nextSession.activeRun = null;
    return nextSession;
}

export function appendRunHistory(session, runEntry) {
    const nextSession = ensureSessionState(session);
    const entry = runEntry ? { ...runEntry } : null;
    if (!entry) {
        return nextSession;
    }

    nextSession.runHistory = [entry, ...nextSession.runHistory].slice(0, 10);
    return nextSession;
}

export function appendSessionEvent(session, eventEntry) {
    const nextSession = ensureSessionState(session);
    const entry = eventEntry ? { ...eventEntry } : null;
    if (!entry) {
        return nextSession;
    }

    nextSession.remoteEventHistory = [
        {
            createdAt: new Date().toISOString(),
            ...entry
        },
        ...nextSession.remoteEventHistory
    ].slice(0, 20);

    return nextSession;
}
