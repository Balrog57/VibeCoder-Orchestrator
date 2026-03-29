import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import { resolveWorkspacePath } from './actions.js';

export const WORKSPACE_MODES = Object.freeze([
    'project',
    'worktree'
]);

export function normalizeWorkspaceMode(mode) {
    return WORKSPACE_MODES.includes(mode) ? mode : 'project';
}

export function getDefaultWorkspaceStatus(mode) {
    return normalizeWorkspaceMode(mode) === 'worktree' ? 'pending' : 'project';
}

export function resolveSessionRepoPath(basePath, session) {
    if (!session?.activeRepo) {
        throw new Error('Aucun projet actif.');
    }

    return resolveWorkspacePath(basePath, session.activeRepo);
}

function buildWorktreePath(basePath, repoRelativePath, sessionId) {
    const normalizedRepoPath = (repoRelativePath || '')
        .split('/')
        .filter(Boolean);

    return path.join(basePath, '.viberemote', 'worktrees', ...normalizedRepoPath, sessionId);
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function isGitRepository(repoPath) {
    try {
        await execa('git', ['-C', repoPath, 'rev-parse', '--show-toplevel']);
        return true;
    } catch {
        return false;
    }
}

function createProjectWorkspaceResult(repoInfo, requestedMode = 'project') {
    return {
        requestedMode: normalizeWorkspaceMode(requestedMode),
        mode: 'project',
        status: 'project',
        sourceRepoPath: repoInfo.absolutePath,
        executionPath: repoInfo.absolutePath,
        workspacePath: repoInfo.absolutePath,
        fallbackReason: null,
        reused: true
    };
}

export async function prepareSessionWorkspace(basePath, session) {
    const repoInfo = resolveSessionRepoPath(basePath, session);
    const requestedMode = normalizeWorkspaceMode(session?.workspaceMode);

    if (requestedMode === 'project') {
        return createProjectWorkspaceResult(repoInfo, requestedMode);
    }

    if (!(await isGitRepository(repoInfo.absolutePath))) {
        return {
            ...createProjectWorkspaceResult(repoInfo, requestedMode),
            status: 'fallback',
            fallbackReason: 'not_git_repository',
            reused: true
        };
    }

    const sessionId = session?.sessionId || 'remote-session';
    const worktreePath = buildWorktreePath(basePath, repoInfo.relativePath, sessionId);
    const hasExistingWorktree = await pathExists(worktreePath);

    if (hasExistingWorktree) {
        return {
            requestedMode,
            mode: 'worktree',
            status: 'ready',
            sourceRepoPath: repoInfo.absolutePath,
            executionPath: worktreePath,
            workspacePath: worktreePath,
            fallbackReason: null,
            reused: true
        };
    }

    await fs.mkdir(path.dirname(worktreePath), { recursive: true });

    try {
        await execa('git', ['-C', repoInfo.absolutePath, 'worktree', 'add', '--detach', worktreePath]);
        return {
            requestedMode,
            mode: 'worktree',
            status: 'ready',
            sourceRepoPath: repoInfo.absolutePath,
            executionPath: worktreePath,
            workspacePath: worktreePath,
            fallbackReason: null,
            reused: false
        };
    } catch (error) {
        return {
            ...createProjectWorkspaceResult(repoInfo, requestedMode),
            status: 'fallback',
            fallbackReason: 'worktree_create_failed',
            error: error?.shortMessage || error?.message || 'git worktree add failed',
            reused: true
        };
    }
}
