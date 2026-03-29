import { describe, expect, it } from 'vitest';
import {
    appendRunHistory,
    appendSessionEvent,
    createSessionState,
    ensureSessionState,
    finishSessionRun,
    recordFallback,
    setSessionState,
    startSessionRun
} from '../utils/session-state.js';

describe('session state helpers', () => {
    it('creates a remote-cli session with stable defaults', () => {
        const session = createSessionState();
        expect(session.sessionMode).toBe('remote-cli');
        expect(session.state).toBe('idle');
        expect(session.sessionId).toBeTruthy();
        expect(session.disabledClis).toEqual([]);
        expect(session.workspaceMode).toBe('project');
        expect(session.workspaceStatus).toBe('project');
        expect(session.taskProfile).toBe('code');
        expect(session.fallbackMaxAttempts).toBe(3);
        expect(session.fallbackCliOrder).toEqual([]);
        expect(session.permissionMode).toBe('local');
        expect(session.pendingPermission).toBeNull();
    });

    it('repairs a partial session and normalizes invalid state', () => {
        const session = ensureSessionState({ state: 'broken', disabledClis: null, workspaceMode: 'weird' });
        expect(session.state).toBe('idle');
        expect(session.disabledClis).toEqual([]);
        expect(session.workspaceMode).toBe('project');
        expect(session.permissionMode).toBe('local');
    });

    it('tracks a run lifecycle and fallback attempts', () => {
        let session = createSessionState({ activeRepo: 'demo' });
        session = setSessionState(session, 'awaiting_notes_input', { awaitingNotesInput: true });
        expect(session.awaitingNotesInput).toBe(true);

        session = startSessionRun(session, 'corrige les tests');
        expect(session.state).toBe('running_cli');
        expect(session.isProcessing).toBe(true);
        expect(session.activeRun?.prompt).toBe('corrige les tests');

        session = recordFallback(session, {
            cli: 'claude',
            status: 'failed',
            reason: 'rate_limit'
        });
        expect(session.state).toBe('fallback_retry');
        expect(session.fallbackCount).toBe(1);

        session = finishSessionRun(session, { state: 'idle' });
        expect(session.state).toBe('idle');
        expect(session.isProcessing).toBe(false);
        expect(session.activeRun).toBeNull();

        session = appendRunHistory(session, {
            success: true,
            cli: 'claude',
            requestedCli: 'codex',
            executionMode: 'cli_default',
            attempts: 2,
            taskProfile: 'fix',
            workspaceMode: 'worktree',
            promptSnippet: 'corrige le login',
            detail: 'src/login.js'
        });
        expect(session.runHistory).toHaveLength(1);
        expect(session.runHistory[0]).toMatchObject({
            cli: 'claude',
            requestedCli: 'codex',
            executionMode: 'cli_default',
            taskProfile: 'fix',
            promptSnippet: 'corrige le login'
        });

        session = appendSessionEvent(session, {
            type: 'dispatch_local',
            source: 'telegram',
            label: 'Sessions'
        });
        expect(session.remoteEventHistory).toHaveLength(1);
        expect(session.remoteEventHistory[0]).toMatchObject({
            type: 'dispatch_local',
            source: 'telegram',
            label: 'Sessions'
        });
    });
});
