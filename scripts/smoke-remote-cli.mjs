import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { resolveRemoteDispatch } from '../utils/dispatch.js';
import { createSessionState, appendRunHistory } from '../utils/session-state.js';
import { listDirectoryNodes } from '../utils/actions.js';
import { prepareSessionWorkspace } from '../utils/workspace-sessions.js';
import {
    createMainMenuKeyboard,
    createPermissionKeyboard,
    createRepoKeyboard,
    createServiceKeyboard,
    createSettingsKeyboard,
    createTaskProfileKeyboard,
    createWorkspaceModeKeyboard
} from '../utils/ui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'workspaces');
const WINDOWS_GIT_CANDIDATES = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe'
];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function callbackDataSet(markup) {
    return new Set(
        (markup?.reply_markup?.inline_keyboard || [])
            .flat()
            .map(button => button.callback_data)
            .filter(Boolean)
    );
}

async function createTempWorkspaceBase() {
    const tempParent = path.join(repoRoot, '.tmp-smoke-remote');
    await fs.mkdir(tempParent, { recursive: true });
    const tempRoot = await fs.mkdtemp(path.join(tempParent, 'run-'));
    await fs.cp(fixtureRoot, tempRoot, { recursive: true });
    return tempRoot;
}

async function resolveGitExecutable() {
    if (process.platform !== 'win32') {
        return 'git';
    }

    for (const candidate of WINDOWS_GIT_CANDIDATES) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    return 'git';
}

async function initGitFixture(repoPath) {
    const gitBin = await resolveGitExecutable();
    try {
        await execa(gitBin, ['init'], { cwd: repoPath });
        await execa(gitBin, ['config', 'user.name', 'VibeRemote Smoke'], { cwd: repoPath });
        await execa(gitBin, ['config', 'user.email', 'smoke@local.test'], { cwd: repoPath });
        await execa(gitBin, ['add', '.'], { cwd: repoPath });
        await execa(gitBin, ['commit', '-m', 'Initial fixture'], { cwd: repoPath });
        return { ready: true, gitBin };
    } catch (error) {
        return {
            ready: false,
            gitBin,
            reason: error?.shortMessage || error?.message || 'git init failed'
        };
    }
}

async function main() {
    const basePath = await createTempWorkspaceBase();
    const gitRepoPath = path.join(basePath, 'remote-demo');
    const gitFixture = await initGitFixture(gitRepoPath);

    const browserState = await listDirectoryNodes(basePath, '');
    assert(browserState.entries.some(entry => entry.relativePath === 'remote-demo'), 'remote-demo fixture missing from browser state');
    assert(browserState.entries.some(entry => entry.relativePath === 'notes-space'), 'notes-space fixture missing from browser state');

    const baseOptions = {
        repos: ['remote-demo', 'notes-space'],
        availableClis: ['claude', 'codex', 'gemini'],
        availableIdes: ['cursor', 'vscode'],
        availableModels: {
            claude: ['sonnet'],
            codex: ['o4-mini']
        }
    };

    const worktreeDispatch = resolveRemoteDispatch('utilise worktree', baseOptions);
    const reviewDispatch = resolveRemoteDispatch('mode review', baseOptions);
    const rerunDispatch = resolveRemoteDispatch('relance run 1 avec claude', baseOptions);
    const sessionDispatch = resolveRemoteDispatch('session research', baseOptions);
    const permissionDispatch = resolveRemoteDispatch('mode permission strict', baseOptions);
    const serviceDispatch = resolveRemoteDispatch('status service', baseOptions);

    assert(worktreeDispatch?.type === 'set_workspace_mode', 'workspace dispatch not detected');
    assert(reviewDispatch?.type === 'set_task_profile', 'profile dispatch not detected');
    assert(rerunDispatch?.type === 'rerun_run_with_cli', 'rerun with cli dispatch not detected');
    assert(sessionDispatch?.type === 'set_session_slot', 'session dispatch not detected');
    assert(permissionDispatch?.type === 'set_permission_mode', 'permission dispatch not detected');
    assert(serviceDispatch?.type === 'show_service_menu', 'service dispatch not detected');

    let session = createSessionState({
        activeRepo: 'remote-demo',
        locale: 'fr',
        workspaceMode: worktreeDispatch.value,
        taskProfile: reviewDispatch.value
    });

    const mainMenu = createMainMenuKeyboard(session);
    const settingsMenu = createSettingsKeyboard(session);
    const workspaceMenu = createWorkspaceModeKeyboard(session);
    const profileMenu = createTaskProfileKeyboard(session);
    const permissionMenu = createPermissionKeyboard(session);
    const serviceMenu = createServiceKeyboard('fr');
    const repoMenu = await createRepoKeyboard(browserState, 0, 'fr');

    const mainActions = callbackDataSet(mainMenu);
    const settingsActions = callbackDataSet(settingsMenu);
    const workspaceActions = callbackDataSet(workspaceMenu);
    const profileActions = callbackDataSet(profileMenu);
    const permissionActions = callbackDataSet(permissionMenu);
    const serviceActions = callbackDataSet(serviceMenu);
    const repoActions = callbackDataSet(repoMenu);

    assert(mainActions.has('nav:repos') && mainActions.has('action:code'), 'main menu tiles missing expected actions');
    assert(mainActions.has('nav:sessions'), 'main menu tiles missing sessions action');
    assert(settingsActions.has('nav:workspace') && settingsActions.has('nav:profile'), 'settings tiles missing workspace/profile navigation');
    assert(settingsActions.has('nav:fallback'), 'settings tiles missing fallback navigation');
    assert(settingsActions.has('nav:permissions') && settingsActions.has('nav:service'), 'settings tiles missing permissions/service navigation');
    assert(workspaceActions.has('set_workspace_mode:worktree'), 'workspace menu missing worktree action');
    assert(profileActions.has('set_task_profile:review'), 'profile menu missing review action');
    assert(permissionActions.has('set_permission_mode:strict'), 'permission menu missing strict action');
    assert(serviceActions.has('nav:service'), 'service menu missing refresh action');
    assert([...repoActions].some(action => action?.startsWith('browse:remote-demo')), 'repo browser missing remote-demo tile');

    const fallbackSession = createSessionState({
        activeRepo: 'notes-space',
        locale: 'fr',
        workspaceMode: 'worktree'
    });
    const fallbackResult = await prepareSessionWorkspace(basePath, fallbackSession);
    assert(fallbackResult.status === 'fallback', 'non-git fixture should fallback to project mode');

    let worktreeResult = null;
    if (gitFixture.ready) {
        worktreeResult = await prepareSessionWorkspace(basePath, session);
        assert(worktreeResult.mode === 'worktree', 'git fixture did not resolve to worktree mode');
        assert(worktreeResult.status === 'ready', 'git fixture worktree was not ready');
    }

    session = appendRunHistory(session, {
        finishedAt: new Date().toISOString(),
        success: true,
        cli: 'claude',
        requestedCli: 'claude',
        executionMode: 'cli_strict',
        attempts: 1,
        taskProfile: 'review',
        workspaceMode: 'worktree',
        workspacePath: worktreeResult?.executionPath || gitRepoPath,
        prompt: 'relis ce patch',
        promptSnippet: 'relis ce patch',
        detail: 'README.md',
        traces: [{ cli: 'claude', status: 'success', reason: 'ok', durationMs: 120 }]
    });
    assert(session.runHistory.length === 1, 'run history entry was not stored');
    assert(session.runHistory[0].executionMode === 'cli_strict', 'run execution mode not preserved');

    console.log('[OK] dispatch text intents');
    console.log('[OK] remote control tiles');
    console.log('[OK] permissions and service menus');
    if (worktreeResult) {
        console.log(`[OK] worktree ready: ${worktreeResult.executionPath}`);
    } else {
        console.log(`[WARN] git worktree scenario skipped: ${gitFixture.reason}`);
    }
    console.log(`[OK] non-git fallback: ${fallbackResult.executionPath}`);
    console.log('[OK] run history stores execution mode');
    console.log('[SMOKE] remote CLI headless scenario passed');
}

main().catch(error => {
    console.error('[SMOKE] remote CLI headless scenario failed');
    console.error(error.message);
    process.exitCode = 1;
});
