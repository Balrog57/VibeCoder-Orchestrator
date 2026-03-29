import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import fs from 'fs/promises';
import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import { fileURLToPath } from 'url';
import {
    initMemory,
    queryMemory,
    saveSessionSummary,
    appendToDailyLog,
    appendFallbackTrace,
    generateSummary,
    loadSessionHistory,
    manualSave
} from './utils/memory.js';
import { runVibeAgent, buildAgentConfig } from './utils/agents.js';
import { applyCodeToFiles, executeAndTest, autoCommitGit, listRepos, listDirectoryNodes, createNewRepo } from './utils/actions.js';
import { scanAvailableClis, getAvailableModels } from './utils/cli-detector.js';
import { scanAvailableIdes, launchIdeForRepo } from './utils/ide-manager.js';
import {
    createMainMenuKeyboard,
    createRepoKeyboard,
    createConfigKeyboard,
    createModelKeyboard,
    createIdeKeyboard,
    createLanguageKeyboard,
    createTaskProfileKeyboard,
    createWorkspaceModeKeyboard,
    createSettingsKeyboard,
    Messages
} from './utils/ui.js';
import { t, normalizeLocale, languageName } from './utils/i18n.js';
import { resolveRemoteDispatch } from './utils/dispatch.js';
import {
    createSessionState,
    ensureSessionState,
    setSessionState,
    startSessionRun,
    recordFallback,
    finishSessionRun,
    appendRunHistory
} from './utils/session-state.js';
import { getDefaultWorkspaceStatus, prepareSessionWorkspace } from './utils/workspace-sessions.js';
import { getTaskProfile } from './utils/task-profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chargement et conversion de l'ID autorisé
const MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: Infinity });

const BASE_PROG_PATH = process.env.BASE_PROG_PATH || "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
const REPO_PATH = process.cwd();

// --- ELECTRON WINDOW ---
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'gui', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        frame: true,
        title: "VibeRemote"
    });

    mainWindow.loadFile(path.join(__dirname, 'gui', 'index.html'));

    // Envoyer le status initial
    mainWindow.webContents.on('did-finish-load', () => {
        syncGuiSession(MY_TELEGRAM_ID);
        setGuiDispatchState(MY_TELEGRAM_ID, { mode: 'idle', source: 'remote' });
        broadcastMenu(MY_TELEGRAM_ID);
    });
}

// Helper pour envoyer au GUI
function notifyGUI(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

function buildGuiStrings(locale = 'fr') {
    return {
        title: t(locale, 'app_title'),
        noProject: t(locale, 'gui_no_project'),
        ready: t(locale, 'gui_ready'),
        welcome: t(locale, 'gui_welcome'),
        inputPlaceholder: t(locale, 'gui_input_placeholder'),
        send: t(locale, 'gui_send'),
        dispatchTitle: t(locale, 'gui_dispatch_title'),
        dispatchIdle: t(locale, 'gui_dispatch_idle'),
        dispatchLocal: t(locale, 'gui_dispatch_local'),
        dispatchPipeline: t(locale, 'gui_dispatch_pipeline'),
        monitorTitle: t(locale, 'gui_monitor_title'),
        monitorState: t(locale, 'gui_monitor_state'),
        monitorCli: t(locale, 'gui_monitor_cli'),
        monitorModel: t(locale, 'gui_monitor_model'),
        monitorProfile: t(locale, 'gui_monitor_profile'),
        monitorWorkspace: t(locale, 'gui_monitor_workspace'),
        monitorFallbacks: t(locale, 'gui_monitor_fallbacks'),
        monitorAttempts: t(locale, 'gui_monitor_attempts'),
        monitorLastTrace: t(locale, 'gui_monitor_last_trace'),
        monitorNone: t(locale, 'gui_monitor_none')
    };
}

function stateLabel(locale, state) {
    return t(locale, `session_state_${state || 'idle'}`);
}

function fallbackReasonLabel(locale, reason) {
    return t(locale, `fallback_reason_${reason || 'ok'}`);
}

function workspaceModeLabel(locale, mode) {
    return t(locale, `workspace_mode_${mode || 'project'}`);
}

function workspaceFallbackReasonLabel(locale, reason) {
    return t(locale, `workspace_fallback_reason_${reason || 'not_git_repository'}`);
}

function workspaceStatusLabel(locale, session) {
    const statusKey = `workspace_status_${session.workspaceStatus || getDefaultWorkspaceStatus(session.workspaceMode)}`;
    const baseLabel = t(locale, statusKey);
    if (session.workspaceStatus === 'fallback' && session.workspaceFallbackReason) {
        return `${baseLabel} (${workspaceFallbackReasonLabel(locale, session.workspaceFallbackReason)})`;
    }
    return baseLabel;
}

function taskProfileLabel(locale, taskProfile) {
    return t(locale, `task_profile_${taskProfile || 'code'}`);
}

function buildTraceLabel(locale, trace) {
    if (!trace?.cli) return t(locale, 'gui_monitor_none');
    return `${trace.cli} - ${fallbackReasonLabel(locale, trace.reason)}`;
}

function buildSessionMonitor(locale, session) {
    return {
        state: session.state,
        stateLabel: stateLabel(locale, session.state),
        currentCli: session.defaultCli || t(locale, 'status_auto'),
        currentModel: session.defaultModel || t(locale, 'status_auto'),
        taskProfile: session.taskProfile,
        taskProfileLabel: taskProfileLabel(locale, session.taskProfile),
        workspaceMode: session.workspaceMode,
        workspaceModeLabel: `${workspaceModeLabel(locale, session.workspaceMode)} - ${workspaceStatusLabel(locale, session)}`,
        workspaceStatus: session.workspaceStatus,
        workspaceStatusLabel: workspaceStatusLabel(locale, session),
        fallbackCount: session.fallbackCount || 0,
        activeRunAttempts: session.activeRun?.attempts || 0,
        lastTraceLabel: buildTraceLabel(locale, session.lastTrace),
        lastTrace: session.lastTrace || null
    };
}

function syncGuiSession(chatId) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';
    const payload = {
        activeRepo: session.activeRepo,
        locale,
        strings: buildGuiStrings(locale),
        monitor: buildSessionMonitor(locale, session)
    };

    notifyGUI('session-update', payload);
    notifyGUI('locale-update', payload);
}

function setGuiDispatchState(chatId, { mode = 'idle', source = 'remote', label = '' } = {}) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';
    const sourceKey = source === 'gui'
        ? 'dispatch_source_gui'
        : source === 'telegram'
            ? 'dispatch_source_telegram'
            : 'dispatch_source_remote';
    const modeLabel = mode === 'local'
        ? t(locale, 'gui_dispatch_local')
        : mode === 'pipeline'
            ? t(locale, 'gui_dispatch_pipeline')
            : t(locale, 'gui_dispatch_idle');

    notifyGUI('dispatch-update', {
        mode,
        source,
        sourceLabel: t(locale, sourceKey),
        modeLabel,
        label: label || modeLabel
    });

    if (mode === 'idle') {
        notifyGUI('status-update', { text: t(locale, 'gui_ready') });
    }
}

async function pushRuntimeStatus(chatId, feedback, text) {
    await feedback.sendUpdate(text);
    notifyGUI('status-update', { text });
    syncGuiSession(chatId);
}

// Helper pour synchroniser les menus Telegram -> GUI
function broadcastMenu(chatId, customKeyboard = null) {
    const session = getSession(chatId);
    let keyboard = customKeyboard;

    if (!keyboard) {
        if (session.state === 'idle') {
            keyboard = createMainMenuKeyboard(session);
        }
    }

    if (keyboard && keyboard.reply_markup && keyboard.reply_markup.inline_keyboard) {
        notifyGUI('tiles-update', { tiles: keyboard.reply_markup.inline_keyboard });
    }
}

// --- HELPER FORMATTING ---
const escapeMd = (str) => str ? str.toString().replace(/([_*\[\]()~`>#\+\-=|{}\.!])/g, '\\$1') : '';

// --- GESTION DES SESSIONS ---
const sessions = {};
let AVAILABLE_CLIS = [];      // Sera peuplé dynamiquement
let AVAILABLE_MODELS = {};    // { claude: [...], gemini: [...] }
let FALLBACK_ORDER = [];      // Ordre de fallback dynamique
let AVAILABLE_IDES = [];      // IDE détectés dynamiquement
let IDE_FALLBACK_ORDER = [];  // Ordre de fallback des IDE

function getSession(chatId) {
    if (!sessions[chatId]) {
        sessions[chatId] = createSessionState();
    } else {
        sessions[chatId] = ensureSessionState(sessions[chatId]);
    }

    return sessions[chatId];
}

function updateSession(chatId, updater) {
    const current = getSession(chatId);
    const next = typeof updater === 'function'
        ? updater(current)
        : { ...current, ...updater };
    sessions[chatId] = ensureSessionState(next);
    syncGuiSession(chatId);
    return sessions[chatId];
}

function createBackKeyboard(locale, target = 'nav:main') {
    return Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), target)]]);
}

function createRunsKeyboard(locale, session) {
    const buttons = [];
    if (session?.lastPrompt) {
        buttons.push(Markup.button.callback(t(locale, 'menu_rerun'), 'action:rerun_last'));
    }
    if (session?.runHistory?.length) {
        buttons.push(Markup.button.callback(t(locale, 'menu_run_detail'), 'action:run_detail'));
    }
    buttons.push(Markup.button.callback(t(locale, 'menu_back'), 'nav:main'));
    return Markup.inlineKeyboard([buttons]);
}

function createRunDetailKeyboard(locale, session, runIndex = 0) {
    const buttons = [];
    const maxIndex = Math.max((session?.runHistory?.length || 1) - 1, 0);

    if (runIndex > 0) {
        buttons.push(Markup.button.callback(t(locale, 'pager_prev'), `action:run_detail:${runIndex - 1}`));
    }
    if (runIndex < maxIndex) {
        buttons.push(Markup.button.callback(t(locale, 'pager_next'), `action:run_detail:${runIndex + 1}`));
    }
    if (session?.lastPrompt) {
        buttons.push(Markup.button.callback(t(locale, 'menu_rerun'), 'action:rerun_last'));
    }
    buttons.push(Markup.button.callback(t(locale, 'menu_back'), 'action:runs'));
    return Markup.inlineKeyboard([buttons]);
}

function createTelegramReplyContext(ctx, action = 'remote:text') {
    return {
        ...ctx,
        callbackQuery: { data: action },
        match: [null, action.split(':')[1]],
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
}

function createGuiMockContext(chatId, action = 'remote:text') {
    return {
        chat: { id: chatId },
        from: { id: chatId },
        callbackQuery: { data: action },
        match: [null, action.split(':')[1]],
        answerCbQuery: async () => {},
        editMessageText: async (text, extra) => {
            notifyGUI('message-to-gui', { text });
            if (extra?.reply_markup) {
                notifyGUI('tiles-update', { tiles: extra.reply_markup.inline_keyboard });
            }
        },
        reply: async (text, extra) => {
            notifyGUI('message-to-gui', { text });
            if (extra?.reply_markup) {
                notifyGUI('tiles-update', { tiles: extra.reply_markup.inline_keyboard });
            }
        }
    };
}

function describeDispatch(locale, dispatch) {
    switch (dispatch.type) {
        case 'show_main_menu':
            return t(locale, 'dispatch_intent_main');
        case 'show_projects':
            return t(locale, 'dispatch_intent_projects');
        case 'show_config':
            return t(locale, 'dispatch_intent_config');
        case 'show_settings':
            return t(locale, 'dispatch_intent_settings');
        case 'show_workspace_menu':
            return t(locale, 'dispatch_intent_workspace_menu');
        case 'show_profile_menu':
            return t(locale, 'dispatch_intent_profile_menu');
        case 'show_model_menu':
            return t(locale, 'dispatch_intent_model');
        case 'show_ide_menu':
            return t(locale, 'dispatch_intent_ide_menu');
        case 'show_language_menu':
            return t(locale, 'dispatch_intent_language_menu');
        case 'show_help':
            return t(locale, 'dispatch_intent_help');
        case 'show_runs':
            return t(locale, 'dispatch_intent_runs');
        case 'rerun_last':
            return t(locale, 'dispatch_intent_rerun');
        case 'show_run_detail':
            return dispatch.value !== undefined
                ? `${t(locale, 'dispatch_intent_run_detail')} #${Number(dispatch.value) + 1}`
                : t(locale, 'dispatch_intent_run_detail');
        case 'show_memory':
            return t(locale, 'menu_memory');
        case 'show_history':
            return t(locale, 'dispatch_intent_history');
        case 'open_ide':
            return dispatch.value && dispatch.value !== 'auto'
                ? t(locale, 'dispatch_intent_open_ide_target', { ide: dispatch.value })
                : t(locale, 'dispatch_intent_open_ide');
        case 'select_repo':
            return t(locale, 'dispatch_intent_select_repo', { repo: dispatch.value });
        case 'create_repo':
            return t(locale, 'dispatch_intent_create_repo', { repo: dispatch.value });
        case 'set_cli':
            return t(locale, 'dispatch_intent_set_cli', { cli: dispatch.value });
        case 'set_model':
            return t(locale, 'dispatch_intent_set_model', { model: dispatch.value });
        case 'set_ide':
            return t(locale, 'dispatch_intent_set_ide', { ide: dispatch.value });
        case 'set_lang':
            return t(locale, 'dispatch_intent_set_lang', { lang: languageName(dispatch.value, locale) });
        case 'set_workspace_mode':
            return t(locale, 'dispatch_intent_set_workspace_mode', {
                mode: workspaceModeLabel(locale, dispatch.value)
            });
        case 'set_task_profile':
            return t(locale, 'dispatch_intent_set_task_profile', {
                profile: taskProfileLabel(locale, dispatch.value)
            });
        case 'manual_save':
            return t(locale, 'dispatch_intent_save');
        case 'set_notes_mode':
            return t(locale, 'dispatch_intent_notes');
        case 'refresh_clis':
            return t(locale, 'dispatch_intent_refresh_clis');
        case 'refresh_ides':
            return t(locale, 'dispatch_intent_refresh_ides');
        case 'show_code_prompt':
            return t(locale, 'dispatch_intent_code');
        default:
            return dispatch.type;
    }
}

function formatSessionStatusBlock(locale, session) {
    const lastTrace = session.lastTrace?.cli
        ? `${session.lastTrace.cli} - ${fallbackReasonLabel(locale, session.lastTrace.reason)}`
        : t(locale, 'gui_monitor_none');

    return [
        `**${t(locale, 'gui_monitor_title')}**`,
        `${t(locale, 'settings_state')}: ${stateLabel(locale, session.state)}`,
        `${t(locale, 'settings_cli')}: ${session.defaultCli || t(locale, 'status_auto')}`,
        `${t(locale, 'config_model_current')}: ${session.defaultModel || t(locale, 'status_auto')}`,
        `${t(locale, 'settings_task_profile')}: ${taskProfileLabel(locale, session.taskProfile)}`,
        `${t(locale, 'settings_workspace_mode')}: ${workspaceModeLabel(locale, session.workspaceMode)}`,
        `${t(locale, 'settings_workspace_status')}: ${workspaceStatusLabel(locale, session)}`,
        `${t(locale, 'settings_fallbacks')}: ${session.fallbackCount || 0}`,
        `${t(locale, 'settings_last_trace')}: ${lastTrace}`
    ].join('\n');
}

async function resolveSessionWorkspace(chatId) {
    const session = getSession(chatId);
    const workspace = await prepareSessionWorkspace(BASE_PROG_PATH, session);
    updateSession(chatId, current => ({
        ...current,
        workspacePath: workspace.workspacePath,
        workspaceStatus: workspace.status,
        workspaceFallbackReason: workspace.fallbackReason || null
    }));
    return workspace;
}

async function buildMemoryOverview(chatId) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';
    const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
    const query = session.lastPrompt || session.activeRepo;
    const context = (await queryMemory(BASE_PROG_PATH, query)).trim();
    const contextSnippet = context
        ? escapeMd(context.slice(0, 1200))
        : t(locale, 'memory_none');
    const recentSessions = history.length
        ? history.slice(0, 5).map((entry, idx) => `${idx + 1}. \`${entry.filename}\``).join('\n')
        : `- ${t(locale, 'no_history')}`;

    return `${t(locale, 'memory_title', { repo: escapeMd(session.activeRepo) })}

${t(locale, 'memory_recent_sessions')}:
${recentSessions}

${t(locale, 'memory_context')}:
${contextSnippet}`;
}

async function buildRunsOverview(chatId) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';

    if (!session.runHistory?.length) {
        return t(locale, 'runs_none');
    }

    const lines = session.runHistory.slice(0, 5).map((run, index) => {
        const status = run.success ? 'OK' : 'FAIL';
        const promptSnippet = escapeMd((run.promptSnippet || '').slice(0, 72));
        const parts = [
            `${index + 1}. ${status}`,
            run.cli || t(locale, 'status_auto'),
            taskProfileLabel(locale, run.taskProfile),
            workspaceModeLabel(locale, run.workspaceMode)
        ];
        if (run.attempts) {
            parts.push(`${run.attempts}x`);
        }
        let line = parts.join(' | ');
        if (promptSnippet) {
            line += `\n   ${promptSnippet}`;
        }
        if (!run.success && run.detail) {
            line += `\n   ${escapeMd(run.detail.slice(0, 120))}`;
        }
        return line;
    });

    return `${t(locale, 'runs_title', { repo: escapeMd(session.activeRepo || t(locale, 'status_repo_none')) })}\n\n${lines.join('\n')}`;
}

async function buildRunDetail(chatId, runIndex = 0) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';
    const normalizedIndex = Number.isFinite(runIndex) ? Math.max(0, runIndex) : 0;
    const run = session.runHistory?.[normalizedIndex];

    if (!run) {
        return t(locale, 'run_detail_none');
    }

    const status = run.success ? 'OK' : 'FAIL';
    const traces = Array.isArray(run.traces) && run.traces.length
        ? run.traces.map((trace, index) => {
            const reason = fallbackReasonLabel(locale, trace.reason);
            const duration = trace.durationMs ? ` ${trace.durationMs}ms` : '';
            return `${index + 1}. ${trace.cli} | ${trace.status} | ${reason}${duration}`;
        }).join('\n')
        : '-';

    return `${t(locale, 'run_detail_title', { repo: escapeMd(session.activeRepo || t(locale, 'status_repo_none')) })} #${normalizedIndex + 1}

Status: ${status}
CLI: ${run.cli || t(locale, 'status_auto')}
${t(locale, 'settings_task_profile')}: ${taskProfileLabel(locale, run.taskProfile)}
${t(locale, 'settings_workspace_mode')}: ${workspaceModeLabel(locale, run.workspaceMode)}
Attempts: ${run.attempts || 0}

Prompt:
${escapeMd(run.promptSnippet || session.lastPrompt || '-')}

Detail:
${escapeMd(run.detail || '-')}

Traces:
${traces}`;
}

async function rerunLastRequest(chatId, feedback) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';

    if (!session.lastPrompt) {
        await feedback.reply(t(locale, 'rerun_none'));
        return;
    }

    await feedback.reply(t(locale, 'rerun_started'));
    return processPipelineRequest(chatId, session.lastPrompt, feedback);
}

async function handleDispatchedCommand(chatId, dispatch, { source, feedback, uiContext }) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';

    setGuiDispatchState(chatId, {
        mode: 'local',
        source,
        label: describeDispatch(locale, dispatch)
    });

    switch (dispatch.type) {
        case 'show_main_menu':
            updateSession(chatId, current => setSessionState(current, 'idle'));
            await showMainMenu(uiContext);
            return true;
        case 'show_projects':
            updateSession(chatId, current => setSessionState(current, 'idle'));
            await showRepoSelection(uiContext, 0);
            return true;
        case 'show_config':
            await showConfigMenu(uiContext);
            return true;
        case 'show_settings':
            await showSettingsMenu(uiContext);
            return true;
        case 'show_workspace_menu':
            await showWorkspaceModeMenu(uiContext);
            return true;
        case 'show_profile_menu':
            await showTaskProfileMenu(uiContext);
            return true;
        case 'show_model_menu':
            await showModelMenu(uiContext);
            return true;
        case 'show_ide_menu':
            await showIdeMenu(uiContext);
            return true;
        case 'show_language_menu':
            await showLanguageMenu(uiContext);
            return true;
        case 'show_code_prompt':
            await uiContext.reply(Messages.awaitingInput(locale), {
                parse_mode: 'Markdown',
                ...createBackKeyboard(locale)
            });
            return true;
        case 'show_help':
            await uiContext.reply(Messages.help(locale), {
                parse_mode: 'Markdown',
                ...createBackKeyboard(locale)
            });
            return true;
        case 'show_memory': {
            if (!session.activeRepo) {
                await feedback.reply(t(locale, 'no_project'));
                return true;
            }

            await uiContext.reply(await buildMemoryOverview(chatId), {
                parse_mode: 'Markdown',
                ...createBackKeyboard(locale)
            });
            return true;
        }
        case 'show_runs': {
            if (!session.activeRepo) {
                await feedback.reply(t(locale, 'no_project'));
                return true;
            }

            await uiContext.reply(await buildRunsOverview(chatId), {
                parse_mode: 'Markdown',
                ...createRunsKeyboard(locale, session)
            });
            return true;
        }
        case 'rerun_last':
            await rerunLastRequest(chatId, feedback);
            return true;
        case 'show_run_detail': {
            if (!session.activeRepo) {
                await feedback.reply(t(locale, 'no_project'));
                return true;
            }

            await uiContext.reply(await buildRunDetail(chatId, dispatch.value ?? 0), {
                parse_mode: 'Markdown',
                ...createRunDetailKeyboard(locale, getSession(chatId), dispatch.value ?? 0)
            });
            return true;
        }
        case 'show_history': {
            if (!session.activeRepo) {
                await feedback.reply(t(locale, 'no_project'));
                return true;
            }

            const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
            if (!history.length) {
                await feedback.reply(t(locale, 'no_history'));
                return true;
            }

            const lines = history.slice(0, 5).map((entry, idx) => `${idx + 1}. \`${entry.filename}\``).join('\n');
            await uiContext.reply(`${t(locale, 'history_title', { repo: escapeMd(session.activeRepo) })}\n\n${lines}`, {
                parse_mode: 'Markdown',
                ...createBackKeyboard(locale)
            });
            return true;
        }
        case 'select_repo':
            const selectedSession = updateSession(chatId, current => setSessionState(current, 'idle', {
                activeRepo: dispatch.value,
                browserPath: dispatch.value,
                workspacePath: null,
                workspaceStatus: getDefaultWorkspaceStatus(current.workspaceMode),
                workspaceFallbackReason: null
            }));
            syncGuiSession(chatId);
            await uiContext.reply(Messages.repoSelected(dispatch.value, locale), {
                parse_mode: 'Markdown',
                ...createMainMenuKeyboard(selectedSession)
            });
            broadcastMenu(chatId);
            return true;
        case 'create_repo': {
            const result = await createNewRepo(BASE_PROG_PATH, dispatch.value, session.browserPath || '');
            if (!result.success) {
                await feedback.reply(t(locale, 'fatal_error', { error: result.error }));
                return true;
            }

            const createdSession = updateSession(chatId, current => setSessionState(current, 'idle', {
                activeRepo: result.relativePath || dispatch.value,
                browserPath: result.relativePath || current.browserPath,
                workspacePath: null,
                workspaceStatus: getDefaultWorkspaceStatus(current.workspaceMode),
                workspaceFallbackReason: null
            }));
            syncGuiSession(chatId);
            await uiContext.reply(t(locale, 'repo_ready', { repo: escapeMd(createdSession.activeRepo) }), {
                parse_mode: 'Markdown',
                ...createMainMenuKeyboard(createdSession)
            });
            broadcastMenu(chatId);
            return true;
        }
        case 'set_cli':
            session.defaultCli = dispatch.value;
            if (session.disabledClis.includes(dispatch.value)) {
                session.disabledClis = session.disabledClis.filter(cli => cli !== dispatch.value);
            }
            session.defaultModel = null;
            await showConfigMenu(uiContext);
            return true;
        case 'set_model':
            session.defaultModel = dispatch.value;
            await showModelMenu(uiContext);
            return true;
        case 'set_ide':
            session.defaultIde = dispatch.value;
            if (session.disabledIdes.includes(dispatch.value)) {
                session.disabledIdes = session.disabledIdes.filter(ide => ide !== dispatch.value);
            }
            await showIdeMenu(uiContext);
            return true;
        case 'set_lang': {
            const nextLocale = normalizeLocale(dispatch.value);
            session.locale = nextLocale;
            syncGuiSession(chatId);
            setGuiDispatchState(chatId, {
                mode: 'local',
                source,
                label: describeDispatch(nextLocale, dispatch)
            });
            await showLanguageMenu(uiContext);
            return true;
        }
        case 'set_workspace_mode':
            updateSession(chatId, current => ({
                ...current,
                workspaceMode: dispatch.value,
                workspacePath: null,
                workspaceStatus: getDefaultWorkspaceStatus(dispatch.value),
                workspaceFallbackReason: null
            }));
            await showWorkspaceModeMenu(uiContext);
            return true;
        case 'set_task_profile':
            updateSession(chatId, current => ({
                ...current,
                taskProfile: dispatch.value
            }));
            await showTaskProfileMenu(uiContext);
            return true;
        case 'open_ide': {
            if (!session.activeRepo) {
                await feedback.reply(t(locale, 'no_project'));
                return true;
            }

            const workspace = await resolveSessionWorkspace(chatId);
            try {
                const opened = launchIdeForRepo(workspace.executionPath, {
                    preferredIde: dispatch.value && dispatch.value !== 'auto' ? dispatch.value : session.defaultIde,
                    fallbackOrder: IDE_FALLBACK_ORDER,
                    disabledIdes: session.disabledIdes
                });
                if (workspace.status === 'fallback') {
                    await feedback.reply(t(locale, 'workspace_fallback_line', {
                        reason: workspaceFallbackReasonLabel(locale, workspace.fallbackReason)
                    }));
                }
                await feedback.reply(t(locale, 'ide_opened', { ide: opened.ide, repo: session.activeRepo }));
            } catch (err) {
                await feedback.reply(t(locale, 'ide_failed', { error: err.message }));
            }
            return true;
        }
        case 'manual_save': {
            const result = await manualSave(BASE_PROG_PATH, session);
            if (!result.success) {
                await feedback.reply(t(locale, 'save_failed', { error: result.error }));
                return true;
            }
            await feedback.reply(t(locale, 'save_ok', { path: result.path }));
            return true;
        }
        case 'set_notes_mode':
            updateSession(chatId, current => setSessionState(current, 'awaiting_notes_input', {
                awaitingNotesInput: true
            }));
            await feedback.reply(source === 'gui' ? t(locale, 'gui_notes_prompt') : t(locale, 'notes_prompt'));
            return true;
        case 'refresh_clis':
            await initAvailableClis();
            await showConfigMenu(uiContext);
            return true;
        case 'refresh_ides':
            await initAvailableIdes();
            await showIdeMenu(uiContext);
            return true;
        default:
            return false;
    }
}

async function routeIncomingText(chatId, text, { source, feedback, uiContext }) {
    if (!text || !text.trim()) {
        return;
    }

    const dispatch = resolveRemoteDispatch(text, {
        repos: await listRepos(BASE_PROG_PATH),
        availableClis: AVAILABLE_CLIS,
        availableIdes: AVAILABLE_IDES,
        availableModels: AVAILABLE_MODELS
    });

    if (dispatch) {
        return handleDispatchedCommand(chatId, dispatch, { source, feedback, uiContext });
    }

    setGuiDispatchState(chatId, {
        mode: 'pipeline',
        source,
        label: text.slice(0, 80)
    });

    return processPipelineRequest(chatId, text, feedback);
}

// Initialiser les CLI disponibles au démarrage
async function initAvailableClis() {
    console.log('[CLI] Scan des CLI installés...');
    try {
        const clis = await scanAvailableClis();
        AVAILABLE_CLIS = clis.map(c => c.name);
        AVAILABLE_MODELS = Object.fromEntries(clis.map(c => [c.name, c.models]));
        FALLBACK_ORDER = clis.map(c => c.name); // Déjà trié par priorité

        console.log('[CLI] Disponibles:', AVAILABLE_CLIS.join(', '));
        console.log('[CLI] Fallback order:', FALLBACK_ORDER.join(' > '));
    } catch (err) {
        console.error('[CLI] Erreur lors du scan:', err);
        // Fallback hardcoded
        AVAILABLE_CLIS = ['claude', 'gemini', 'codex', 'qwen', 'opencode'];
        AVAILABLE_MODELS = {
            claude: ['sonnet', 'opus', 'haiku'],
            gemini: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
            codex: ['o3', 'o4-mini', 'gpt-4.1'],
            qwen: ['qwen3.5', 'qwen3', 'qwen2.5-coder'],
            opencode: []
        };
        FALLBACK_ORDER = ['claude', 'gemini', 'codex', 'qwen', 'opencode'];
    }
}

async function initAvailableIdes() {
    console.log('[IDE] Scan des IDE installés...');
    try {
        const ides = await scanAvailableIdes();
        AVAILABLE_IDES = ides.map(i => i.name);
        IDE_FALLBACK_ORDER = [...AVAILABLE_IDES];
        console.log('[IDE] Disponibles:', AVAILABLE_IDES.join(', ') || 'aucun');
        console.log('[IDE] Fallback order:', IDE_FALLBACK_ORDER.join(' > ') || 'aucun');
    } catch (err) {
        console.error('[IDE] Erreur lors du scan:', err);
        AVAILABLE_IDES = ['cursor', 'vscode', 'windsurf', 'webstorm', 'idea', 'pycharm', 'visualstudio'];
        IDE_FALLBACK_ORDER = [...AVAILABLE_IDES];
    }
}

// --- SÉCURITÉ ---
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id !== MY_TELEGRAM_ID) return;
    return next();
});

// --- UI PRINCIPALE ---
async function showMainMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const text = Messages.main(session);

    if (ctx.callbackQuery) {
        const res = await ctx.editMessageText(text, { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
        broadcastMenu(ctx.chat.id);
        return res;
    }
    const res = await ctx.reply(text, { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    broadcastMenu(ctx.chat.id);
    return res;
}

async function showRepoSelection(ctx, page = 0) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const browserState = await listDirectoryNodes(BASE_PROG_PATH, session.browserPath || '');
    const keyboard = await createRepoKeyboard(browserState, page, locale);
    const currentFolder = browserState.currentPath || '.';
    const activeFolder = session.activeRepo || t(locale, 'status_repo_none');
    const body = browserState.entries.length
        ? ''
        : `\n${t(locale, 'folder_empty')}`;
    const text = `${t(locale, 'repo_select_title')}\n\n${t(locale, 'folder_current')}: \`${escapeMd(currentFolder)}\`\n${t(locale, 'folder_active')}: \`${escapeMd(activeFolder)}\`${body}`;

    if (ctx.callbackQuery) {
        const res = await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
        broadcastMenu(ctx.chat.id, keyboard);
        return res;
    }
    const res = await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
    return res;
}

async function showConfigMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'config_cli_title')}\n\n${t(locale, 'config_cli_current')}: **${session.defaultCli || t(locale, 'status_auto_icon')}**`;
    const keyboard = createConfigKeyboard(session, AVAILABLE_CLIS);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showModelMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const currentCli = session.defaultCli || 'auto';
    const cliToShow = currentCli === 'auto' ? (FALLBACK_ORDER[0] || 'gemini') : currentCli;
    const text = `${t(locale, 'config_model_title')}\n\n${t(locale, 'config_model_current')}: **${session.defaultModel || t(locale, 'status_auto_icon')}**\n${t(locale, 'config_model_cli')}: ${cliToShow}`;
    const keyboard = createModelKeyboard(session, AVAILABLE_MODELS);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showSettingsMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'settings_title')}\n\n${t(locale, 'settings_project')}: ${escapeMd(session.activeRepo) || t(locale, 'status_repo_none')}\n${t(locale, 'settings_cli')}: ${session.defaultCli || t(locale, 'status_auto')}\n${t(locale, 'settings_ide')}: ${session.defaultIde || t(locale, 'status_auto')}\n${t(locale, 'settings_task_profile')}: ${taskProfileLabel(locale, session.taskProfile)}\n${t(locale, 'settings_workspace_mode')}: ${workspaceModeLabel(locale, session.workspaceMode)}\n\n${formatSessionStatusBlock(locale, session)}`;
    const keyboard = createSettingsKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showWorkspaceModeMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'workspace_title')}\n\n${t(locale, 'workspace_current_mode')}: **${workspaceModeLabel(locale, session.workspaceMode)}**\n${t(locale, 'workspace_current_status')}: ${workspaceStatusLabel(locale, session)}`;
    const keyboard = createWorkspaceModeKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showTaskProfileMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'profile_title')}\n\n${t(locale, 'profile_current')}: **${taskProfileLabel(locale, session.taskProfile)}**`;
    const keyboard = createTaskProfileKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showIdeMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'config_ide_title')}\n\n${t(locale, 'config_ide_current')}: **${session.defaultIde || t(locale, 'status_auto_icon')}**`;
    const keyboard = createIdeKeyboard(session, AVAILABLE_IDES);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showLanguageMenu(ctx) {
    const session = getSession(ctx.chat.id);
    syncGuiSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'config_language_title')}\n\n${t(locale, 'config_language_current')}: **${languageName(locale, locale)}**`;
    const keyboard = createLanguageKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

bot.command('code', async ctx => {
    getSession(ctx.chat.id).state = "idle";
    await showRepoSelection(ctx, 0);
});

bot.command('cli', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:config' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showConfigMenu(mockCtx);
});

bot.command('model', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:model' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showModelMenu(mockCtx);
});

bot.command('settings', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:settings' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showSettingsMenu(mockCtx);
});

bot.command('workspace', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:workspace' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showWorkspaceModeMenu(mockCtx);
});

bot.command('profile', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:profile' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showTaskProfileMenu(mockCtx);
});

bot.command('ide', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:ide' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showIdeMenu(mockCtx);
});

bot.command('lang', async ctx => {
    const mockCtx = {
        ...ctx,
        callbackQuery: { data: 'nav:language' },
        editMessageText: async (text, extra) => ctx.reply(text, extra)
    };
    await showLanguageMenu(mockCtx);
});

bot.command('history', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        return ctx.reply(t(locale, 'no_project'), { parse_mode: 'Markdown' });
    }
    const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
    if (!history.length) {
        return ctx.reply(t(locale, 'no_history'), { parse_mode: 'Markdown' });
    }
    const lines = history.slice(0, 5).map((h, idx) => `${idx + 1}. \`${h.filename}\``);
    return ctx.reply(`${t(locale, 'history_title', { repo: escapeMd(session.activeRepo) })}\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
});

bot.command('runs', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        return ctx.reply(t(locale, 'no_project'), { parse_mode: 'Markdown' });
    }
    return ctx.reply(await buildRunsOverview(ctx.chat.id), { parse_mode: 'Markdown', ...createRunsKeyboard(locale, session) });
});

bot.command('rerun', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const feedback = {
        reply: async (m) => ctx.reply(m, { parse_mode: 'Markdown' }),
        sendInitialStatus: async (m) => { await ctx.reply(m); },
        sendUpdate: async (m) => { await ctx.reply(m); }
    };

    if (!session.activeRepo) {
        return ctx.reply(t(locale, 'no_project'), { parse_mode: 'Markdown' });
    }

    return rerunLastRequest(ctx.chat.id, feedback);
});

bot.command('run_detail', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const tokens = ctx.message.text.trim().split(/\s+/);
    const parsedIndex = tokens[1] ? Number.parseInt(tokens[1], 10) - 1 : 0;
    const runIndex = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
    if (!session.activeRepo) {
        return ctx.reply(t(locale, 'no_project'), { parse_mode: 'Markdown' });
    }
    return ctx.reply(await buildRunDetail(ctx.chat.id, runIndex), { parse_mode: 'Markdown', ...createRunDetailKeyboard(locale, session, runIndex) });
});

bot.command('save', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const result = await manualSave(BASE_PROG_PATH, session);
    if (!result.success) {
        return ctx.reply(t(locale, 'save_failed', { error: escapeMd(result.error) }), { parse_mode: 'Markdown' });
    }
    return ctx.reply(t(locale, 'save_ok', { path: result.path }), { parse_mode: 'Markdown' });
});

bot.action(/page:(.+)/, ctx => showRepoSelection(ctx, parseInt(ctx.match[1])));
bot.action("new_repo", ctx => {
    const session = getSession(ctx.chat.id);
    updateSession(ctx.chat.id, current => setSessionState(current, 'awaiting_repo_name'));
    return ctx.editMessageText(t(session.locale || 'fr', 'repo_new_prompt'), { parse_mode: 'Markdown' });
});

bot.action('browse_root', async ctx => {
    updateSession(ctx.chat.id, { browserPath: '' });
    await showRepoSelection(ctx, 0);
});

bot.action(/browse:(.+)/, async ctx => {
    updateSession(ctx.chat.id, { browserPath: decodeURIComponent(ctx.match[1]) });
    await showRepoSelection(ctx, 0);
});

bot.action(/select_repo:(.+)/, async (ctx) => {
    const repoName = decodeURIComponent(ctx.match[1]);
    const session = updateSession(ctx.chat.id, current => setSessionState(current, 'idle', {
        activeRepo: repoName,
        browserPath: repoName,
        workspacePath: null,
        workspaceStatus: getDefaultWorkspaceStatus(current.workspaceMode),
        workspaceFallbackReason: null
    }));
    const locale = session.locale || 'fr';

    syncGuiSession(ctx.chat.id);
    await ctx.answerCbQuery(`Projet: ${repoName}`);
    await ctx.editMessageText(Messages.repoSelected(repoName, locale), {
        parse_mode: 'Markdown',
        ...createMainMenuKeyboard(session)
    });
    broadcastMenu(ctx.chat.id);
});

bot.action('nav:main', async ctx => {
    updateSession(ctx.chat.id, current => setSessionState(current, 'idle'));
    await showMainMenu(ctx);
});

bot.action('nav:repos', async ctx => {
    const session = getSession(ctx.chat.id);
    if (session.activeRepo && !session.browserPath) {
        session.browserPath = session.activeRepo;
    }
    await showRepoSelection(ctx, 0);
});

bot.action('nav:config', showConfigMenu);
bot.action('nav:settings', showSettingsMenu);
bot.action('nav:workspace', showWorkspaceModeMenu);
bot.action('nav:profile', showTaskProfileMenu);
bot.action('nav:model', showModelMenu);
bot.action('nav:ide', showIdeMenu);
bot.action('nav:language', showLanguageMenu);

bot.action(/toggle_cli:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const cli = ctx.match[1];
    if (session.disabledClis.includes(cli)) {
        session.disabledClis = session.disabledClis.filter(c => c !== cli);
    } else {
        session.disabledClis.push(cli);
        if (session.defaultCli === cli) session.defaultCli = null;
    }
    await showConfigMenu(ctx);
});

bot.action(/set_cli:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const cli = ctx.match[1];
    session.defaultCli = cli === 'auto' ? null : cli;
    if (session.defaultCli && session.disabledClis.includes(session.defaultCli)) {
        session.disabledClis = session.disabledClis.filter(c => c !== session.defaultCli);
    }
    session.defaultModel = null;
    await showConfigMenu(ctx);
});

bot.action('refresh_clis', async ctx => {
    const locale = getSession(ctx.chat.id).locale || 'fr';
    await initAvailableClis();
    await ctx.answerCbQuery(`${t(locale, 'menu_refresh')} CLI`);
    await showConfigMenu(ctx);
});

bot.action(/set_model:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const model = ctx.match[1];
    session.defaultModel = model === 'auto' ? null : model;
    await showModelMenu(ctx);
});

bot.action(/toggle_ide:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const ide = ctx.match[1];
    if (session.disabledIdes.includes(ide)) {
        session.disabledIdes = session.disabledIdes.filter(i => i !== ide);
    } else {
        session.disabledIdes.push(ide);
        if (session.defaultIde === ide) session.defaultIde = null;
    }
    await showIdeMenu(ctx);
});

bot.action(/set_ide:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const ide = ctx.match[1];
    session.defaultIde = ide === 'auto' ? null : ide;
    if (session.defaultIde && session.disabledIdes.includes(session.defaultIde)) {
        session.disabledIdes = session.disabledIdes.filter(i => i !== session.defaultIde);
    }
    await showIdeMenu(ctx);
});

bot.action('refresh_ides', async ctx => {
    const locale = getSession(ctx.chat.id).locale || 'fr';
    await initAvailableIdes();
    await ctx.answerCbQuery(`${t(locale, 'menu_refresh')} IDE`);
    await showIdeMenu(ctx);
});

bot.action(/set_lang:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = normalizeLocale(ctx.match[1]);
    session.locale = locale;
    syncGuiSession(ctx.chat.id);
    await ctx.answerCbQuery(t(locale, 'language_set', { lang: languageName(locale, locale) }));
    await showLanguageMenu(ctx);
});

bot.action(/set_workspace_mode:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    session.workspaceMode = ctx.match[1];
    session.workspacePath = null;
    session.workspaceStatus = getDefaultWorkspaceStatus(session.workspaceMode);
    session.workspaceFallbackReason = null;
    syncGuiSession(ctx.chat.id);
    await ctx.answerCbQuery(`${t(session.locale || 'fr', 'settings_workspace_mode')}: ${workspaceModeLabel(session.locale || 'fr', session.workspaceMode)}`);
    await showWorkspaceModeMenu(ctx);
});

bot.action(/set_task_profile:(.+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    session.taskProfile = ctx.match[1];
    syncGuiSession(ctx.chat.id);
    await ctx.answerCbQuery(`${t(session.locale || 'fr', 'settings_task_profile')}: ${taskProfileLabel(session.locale || 'fr', session.taskProfile)}`);
    await showTaskProfileMenu(ctx);
});

bot.action('action:history', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        await ctx.editMessageText(t(locale, 'no_project'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
    if (!history.length) {
        await ctx.editMessageText(t(locale, 'no_history'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    const lines = history.slice(0, 5).map((h, idx) => `${idx + 1}. \`${h.filename}\``).join('\n');
    await ctx.editMessageText(`${t(locale, 'history_title', { repo: escapeMd(session.activeRepo) })}\n\n${lines}`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]])
    });
    broadcastMenu(ctx.chat.id, Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]]));
});

bot.action('action:runs', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        await ctx.editMessageText(t(locale, 'no_project'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    await ctx.editMessageText(await buildRunsOverview(ctx.chat.id), {
        parse_mode: 'Markdown',
        ...createRunsKeyboard(locale, session)
    });
    broadcastMenu(ctx.chat.id, createRunsKeyboard(locale, session));
});

bot.action('action:rerun_last', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const feedback = {
        reply: async (m) => ctx.reply(m, { parse_mode: 'Markdown' }),
        sendInitialStatus: async (m) => { await ctx.reply(m); },
        sendUpdate: async (m) => { await ctx.reply(m); }
    };

    await ctx.answerCbQuery(t(locale, 'menu_rerun'));
    await rerunLastRequest(ctx.chat.id, feedback);
});

bot.action('action:run_detail', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        await ctx.editMessageText(t(locale, 'no_project'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    await ctx.editMessageText(await buildRunDetail(ctx.chat.id, 0), {
        parse_mode: 'Markdown',
        ...createRunDetailKeyboard(locale, session, 0)
    });
    broadcastMenu(ctx.chat.id, createRunDetailKeyboard(locale, session, 0));
});

bot.action(/action:run_detail:(\d+)/, async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const runIndex = Number.parseInt(ctx.match[1], 10);
    if (!session.activeRepo) {
        await ctx.editMessageText(t(locale, 'no_project'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    await ctx.editMessageText(await buildRunDetail(ctx.chat.id, runIndex), {
        parse_mode: 'Markdown',
        ...createRunDetailKeyboard(locale, session, runIndex)
    });
    broadcastMenu(ctx.chat.id, createRunDetailKeyboard(locale, session, runIndex));
});

bot.action('action:memory', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        await ctx.editMessageText(t(locale, 'no_project'), {
            parse_mode: 'Markdown',
            ...createMainMenuKeyboard(session)
        });
        return;
    }

    await ctx.editMessageText(await buildMemoryOverview(ctx.chat.id), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]])
    });
    broadcastMenu(ctx.chat.id, Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]]));
});

bot.action('action:set_notes', async ctx => {
    updateSession(ctx.chat.id, current => setSessionState(current, 'awaiting_notes_input', {
        awaitingNotesInput: true
    }));
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    await ctx.editMessageText(t(locale, 'notes_prompt'), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:settings')]])
    });
});

bot.action('action:open_ide', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    if (!session.activeRepo) {
        return ctx.answerCbQuery(t(locale, 'no_project'));
    }

    const workspace = await resolveSessionWorkspace(ctx.chat.id);
    try {
        const opened = launchIdeForRepo(workspace.executionPath, {
            preferredIde: session.defaultIde,
            fallbackOrder: IDE_FALLBACK_ORDER,
            disabledIdes: session.disabledIdes
        });
        await ctx.answerCbQuery(t(locale, 'ide_opened_short', { ide: opened.ide }));
        if (workspace.status === 'fallback') {
            await ctx.reply(t(locale, 'workspace_fallback_line', {
                reason: workspaceFallbackReasonLabel(locale, workspace.fallbackReason)
            }), { parse_mode: 'Markdown' });
        }
        await ctx.reply(t(locale, 'ide_opened', { ide: opened.ide, repo: session.activeRepo }), { parse_mode: 'Markdown' });
    } catch (err) {
        await ctx.reply(t(locale, 'ide_failed', { error: escapeMd(err.message) }), { parse_mode: 'Markdown' });
    }
});

bot.action('action:help', async ctx => {
    const locale = getSession(ctx.chat.id).locale || 'fr';
    await ctx.editMessageText(Messages.help(locale), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]])
    });
});

bot.action('action:code', async ctx => {
    const locale = getSession(ctx.chat.id).locale || 'fr';
    await ctx.editMessageText(Messages.awaitingInput(locale), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]])
    });
    broadcastMenu(ctx.chat.id, Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'menu_back'), 'nav:main')]]));
});

bot.command('start', async ctx => {
    const session = updateSession(ctx.chat.id, current => setSessionState(current, 'idle'));
    await ctx.reply(t(session.locale || 'fr', 'welcome'), { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    broadcastMenu(ctx.chat.id);
});

// --- PIPELINE HANDLER (REUSABLE) ---
async function processPipelineRequest(chatId, text, feedback) {
    let session = getSession(chatId);
    const locale = session.locale || 'fr';
    if (session.isProcessing) {
        await feedback.reply(t(locale, 'already_processing'));
        return;
    }
    if (!session.activeRepo) return feedback.reply(t(locale, 'no_project'));

    session = updateSession(chatId, current => startSessionRun(current, text));
    notifyGUI('status-update', { text: t(locale, 'status_processing', { repo: session.activeRepo }) });

    const agentOptions = {
        defaultCli: session.defaultCli,
        defaultModel: session.defaultModel,
        disabledClis: session.disabledClis,
        preferredCli: null
    };
    const activeTaskProfile = getTaskProfile(session.taskProfile);

    if (!agentOptions.defaultCli && activeTaskProfile.preferredCli) {
        agentOptions.preferredCli = activeTaskProfile.preferredCli;
    }
    if (!agentOptions.defaultModel && activeTaskProfile.preferredModel) {
        agentOptions.defaultModel = activeTaskProfile.preferredModel;
    }

    const workspace = await resolveSessionWorkspace(chatId);
    const targetPath = workspace.executionPath;
    
    try {
        await feedback.sendInitialStatus(t(locale, 'status_analyzing', { repo: session.activeRepo }));
        if (workspace.status === 'fallback') {
            await pushRuntimeStatus(chatId, feedback, t(locale, 'workspace_fallback_line', {
                reason: workspaceFallbackReasonLabel(locale, workspace.fallbackReason)
            }));
        } else if (workspace.mode === 'worktree' && !workspace.reused) {
            await pushRuntimeStatus(chatId, feedback, t(locale, 'workspace_ready_line', {
                mode: workspaceModeLabel(locale, workspace.mode)
            }));
        }
        let finalCode = "", filesCreated = [], testResult = "", sessionSummary = "";
        let usedCli = agentOptions.defaultCli || 'auto';
        let latestRunTraces = [];
        await initMemory(BASE_PROG_PATH);
        await appendToDailyLog(BASE_PROG_PATH, session.activeRepo, `Démarrage: ${text.slice(0, 80)}...`);

        const memoryContext = await queryMemory(BASE_PROG_PATH, text);
        let attempt = 1, success = false, errorMessage = null;
        const MAX_ATTEMPTS = 3;

        while (attempt <= MAX_ATTEMPTS) {
            const status = t(locale, 'status_generating', { attempt, max: MAX_ATTEMPTS });
            await pushRuntimeStatus(chatId, feedback, status);

            const agentResult = await runVibeAgent(text, memoryContext, errorMessage, {
                ...agentOptions,
                cwd: targetPath,
                taskProfile: activeTaskProfile.id
            });
            finalCode = agentResult.output;
            usedCli = agentResult.usedCli || usedCli;
            if (Array.isArray(agentResult.traces)) {
                latestRunTraces = [];
                for (const trace of agentResult.traces) {
                    latestRunTraces.push(trace);
                    session = updateSession(chatId, current => recordFallback(current, trace));
                    await appendFallbackTrace(BASE_PROG_PATH, session.activeRepo, trace);
                    if (trace.status === 'failed') {
                        await pushRuntimeStatus(
                            chatId,
                            feedback,
                            t(locale, 'fallback_status_line', {
                                cli: trace.cli,
                                reason: fallbackReasonLabel(locale, trace.reason)
                            })
                        );
                    }
                }
            }

            filesCreated = await applyCodeToFiles(finalCode, targetPath);
            if (filesCreated.length === 0) {
                errorMessage = "Format non respecté.";
                attempt++; continue;
            }

            const testStatus = t(locale, 'status_testing', { attempt, max: MAX_ATTEMPTS });
            await pushRuntimeStatus(chatId, feedback, testStatus);

            const test = await executeAndTest(finalCode, targetPath);
            testResult = test.message || test.error;
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        sessionSummary = await generateSummary(finalCode, text);
        session = updateSession(chatId, {
            lastSummary: sessionSummary,
            lastFiles: filesCreated,
            lastTestResult: testResult
        });

        if (success) {
            updateSession(chatId, current => appendRunHistory(current, {
                finishedAt: new Date().toISOString(),
                success: true,
                cli: usedCli,
                attempts: attempt,
                taskProfile: activeTaskProfile.id,
                workspaceMode: workspace.mode,
                promptSnippet: text,
                detail: filesCreated.join(', '),
                traces: latestRunTraces
            }));
            try { await autoCommitGit(targetPath, "VibeCode: " + text.slice(0, 30)); } catch (e) {}
            await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo, cli: usedCli,
                model: agentOptions.defaultModel || 'auto', prompt: text,
                summary: sessionSummary, filesCreated, testResult, success: true, attempts: attempt
            });
            await feedback.reply(t(locale, 'run_success', { count: filesCreated.length }));
            notifyGUI('message-to-gui', { text: `🎯 Succès ! ${filesCreated.length} fichiers.` });
        } else {
            updateSession(chatId, current => appendRunHistory(current, {
                finishedAt: new Date().toISOString(),
                success: false,
                cli: usedCli,
                attempts: Math.max(attempt - 1, 1),
                taskProfile: activeTaskProfile.id,
                workspaceMode: workspace.mode,
                promptSnippet: text,
                detail: testResult || errorMessage || 'Run failed',
                traces: latestRunTraces
            }));
            await feedback.reply(t(locale, 'run_failed', { max: MAX_ATTEMPTS }));
        }
    } catch (e) {
        console.error(e);
        updateSession(chatId, current => appendRunHistory(current, {
            finishedAt: new Date().toISOString(),
            success: false,
            cli: agentOptions.defaultCli || activeTaskProfile.preferredCli || 'auto',
            attempts: current.activeRun?.attempts || 0,
            taskProfile: activeTaskProfile.id,
            workspaceMode: workspace.mode,
            promptSnippet: text,
            detail: e.message,
            traces: Array.isArray(e.traces) ? e.traces : []
        }));
        if (Array.isArray(e.traces)) {
            for (const trace of e.traces) {
                try {
                    session = updateSession(chatId, current => recordFallback(current, trace));
                    await appendFallbackTrace(BASE_PROG_PATH, session.activeRepo || 'unknown', trace);
                } catch (traceErr) {
                    console.warn('[Trace] Unable to persist fallback trace:', traceErr.message);
                }
            }
        }
        await feedback.reply(t(locale, 'fatal_error', { error: e.message }));
    } finally {
        updateSession(chatId, current => finishSessionRun(current, { state: 'idle', dispatchMode: 'idle' }));
        setGuiDispatchState(chatId, { mode: 'idle', source: 'remote' });
        broadcastMenu(chatId);
    }
}

// --- GESTION DES NOTES & PIPELINE HANDLER ---
bot.on('text', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = ctx.message.text.trim();
    if (ctx.from && ctx.from.is_bot) return;

    if (session.state === "awaiting_repo_name") {
        const res = await createNewRepo(BASE_PROG_PATH, text, session.browserPath || '');
        if (res.success) {
            const nextSession = updateSession(ctx.chat.id, current => setSessionState(current, 'idle', {
                activeRepo: res.relativePath || text,
                browserPath: res.relativePath || current.browserPath,
                workspacePath: null,
                workspaceStatus: getDefaultWorkspaceStatus(current.workspaceMode),
                workspaceFallbackReason: null
            }));
            syncGuiSession(ctx.chat.id);
            broadcastMenu(ctx.chat.id);
            return ctx.reply(t(locale, 'repo_ready', { repo: escapeMd(nextSession.activeRepo) }), { parse_mode: 'Markdown' });
        }
        return ctx.reply(t(locale, 'fatal_error', { error: res.error }), { parse_mode: 'Markdown' });
    }

    if (session.awaitingNotesInput) {
        updateSession(ctx.chat.id, current => setSessionState(current, 'idle', {
            saveNotes: text,
            awaitingNotesInput: false
        }));
        return ctx.reply(t(locale, 'notes_updated', { notes: escapeMd(text) }), { parse_mode: 'Markdown' });
    }

    let statusMsg;
    const feedback = {
        reply: async (m) => ctx.reply(m, { parse_mode: 'Markdown' }),
        sendInitialStatus: async (m) => { statusMsg = await ctx.reply(m); },
        sendUpdate: async (m) => { if (statusMsg) try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, m); } catch (e) {} }
    };
    notifyGUI('message-to-gui', { text: `[Telegram] ${text}` });
    await routeIncomingText(ctx.chat.id, text, {
        source: 'telegram',
        feedback,
        uiContext: createTelegramReplyContext(ctx)
    });
});

// --- IPC ELECTRON ---
ipcMain.on('message-from-gui', async (event, text) => {
    const chatId = MY_TELEGRAM_ID;
    const session = getSession(chatId);
    const locale = session.locale || 'fr';

    if (session.awaitingNotesInput) {
        const nextSession = updateSession(chatId, current => setSessionState(current, 'idle', {
            saveNotes: text.trim(),
            awaitingNotesInput: false
        }));
        notifyGUI('message-to-gui', { text: t(locale, 'notes_updated', { notes: nextSession.saveNotes }) });
        return;
    }

    const feedback = {
        reply: async (m) => notifyGUI('message-to-gui', { text: m }),
        sendInitialStatus: async (m) => notifyGUI('status-update', { text: m }),
        sendUpdate: async (m) => notifyGUI('status-update', { text: m })
    };
    await routeIncomingText(chatId, text.trim(), {
        source: 'gui',
        feedback,
        uiContext: createGuiMockContext(chatId)
    });
});

ipcMain.on('gui-action', async (event, action) => {
    const chatId = MY_TELEGRAM_ID;
    let session = getSession(chatId);
    const mockCtx = createGuiMockContext(chatId, action);

    if (action === 'nav:main') return showMainMenu(mockCtx);
    if (action === 'nav:repos') {
        if (session.activeRepo && !session.browserPath) {
            session.browserPath = session.activeRepo;
        }
        return showRepoSelection(mockCtx);
    }
    if (action === 'browse_root') {
        session = updateSession(chatId, { browserPath: '' });
        return showRepoSelection(mockCtx, 0);
    }
    if (action.startsWith('browse:')) {
        session = updateSession(chatId, { browserPath: decodeURIComponent(action.split(':').slice(1).join(':')) });
        return showRepoSelection(mockCtx, 0);
    }
    if (action === 'action:code') {
        const locale = session.locale || 'fr';
        notifyGUI('message-to-gui', { text: Messages.awaitingInput(locale) });
        notifyGUI('tiles-update', { tiles: [[{ text: t(locale, 'nav_main'), callback_data: 'nav:main' }]] });
        return;
    }
    if (action.startsWith('select_repo:')) {
        const repoPath = decodeURIComponent(action.split(':').slice(1).join(':'));
        session = updateSession(chatId, current => setSessionState(current, 'idle', {
            activeRepo: repoPath,
            browserPath: repoPath,
            workspacePath: null,
            workspaceStatus: getDefaultWorkspaceStatus(current.workspaceMode),
            workspaceFallbackReason: null
        }));
        syncGuiSession(chatId);
        return showMainMenu(mockCtx);
    }
    if (action.startsWith('page:')) return showRepoSelection(mockCtx, parseInt(action.split(':')[1]));
    if (action === 'nav:config') return showConfigMenu(mockCtx);
    if (action === 'nav:settings') return showSettingsMenu(mockCtx);
    if (action === 'nav:workspace') return showWorkspaceModeMenu(mockCtx);
    if (action === 'nav:profile') return showTaskProfileMenu(mockCtx);
    if (action === 'nav:model') return showModelMenu(mockCtx);
    if (action === 'nav:ide') return showIdeMenu(mockCtx);
    if (action === 'nav:language') return showLanguageMenu(mockCtx);
    if (action.startsWith('toggle_cli:')) {
        const cli = action.split(':')[1];
        if (session.disabledClis.includes(cli)) {
            session.disabledClis = session.disabledClis.filter(c => c !== cli);
        } else {
            session.disabledClis.push(cli);
            if (session.defaultCli === cli) session.defaultCli = null;
        }
        return showConfigMenu(mockCtx);
    }
    if (action.startsWith('set_cli:')) {
        const cli = action.split(':')[1];
        session.defaultCli = cli === 'auto' ? null : cli;
        if (session.defaultCli && session.disabledClis.includes(session.defaultCli)) {
            session.disabledClis = session.disabledClis.filter(c => c !== session.defaultCli);
        }
        session.defaultModel = null;
        return showConfigMenu(mockCtx);
    }
    if (action === 'refresh_clis') {
        await initAvailableClis();
        return showConfigMenu(mockCtx);
    }
    if (action.startsWith('set_model:')) {
        const model = action.split(':')[1];
        session.defaultModel = model === 'auto' ? null : model;
        return showModelMenu(mockCtx);
    }
    if (action.startsWith('toggle_ide:')) {
        const ide = action.split(':')[1];
        if (session.disabledIdes.includes(ide)) {
            session.disabledIdes = session.disabledIdes.filter(i => i !== ide);
        } else {
            session.disabledIdes.push(ide);
            if (session.defaultIde === ide) session.defaultIde = null;
        }
        return showIdeMenu(mockCtx);
    }
    if (action.startsWith('set_ide:')) {
        const ide = action.split(':')[1];
        session.defaultIde = ide === 'auto' ? null : ide;
        if (session.defaultIde && session.disabledIdes.includes(session.defaultIde)) {
            session.disabledIdes = session.disabledIdes.filter(i => i !== session.defaultIde);
        }
        return showIdeMenu(mockCtx);
    }
    if (action === 'refresh_ides') {
        await initAvailableIdes();
        return showIdeMenu(mockCtx);
    }
    if (action.startsWith('set_lang:')) {
        const locale = normalizeLocale(action.split(':')[1]);
        session.locale = locale;
        syncGuiSession(chatId);
        notifyGUI('message-to-gui', { text: t(locale, 'language_set', { lang: languageName(locale, locale) }) });
        return showLanguageMenu(mockCtx);
    }
    if (action.startsWith('set_workspace_mode:')) {
        session.workspaceMode = action.split(':')[1];
        session.workspacePath = null;
        session.workspaceStatus = getDefaultWorkspaceStatus(session.workspaceMode);
        session.workspaceFallbackReason = null;
        syncGuiSession(chatId);
        return showWorkspaceModeMenu(mockCtx);
    }
    if (action.startsWith('set_task_profile:')) {
        session.taskProfile = action.split(':')[1];
        syncGuiSession(chatId);
        return showTaskProfileMenu(mockCtx);
    }
    if (action === 'action:open_ide') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        const workspace = await resolveSessionWorkspace(chatId);
        try {
            const opened = launchIdeForRepo(workspace.executionPath, {
                preferredIde: session.defaultIde,
                fallbackOrder: IDE_FALLBACK_ORDER,
                disabledIdes: session.disabledIdes
            });
            if (workspace.status === 'fallback') {
                notifyGUI('message-to-gui', {
                    text: t(locale, 'workspace_fallback_line', {
                        reason: workspaceFallbackReasonLabel(locale, workspace.fallbackReason)
                    })
                });
            }
            notifyGUI('message-to-gui', { text: t(locale, 'ide_opened_short', { ide: opened.ide }) });
        } catch (err) {
            notifyGUI('message-to-gui', { text: t(locale, 'ide_failed', { error: err.message }) });
        }
        return;
    }
    if (action === 'action:history') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);
        if (!history.length) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_history') });
            return;
        }
        const lines = history.slice(0, 5).map((h, idx) => `${idx + 1}. ${h.filename}`).join('\n');
        notifyGUI('message-to-gui', { text: `${t(locale, 'history_title', { repo: session.activeRepo })}\n${lines}` });
        return;
    }
    if (action === 'action:runs') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        notifyGUI('message-to-gui', { text: await buildRunsOverview(chatId) });
        notifyGUI('tiles-update', { tiles: createRunsKeyboard(locale, session).reply_markup.inline_keyboard });
        return;
    }
    if (action === 'action:rerun_last') {
        const locale = session.locale || 'fr';
        const feedback = {
            reply: async (m) => notifyGUI('message-to-gui', { text: m }),
            sendInitialStatus: async (m) => notifyGUI('status-update', { text: m }),
            sendUpdate: async (m) => notifyGUI('status-update', { text: m })
        };
        return rerunLastRequest(chatId, feedback);
    }
    if (action === 'action:run_detail') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        notifyGUI('message-to-gui', { text: await buildRunDetail(chatId, 0) });
        notifyGUI('tiles-update', { tiles: createRunDetailKeyboard(locale, session, 0).reply_markup.inline_keyboard });
        return;
    }
    if (action.startsWith('action:run_detail:')) {
        const locale = session.locale || 'fr';
        const runIndex = Number.parseInt(action.split(':').pop(), 10);
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        notifyGUI('message-to-gui', { text: await buildRunDetail(chatId, runIndex) });
        notifyGUI('tiles-update', { tiles: createRunDetailKeyboard(locale, session, runIndex).reply_markup.inline_keyboard });
        return;
    }
    if (action === 'action:memory') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        notifyGUI('message-to-gui', { text: await buildMemoryOverview(chatId) });
        return;
    }
    if (action === 'action:set_notes') {
        const locale = session.locale || 'fr';
        session = updateSession(chatId, current => setSessionState(current, 'awaiting_notes_input', {
            awaitingNotesInput: true
        }));
        notifyGUI('message-to-gui', { text: t(locale, 'gui_notes_prompt') });
        return;
    }
    if (action === 'action:help') {
        const locale = session.locale || 'fr';
        notifyGUI('message-to-gui', { text: Messages.help(locale) });
        notifyGUI('tiles-update', { tiles: [[{ text: t(locale, 'nav_main'), callback_data: 'nav:main' }]] });
    }
});

// --- INIT ---
async function init() {
    try {
        await initAvailableClis();
        await initAvailableIdes();
        await initMemory(BASE_PROG_PATH);
        bot.launch();
        await app.whenReady();
        createWindow();
        app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
    } catch (e) { console.error(e); }
}
init();
process.once('SIGINT', () => { bot.stop(); app.quit(); });
process.once('SIGTERM', () => { bot.stop(); app.quit(); });
