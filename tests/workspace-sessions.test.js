import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';
import {
    prepareSessionWorkspace,
    resolveSessionRepoPath
} from '../utils/workspace-sessions.js';

const tempRoots = [];

async function makeTempRoot(name) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `viberemote-${name}-`));
    tempRoots.push(root);
    return root;
}

async function createGitRepo(root, relativeRepo) {
    const repoPath = path.join(root, relativeRepo);
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Demo\n', 'utf8');
    await execa('git', ['-C', repoPath, 'init']);
    await execa('git', ['-C', repoPath, 'config', 'user.email', 'tests@example.com']);
    await execa('git', ['-C', repoPath, 'config', 'user.name', 'VibeRemote Tests']);
    await execa('git', ['-C', repoPath, 'add', '.']);
    await execa('git', ['-C', repoPath, 'commit', '-m', 'init']);
    return repoPath;
}

afterEach(async () => {
    while (tempRoots.length) {
        const target = tempRoots.pop();
        await fs.rm(target, { recursive: true, force: true });
    }
});

describe('workspace session isolation', () => {
    it('resolves the active repo path from the workspace root', () => {
        const repoInfo = resolveSessionRepoPath('C:/workspace', { activeRepo: 'demo/app' });
        expect(repoInfo.relativePath).toBe('demo/app');
        expect(repoInfo.absolutePath.replace(/\\/g, '/')).toContain('/workspace/demo/app');
    });

    it('keeps project mode in the main repo folder', async () => {
        const root = await makeTempRoot('workspace-project');
        await fs.mkdir(path.join(root, 'demo'), { recursive: true });

        const workspace = await prepareSessionWorkspace(root, {
            activeRepo: 'demo',
            sessionId: 'session-a',
            workspaceMode: 'project'
        });

        expect(workspace.mode).toBe('project');
        expect(workspace.status).toBe('project');
        expect(workspace.executionPath).toBe(path.join(root, 'demo'));
    });

    it('creates and reuses a git worktree for isolated sessions', async () => {
        const root = await makeTempRoot('workspace-worktree');
        await createGitRepo(root, 'demo');

        const first = await prepareSessionWorkspace(root, {
            activeRepo: 'demo',
            sessionId: 'session-b',
            workspaceMode: 'worktree'
        });

        expect(first.mode).toBe('worktree');
        expect(first.status).toBe('ready');
        expect(first.executionPath.replace(/\\/g, '/')).toContain('/.viberemote/worktrees/demo/session-b');

        const second = await prepareSessionWorkspace(root, {
            activeRepo: 'demo',
            sessionId: 'session-b',
            workspaceMode: 'worktree'
        });

        expect(second.mode).toBe('worktree');
        expect(second.status).toBe('ready');
        expect(second.reused).toBe(true);
        expect(second.executionPath).toBe(first.executionPath);
    });

    it('falls back to the project folder when worktree isolation is unavailable', async () => {
        const root = await makeTempRoot('workspace-fallback');
        await fs.mkdir(path.join(root, 'plain-folder'), { recursive: true });

        const workspace = await prepareSessionWorkspace(root, {
            activeRepo: 'plain-folder',
            sessionId: 'session-c',
            workspaceMode: 'worktree'
        });

        expect(workspace.mode).toBe('project');
        expect(workspace.status).toBe('fallback');
        expect(workspace.fallbackReason).toBe('not_git_repository');
        expect(workspace.executionPath).toBe(path.join(root, 'plain-folder'));
    });
});
