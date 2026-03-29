import { describe, expect, it } from 'vitest';
import { resolveRemoteDispatch } from '../utils/dispatch.js';

describe('resolveRemoteDispatch', () => {
    const baseOptions = {
        repos: ['VibeRemote', 'stlflix'],
        availableClis: ['claude', 'codex', 'gemini'],
        availableIdes: ['cursor', 'vscode'],
        availableModels: {
            claude: ['sonnet'],
            codex: ['o4-mini']
        }
    };

    it('detects a project selection intent', () => {
        expect(resolveRemoteDispatch('projet VibeRemote', baseOptions)).toEqual({
            type: 'select_repo',
            value: 'VibeRemote'
        });
    });

    it('detects a repo creation intent', () => {
        expect(resolveRemoteDispatch('create repo RemoteHub', baseOptions)).toEqual({
            type: 'create_repo',
            value: 'RemoteHub'
        });
    });

    it('detects language switching', () => {
        expect(resolveRemoteDispatch('passe en anglais', baseOptions)).toEqual({
            type: 'set_lang',
            value: 'en'
        });
    });

    it('detects IDE launch', () => {
        expect(resolveRemoteDispatch('ouvre cursor', baseOptions)).toEqual({
            type: 'open_ide',
            value: 'cursor'
        });
    });

    it('detects workspace mode switching', () => {
        expect(resolveRemoteDispatch('utilise worktree', baseOptions)).toEqual({
            type: 'set_workspace_mode',
            value: 'worktree'
        });
    });

    it('detects local runs overview intent', () => {
        expect(resolveRemoteDispatch('derniers runs', baseOptions)).toEqual({
            type: 'show_runs'
        });
    });

    it('detects rerun intent', () => {
        expect(resolveRemoteDispatch('relance dernier run', baseOptions)).toEqual({
            type: 'rerun_last'
        });
    });

    it('detects last run detail intent', () => {
        expect(resolveRemoteDispatch('detail dernier run', baseOptions)).toEqual({
            type: 'show_run_detail'
        });
    });

    it('detects indexed run detail intent', () => {
        expect(resolveRemoteDispatch('detail run 2', baseOptions)).toEqual({
            type: 'show_run_detail',
            value: 1
        });
    });

    it('detects indexed rerun intent', () => {
        expect(resolveRemoteDispatch('relance run 3', baseOptions)).toEqual({
            type: 'rerun_run',
            value: 2
        });
    });

    it('detects rerun with an explicit CLI', () => {
        expect(resolveRemoteDispatch('relance dernier run avec codex', baseOptions)).toEqual({
            type: 'rerun_last_with_cli',
            value: 'codex'
        });

        expect(resolveRemoteDispatch('relance run 3 avec claude', baseOptions)).toEqual({
            type: 'rerun_run_with_cli',
            value: {
                index: 2,
                cli: 'claude'
            }
        });
    });

    it('detects indexed run IDE intent', () => {
        expect(resolveRemoteDispatch('ouvre ide run 2', baseOptions)).toEqual({
            type: 'open_run_ide',
            value: 1
        });
    });

    it('detects task profile switching without swallowing coding prompts', () => {
        expect(resolveRemoteDispatch('mode review', baseOptions)).toEqual({
            type: 'set_task_profile',
            value: 'review'
        });
        expect(resolveRemoteDispatch('review ce composant React', baseOptions)).toBeNull();
    });

    it('does not swallow a real coding request', () => {
        expect(resolveRemoteDispatch('corrige les tests du projet', baseOptions)).toBeNull();
    });
});
