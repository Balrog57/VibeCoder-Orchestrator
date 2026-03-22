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
import { applyCodeToFiles, executeAndTest, autoCommitGit, listRepos, createNewRepo } from './utils/actions.js';
import { scanAvailableClis, getAvailableModels } from './utils/cli-detector.js';
import { scanAvailableIdes, launchIdeForRepo } from './utils/ide-manager.js';
import {
    createMainMenuKeyboard,
    createRepoKeyboard,
    createConfigKeyboard,
    createModelKeyboard,
    createIdeKeyboard,
    createLanguageKeyboard,
    createSettingsKeyboard,
    Messages
} from './utils/ui.js';
import { t, normalizeLocale, languageName } from './utils/i18n.js';

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
        const session = getSession(MY_TELEGRAM_ID);
        mainWindow.webContents.send('session-update', { activeRepo: session.activeRepo, locale: session.locale || 'fr' });
        mainWindow.webContents.send('locale-update', { locale: session.locale || 'fr' });
        broadcastMenu(MY_TELEGRAM_ID);
    });
}

// Helper pour envoyer au GUI
function notifyGUI(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
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

function inferRepoFromContext() {
    const normalizedBase = path.resolve(BASE_PROG_PATH);
    const cwd = path.resolve(process.cwd());
    const rel = path.relative(normalizedBase, cwd);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const segments = rel.split(path.sep).filter(Boolean);
    if (!segments.length) return null;
    return segments[0];
}

function getSession(chatId) {
    if (!sessions[chatId]) {
        sessions[chatId] = {
            activeRepo: null,
            state: "idle",
            defaultCli: null,
            defaultModel: null,
            lastPrompt: null,
            lastSummary: null,
            lastFiles: [],
            lastTestResult: null,
            saveNotes: '',
            isProcessing: false,  // Protection contre les exécutions multiples
            disabledClis: [],     // Liste des CLI désactivés pour cette session
            defaultIde: null,
            disabledIdes: [],
            awaitingNotesInput: false,
            locale: normalizeLocale(process.env.DEFAULT_LOCALE || 'fr')
        };
    }
    return sessions[chatId];
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
    const text = Messages.main(session);

    if (ctx.callbackQuery) {
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    }
    const res = await ctx.reply(text, { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    broadcastMenu(ctx.chat.id);
    return res;
}

async function showRepoSelection(ctx, page = 0) {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const repos = await listRepos(BASE_PROG_PATH);
    const keyboard = await createRepoKeyboard(repos, page, locale);
    const text = t(locale, 'repo_select_title');

    if (ctx.callbackQuery) {
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    const res = await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
    return res;
}

async function showConfigMenu(ctx) {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'config_cli_title')}\n\n${t(locale, 'config_cli_current')}: **${session.defaultCli || t(locale, 'status_auto_icon')}**`;
    const keyboard = createConfigKeyboard(session, AVAILABLE_CLIS);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showModelMenu(ctx) {
    const session = getSession(ctx.chat.id);
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
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'settings_title')}\n\n${t(locale, 'settings_project')}: ${escapeMd(session.activeRepo) || t(locale, 'status_repo_none')}\n${t(locale, 'settings_cli')}: ${session.defaultCli || t(locale, 'status_auto')}\n${t(locale, 'settings_ide')}: ${session.defaultIde || t(locale, 'status_auto')}`;
    const keyboard = createSettingsKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showIdeMenu(ctx) {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    const text = `${t(locale, 'config_ide_title')}\n\n${t(locale, 'config_ide_current')}: **${session.defaultIde || t(locale, 'status_auto_icon')}**`;
    const keyboard = createIdeKeyboard(session, AVAILABLE_IDES);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
}

async function showLanguageMenu(ctx) {
    const session = getSession(ctx.chat.id);
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
    session.state = "awaiting_repo_name";
    return ctx.editMessageText(t(session.locale || 'fr', 'repo_new_prompt'), { parse_mode: 'Markdown' });
});

bot.action(/select_repo:(.+)/, async (ctx) => {
    const repoName = ctx.match[1];
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    session.activeRepo = repoName;
    session.state = "idle";

    notifyGUI('session-update', { activeRepo: repoName, locale });
    await ctx.answerCbQuery(`${t(locale, 'settings_project')}: ${repoName}`);
    await ctx.editMessageText(Messages.repoSelected(repoName, locale), {
        parse_mode: 'Markdown',
        ...createMainMenuKeyboard(session)
    });
    broadcastMenu(ctx.chat.id);
});

bot.action('nav:main', async ctx => {
    getSession(ctx.chat.id).state = "idle";
    await showMainMenu(ctx);
});

bot.action('nav:repos', async ctx => {
    await showRepoSelection(ctx, 0);
});

bot.action('nav:config', showConfigMenu);
bot.action('nav:settings', showSettingsMenu);
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
    notifyGUI('locale-update', { locale });
    await ctx.answerCbQuery(t(locale, 'language_set', { lang: languageName(locale, locale) }));
    await showLanguageMenu(ctx);
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

bot.action('action:set_notes', async ctx => {
    const session = getSession(ctx.chat.id);
    const locale = session.locale || 'fr';
    session.awaitingNotesInput = true;
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

    const repoPath = path.join(BASE_PROG_PATH, session.activeRepo);
    try {
        const opened = launchIdeForRepo(repoPath, {
            preferredIde: session.defaultIde,
            fallbackOrder: IDE_FALLBACK_ORDER,
            disabledIdes: session.disabledIdes
        });
        await ctx.answerCbQuery(t(locale, 'ide_opened_short', { ide: opened.ide }));
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
    const session = getSession(ctx.chat.id);
    session.state = "idle";
    await ctx.reply(t(session.locale || 'fr', 'welcome'), { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    broadcastMenu(ctx.chat.id);
});

// --- PIPELINE HANDLER (REUSABLE) ---
async function processPipelineRequest(chatId, text, feedback) {
    const session = getSession(chatId);
    const locale = session.locale || 'fr';
    if (session.isProcessing) return;
    if (!session.activeRepo) {
        const inferred = inferRepoFromContext();
        if (inferred) {
            session.activeRepo = inferred;
            notifyGUI('session-update', { activeRepo: inferred, locale });
            await feedback.reply(`📁 ${t(locale, 'settings_project')}: **${escapeMd(inferred)}** (${t(locale, 'status_auto')})`);
        } else {
            return feedback.reply(t(locale, 'no_project'));
        }
    }

    session.isProcessing = true;
    notifyGUI('status-update', { text: t(locale, 'status_processing', { repo: session.activeRepo }) });

    const agentOptions = {
        defaultCli: session.defaultCli,
        defaultModel: session.defaultModel,
        disabledClis: session.disabledClis,
        preferredCli: null
    };

    const targetPath = path.join(BASE_PROG_PATH, session.activeRepo);
    
    try {
        await feedback.sendInitialStatus(t(locale, 'status_analyzing', { repo: session.activeRepo }));
        let finalCode = "", filesCreated = [], testResult = "", sessionSummary = "";
        let usedCli = agentOptions.defaultCli || 'auto';
        session.lastPrompt = text;
        await initMemory(BASE_PROG_PATH);
        await appendToDailyLog(BASE_PROG_PATH, session.activeRepo, `Démarrage: ${text.slice(0, 80)}...`);

        const memoryContext = await queryMemory(BASE_PROG_PATH, text);
        let attempt = 1, success = false, errorMessage = null;
        const MAX_ATTEMPTS = 3;

        while (attempt <= MAX_ATTEMPTS) {
            const status = t(locale, 'status_generating', { attempt, max: MAX_ATTEMPTS });
            await feedback.sendUpdate(status);
            notifyGUI('status-update', { text: status });

            const agentResult = await runVibeAgent(text, memoryContext, errorMessage, agentOptions);
            finalCode = agentResult.output;
            usedCli = agentResult.usedCli || usedCli;
            if (Array.isArray(agentResult.traces)) {
                for (const trace of agentResult.traces) {
                    await appendFallbackTrace(BASE_PROG_PATH, session.activeRepo, trace);
                }
            }

            filesCreated = await applyCodeToFiles(finalCode, targetPath);
            if (filesCreated.length === 0) {
                errorMessage = "Format non respecté.";
                attempt++; continue;
            }

            const testStatus = t(locale, 'status_testing', { attempt, max: MAX_ATTEMPTS });
            await feedback.sendUpdate(testStatus);
            notifyGUI('status-update', { text: testStatus });

            const test = await executeAndTest(finalCode, targetPath);
            testResult = test.message || test.error;
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        sessionSummary = await generateSummary(finalCode, text);
        session.lastSummary = sessionSummary;
        session.lastFiles = filesCreated;
        session.lastTestResult = testResult;

        if (success) {
            try { await autoCommitGit(targetPath, "VibeCode: " + text.slice(0, 30)); } catch (e) {}
            await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo, cli: usedCli,
                model: agentOptions.defaultModel || 'auto', prompt: text,
                summary: sessionSummary, filesCreated, testResult, success: true, attempts: attempt
            });
            await feedback.reply(t(locale, 'run_success', { count: filesCreated.length }));
            notifyGUI('message-to-gui', { text: t(locale, 'run_success', { count: filesCreated.length }) });
        } else {
            await feedback.reply(t(locale, 'run_failed', { max: MAX_ATTEMPTS }));
        }
    } catch (e) {
        console.error(e);
        if (Array.isArray(e.traces)) {
            for (const trace of e.traces) {
                try {
                    await appendFallbackTrace(BASE_PROG_PATH, session.activeRepo || 'unknown', trace);
                } catch (traceErr) {
                    console.warn('[Trace] Unable to persist fallback trace:', traceErr.message);
                }
            }
        }
        await feedback.reply(t(locale, 'fatal_error', { error: e.message }));
    } finally {
        session.isProcessing = false;
        session.state = "idle";
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
        const res = await createNewRepo(BASE_PROG_PATH, text);
        if (res.success) {
            session.activeRepo = text;
            session.state = "idle";
            notifyGUI('session-update', { activeRepo: text, locale });
            broadcastMenu(ctx.chat.id);
            return ctx.reply(t(locale, 'repo_ready', { repo: escapeMd(text) }), { parse_mode: 'Markdown' });
        }
        return ctx.reply(t(locale, 'fatal_error', { error: res.error }), { parse_mode: 'Markdown' });
    }

    if (session.awaitingNotesInput) {
        session.saveNotes = text;
        session.awaitingNotesInput = false;
        return ctx.reply(t(locale, 'notes_updated', { notes: escapeMd(text) }), { parse_mode: 'Markdown' });
    }

    let statusMsg;
    const feedback = {
        reply: async (m) => ctx.reply(m, { parse_mode: 'Markdown' }),
        sendInitialStatus: async (m) => { statusMsg = await ctx.reply(m); },
        sendUpdate: async (m) => { if (statusMsg) try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, m); } catch (e) {} }
    };
    notifyGUI('message-to-gui', { text: `[Telegram] ${text}` });
    await processPipelineRequest(ctx.chat.id, text, feedback);
});

// --- IPC ELECTRON ---
ipcMain.on('message-from-gui', async (event, text) => {
    const chatId = MY_TELEGRAM_ID;
    const session = getSession(chatId);
    const locale = session.locale || 'fr';

    if (session.awaitingNotesInput) {
        session.saveNotes = text.trim();
        session.awaitingNotesInput = false;
        notifyGUI('message-to-gui', { text: t(locale, 'notes_updated', { notes: session.saveNotes }) });
        return;
    }

    const feedback = {
        reply: async (m) => notifyGUI('message-to-gui', { text: m }),
        sendInitialStatus: async (m) => notifyGUI('status-update', { text: m }),
        sendUpdate: async (m) => notifyGUI('status-update', { text: m })
    };
    await processPipelineRequest(chatId, text, feedback);
});

ipcMain.on('gui-action', async (event, action) => {
    const chatId = MY_TELEGRAM_ID;
    const session = getSession(chatId);
    const mockCtx = {
        chat: { id: chatId },
        from: { id: chatId },
        callbackQuery: { data: action },
        match: [null, action.split(':')[1]],
        answerCbQuery: async () => {},
        editMessageText: async (text, extra) => {
            notifyGUI('message-to-gui', { text });
            if (extra && extra.reply_markup) notifyGUI('tiles-update', { tiles: extra.reply_markup.inline_keyboard });
        },
        reply: async (text, extra) => {
            notifyGUI('message-to-gui', { text });
            if (extra && extra.reply_markup) notifyGUI('tiles-update', { tiles: extra.reply_markup.inline_keyboard });
        }
    };

    if (action === 'nav:main') return showMainMenu(mockCtx);
    if (action === 'nav:repos') return showRepoSelection(mockCtx);
    if (action === 'action:code') {
        const locale = session.locale || 'fr';
        notifyGUI('message-to-gui', { text: Messages.awaitingInput(locale) });
        notifyGUI('tiles-update', { tiles: [[{ text: t(locale, 'nav_main'), callback_data: 'nav:main' }]] });
        return;
    }
    if (action.startsWith('select_repo:')) {
        session.activeRepo = action.split(':')[1];
        session.state = "idle";
        notifyGUI('session-update', { activeRepo: session.activeRepo, locale: session.locale || 'fr' });
        return showMainMenu(mockCtx);
    }
    if (action.startsWith('page:')) return showRepoSelection(mockCtx, parseInt(action.split(':')[1]));
    if (action === 'nav:config') return showConfigMenu(mockCtx);
    if (action === 'nav:settings') return showSettingsMenu(mockCtx);
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
        notifyGUI('locale-update', { locale });
        notifyGUI('session-update', { activeRepo: session.activeRepo, locale });
        notifyGUI('message-to-gui', { text: t(locale, 'language_set', { lang: languageName(locale, locale) }) });
        return showLanguageMenu(mockCtx);
    }
    if (action === 'action:open_ide') {
        const locale = session.locale || 'fr';
        if (!session.activeRepo) {
            notifyGUI('message-to-gui', { text: t(locale, 'no_project') });
            return;
        }
        const repoPath = path.join(BASE_PROG_PATH, session.activeRepo);
        try {
            const opened = launchIdeForRepo(repoPath, {
                preferredIde: session.defaultIde,
                fallbackOrder: IDE_FALLBACK_ORDER,
                disabledIdes: session.disabledIdes
            });
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
    if (action === 'action:set_notes') {
        const locale = session.locale || 'fr';
        session.awaitingNotesInput = true;
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
