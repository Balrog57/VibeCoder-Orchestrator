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
    generateSummary,
    loadSessionHistory,
    manualSave
} from './utils/memory.js';
import { runVibeAgent, buildAgentConfig } from './utils/agents.js';
import { applyCodeToFiles, executeAndTest, autoCommitGit, listRepos, createNewRepo } from './utils/actions.js';
import { scanAvailableClis, getAvailableModels } from './utils/cli-detector.js';
import {
    createMainMenuKeyboard,
    createRepoKeyboard,
    createConfigKeyboard,
    createModelKeyboard,
    createSettingsKeyboard,
    Messages
} from './utils/ui.js';

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
        mainWindow.webContents.send('session-update', { activeRepo: session.activeRepo });
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
            disabledClis: []      // Liste des CLI désactivés pour cette session
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
    const repos = await listRepos(BASE_PROG_PATH);
    const keyboard = await createRepoKeyboard(repos, page);
    const text = "📁 **Sélectionnez un projet :**";

    if (ctx.callbackQuery) {
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    const res = await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
    return res;
}

bot.command('code', async ctx => {
    getSession(ctx.chat.id).state = "idle";
    await showRepoSelection(ctx, 0);
});

bot.action(/page:(.+)/, ctx => showRepoSelection(ctx, parseInt(ctx.match[1])));
bot.action("new_repo", ctx => {
    getSession(ctx.chat.id).state = "awaiting_repo_name";
    return ctx.editMessageText("📝 **Nom du nouveau projet :**\n\n_Tapez le nom et envoyez._", { parse_mode: 'Markdown' });
});

bot.action(/select_repo:(.+)/, async (ctx) => {
    const repoName = ctx.match[1];
    const session = getSession(ctx.chat.id);
    session.activeRepo = repoName;
    session.state = "idle";

    notifyGUI('session-update', { activeRepo: repoName });
    await ctx.answerCbQuery(`Projet: ${repoName}`);
    await ctx.editMessageText(Messages.repoSelected(repoName), {
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

bot.action('nav:config', async ctx => {
    const session = getSession(ctx.chat.id);
    const text = `⚙️ **Configuration CLI**\n\nCLI actuel: **${session.defaultCli || '⚡ Auto'}**`;
    const keyboard = createConfigKeyboard(session, AVAILABLE_CLIS);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
});

bot.action('nav:settings', async ctx => {
    const session = getSession(ctx.chat.id);
    const text = `🎛 **Settings**\n\nProjet: ${escapeMd(session.activeRepo) || 'Aucun'}\nCLI: ${session.defaultCli || 'Auto'}`;
    const keyboard = createSettingsKeyboard(session);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
});

bot.action('nav:model', async ctx => {
    const session = getSession(ctx.chat.id);
    const currentCli = session.defaultCli || 'auto';
    let cliToShow = currentCli === 'auto' ? (FALLBACK_ORDER[0] || 'gemini') : currentCli;
    const text = `🤖 **Configuration Model**\n\nModel actuel: **${session.defaultModel || '⚡ Auto'}**\nCLI: ${cliToShow}`;
    const keyboard = createModelKeyboard(session, AVAILABLE_MODELS);
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    broadcastMenu(ctx.chat.id, keyboard);
});

bot.command('start', async ctx => {
    const session = getSession(ctx.chat.id);
    session.state = "idle";
    await ctx.reply("👋 **Bienvenue !**", { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
    broadcastMenu(ctx.chat.id);
});

// --- PIPELINE HANDLER (REUSABLE) ---
async function processPipelineRequest(chatId, text, feedback) {
    const session = getSession(chatId);
    if (session.isProcessing) return;
    if (!session.activeRepo) return feedback.reply("⚠️ Sélectionnez d'abord un projet.");

    session.isProcessing = true;
    notifyGUI('status-update', { text: `En cours: ${session.activeRepo}` });

    const agentOptions = {
        defaultCli: session.defaultCli,
        defaultModel: session.defaultModel,
        disabledClis: session.disabledClis,
        preferredCli: null
    };

    const targetPath = path.join(BASE_PROG_PATH, session.activeRepo);
    
    try {
        await feedback.sendInitialStatus(`⏳ [${session.activeRepo}] Analyse...`);
        let finalCode = "", filesCreated = [], testResult = "", sessionSummary = "";
        await initMemory(BASE_PROG_PATH);
        await appendToDailyLog(BASE_PROG_PATH, session.activeRepo, `Démarrage: ${text.slice(0, 80)}...`);

        const memoryContext = await queryMemory(BASE_PROG_PATH, text);
        let attempt = 1, success = false, errorMessage = null;
        const MAX_ATTEMPTS = 3;

        while (attempt <= MAX_ATTEMPTS) {
            const status = `🧠 (Essai ${attempt}/${MAX_ATTEMPTS}) Génération...`;
            await feedback.sendUpdate(status);
            notifyGUI('status-update', { text: status });

            const agentResult = await runVibeAgent(text, memoryContext, errorMessage, agentOptions);
            finalCode = agentResult.output;

            filesCreated = await applyCodeToFiles(finalCode, targetPath);
            if (filesCreated.length === 0) {
                errorMessage = "Format non respecté.";
                attempt++; continue;
            }

            const testStatus = `⚡ (Essai ${attempt}/${MAX_ATTEMPTS}) Tests...`;
            await feedback.sendUpdate(testStatus);
            notifyGUI('status-update', { text: testStatus });

            const test = await executeAndTest(finalCode, targetPath);
            testResult = test.message || test.error;
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        sessionSummary = await generateSummary(finalCode, text);

        if (success) {
            try { await autoCommitGit(targetPath, "VibeCode: " + text.slice(0, 30)); } catch (e) {}
            await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo, cli: agentOptions.defaultCli || 'auto',
                model: agentOptions.defaultModel || 'auto', prompt: text,
                summary: sessionSummary, filesCreated, testResult, success: true, attempts: attempt
            });
            await feedback.reply(`🎯 **Succès !**\n\n📁 **Fichiers :** ${filesCreated.length}`);
            notifyGUI('message-to-gui', { text: `🎯 Succès ! ${filesCreated.length} fichiers.` });
        } else {
            await feedback.reply(`❌ Échec après ${MAX_ATTEMPTS} essais.`);
        }
    } catch (e) {
        console.error(e);
        await feedback.reply(`💥 Erreur : ${e.message}`);
    } finally {
        session.isProcessing = false;
        session.state = "idle";
        broadcastMenu(chatId);
    }
}

// --- GESTION DES NOTES & PIPELINE HANDLER ---
bot.on('text', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const text = ctx.message.text.trim();
    if (ctx.from && ctx.from.is_bot) return;

    if (session.state === "awaiting_repo_name") {
        const res = await createNewRepo(BASE_PROG_PATH, text);
        if (res.success) {
            session.activeRepo = text;
            session.state = "idle";
            notifyGUI('session-update', { activeRepo: text });
            broadcastMenu(ctx.chat.id);
            return ctx.reply(`🚀 Projet **${text}** prêt.`);
        }
        return ctx.reply(`❌ Erreur: ${res.error}`);
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
        notifyGUI('message-to-gui', { text: Messages.awaitingInput });
        notifyGUI('tiles-update', { tiles: [[{ text: '🏠 Menu', callback_data: 'nav:main' }]] });
        return;
    }
    if (action.startsWith('select_repo:')) {
        session.activeRepo = action.split(':')[1];
        session.state = "idle";
        notifyGUI('session-update', { activeRepo: session.activeRepo });
        return showMainMenu(mockCtx);
    }
    if (action.startsWith('page:')) return showRepoSelection(mockCtx, parseInt(action.split(':')[1]));
    if (action === 'nav:config') {
        const keyboard = createConfigKeyboard(session, AVAILABLE_CLIS);
        notifyGUI('tiles-update', { tiles: keyboard.reply_markup.inline_keyboard });
        return;
    }
    if (action === 'nav:settings') {
        const keyboard = createSettingsKeyboard(session);
        notifyGUI('tiles-update', { tiles: keyboard.reply_markup.inline_keyboard });
        return;
    }
    if (action === 'nav:model') {
        const keyboard = createModelKeyboard(session, AVAILABLE_MODELS);
        notifyGUI('tiles-update', { tiles: keyboard.reply_markup.inline_keyboard });
        return;
    }
    if (action === 'action:help') {
        notifyGUI('message-to-gui', { text: Messages.help });
        notifyGUI('tiles-update', { tiles: [[{ text: '🏠 Menu', callback_data: 'nav:main' }]] });
    }
});

// --- INIT ---
async function init() {
    try {
        await initAvailableClis();
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
