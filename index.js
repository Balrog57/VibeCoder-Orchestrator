import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import fs from 'fs/promises';
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

// Chargement et conversion de l'ID autorisé
const MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: Infinity });

const BASE_PROG_PATH = process.env.BASE_PROG_PATH || "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
const REPO_PATH = process.cwd();

// --- HELPER FORMATTING ---
const escapeMd = (str) => str ? str.toString().replace(/[_*[\]()~`>#\+\-=|{}\.!]/g, '\\$&') : '';

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
    return ctx.reply(text, { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) });
}

async function showRepoSelection(ctx, page = 0) {
    console.log(`[UI] Affichage de la sélection de projets (Page ${page})...`);
    const repos = await listRepos(BASE_PROG_PATH);
    console.log(`[UI] ${repos.length} projets trouvés dans ${BASE_PROG_PATH}.`);

    const keyboard = await createRepoKeyboard(repos, page);
    const text = "📁 **Sélectionnez un projet :**";

    if (ctx.callbackQuery) {
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    }
    return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

bot.command('code', async ctx => {
    console.log(`[Command] /code reçu de ${ctx.chat.id}`);
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

    await ctx.answerCbQuery(`Projet: ${repoName}`);
    await ctx.editMessageText(Messages.repoSelected(repoName), {
        parse_mode: 'Markdown',
        ...createMainMenuKeyboard(session)
    });
});

// Navigation principale
bot.action('nav:main', async ctx => {
    getSession(ctx.chat.id).state = "idle";
    await showMainMenu(ctx);
});

bot.action('nav:repos', async ctx => {
    await showRepoSelection(ctx, 0);
});

bot.action('nav:config', async ctx => {
    const session = getSession(ctx.chat.id);
    const text = `⚙️ **Configuration CLI**\n\nCLI actuel: **${session.defaultCli || '⚡ Auto'}**\n\nActivez/désactivez des CLI ou définissez un CLI par défaut.`;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...createConfigKeyboard(session, AVAILABLE_CLIS)
    });
});

bot.action('nav:settings', async ctx => {
    const session = getSession(ctx.chat.id);
    const text = `🎛 **Settings**\n\nProjet: ${escapeMd(session.activeRepo) || 'Aucun'}\nCLI: ${session.defaultCli || 'Auto'}\nModel: ${session.defaultModel || 'Auto'}`;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...createSettingsKeyboard(session)
    });
});

bot.action('nav:model', async ctx => {
    const session = getSession(ctx.chat.id);
    const currentCli = session.defaultCli || 'auto';
    let cliToShow = currentCli === 'auto' ? (FALLBACK_ORDER[0] || 'gemini') : currentCli;

    const text = `🤖 **Configuration Model**\n\nModel actuel: **${session.defaultModel || '⚡ Auto'}**\nCLI: ${cliToShow}`;
    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...createModelKeyboard(session, AVAILABLE_MODELS)
    });
});

// --- COMMANDE /cli ---
bot.command('cli', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const argsArr = ctx.message.text.split(' ').slice(1);
    const args = argsArr.join(' ').trim();

    if (!args) {
        await ctx.reply(`⚙️ **Configuration CLI**\n\nCLI actuel: **${session.defaultCli || '⚡ Auto'}**\n\nUtilisez les tuiles ci-dessous ou /cli <nom> pour définir.`);
        return renderCliSettings(ctx, session);
    }

    const cliName = args.toLowerCase();
    if (cliName === 'auto') {
        session.defaultCli = null;
        return ctx.reply("✅ CLI réinitialisé à **Auto (fallback chain)**", { parse_mode: 'Markdown' });
    }

    if (AVAILABLE_CLIS.includes(cliName)) {
        session.defaultCli = cliName;
        session.disabledClis = session.disabledClis.filter(c => c !== cliName);
        return ctx.reply(`✅ CLI par défaut défini sur **${cliName}**`, { parse_mode: 'Markdown' });
    }

    return ctx.reply(`❌ CLI inconnu. Disponibles: ${AVAILABLE_CLIS.join(', ')}, auto`);
});

// Action pour basculer l'état d'un CLI [ON/OFF]
bot.action(/toggle_cli:(.+)/, async (ctx) => {
    const session = getSession(ctx.chat.id);
    const cliName = ctx.match[1];

    if (session.disabledClis.includes(cliName)) {
        session.disabledClis = session.disabledClis.filter(c => c !== cliName);
    } else {
        session.disabledClis.push(cliName);
        // Si c'était le CLI par défaut, on le reset
        if (session.defaultCli === cliName) session.defaultCli = null;
    }

    // Rafraîchir l'affichage
    return renderCliSettings(ctx, session);
});

async function renderCliSettings(ctx, session) {
    const currentCli = session.defaultCli || "⚡ Auto (fallback)";

    const buttons = AVAILABLE_CLIS.map(cli => {
        const isDisabled = session.disabledClis.includes(cli);
        const isDefault = session.defaultCli === cli;
        const statusIcon = isDisabled ? '🔴' : '🟢';
        const label = `${statusIcon} ${cli}${isDefault ? ' (Def)' : ''}`;
        return [
            Markup.button.callback(label, `toggle_cli:${cli}`),
            Markup.button.callback(isDefault ? '⭐' : '🔸', `set_cli:${cli}`)
        ];
    });

    buttons.push([
        Markup.button.callback("🔄 Reset Auto", "set_cli:auto"),
        Markup.button.callback("🔁 Refresh", "refresh_clis")
    ]);

    const text = `🛠 **Configuration CLI**\n\n` +
        `Par défaut: **${currentCli}**\n` +
        `Désactivés: ${session.disabledClis.length > 0 ? '`' + session.disabledClis.join(', ') + '`' : 'Aucun'}\n\n` +
        `Appuyez sur [ON/OFF] pour activer une tuile.`;

    if (ctx.callbackQuery) {
        try {
            return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
        } catch (err) {
            if (err.description && err.description.includes('message is not modified')) {
                // Ignorer l'erreur si le message est identique
                return;
            }
            throw err;
        }
    } else {
        return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
}

bot.action(/set_cli:(.+)/, async (ctx) => {
    try {
        const session = getSession(ctx.chat.id);
        const cliName = ctx.match[1];

        if (cliName === 'auto') {
            session.defaultCli = null;
            session.disabledClis = []; // Réinitialiser aussi les CLI désactivés
        } else if (AVAILABLE_CLIS.includes(cliName)) {
            session.defaultCli = cliName;
            // Si on le met par défaut, on l'active s'il était désactivé
            session.disabledClis = session.disabledClis.filter(c => c !== cliName);
        }

        await ctx.answerCbQuery();
        return renderCliSettings(ctx, session);
    } catch (err) {
        console.error('[Action Error] set_cli:', err);
        return ctx.answerCbQuery('❌ Erreur lors du changement de CLI');
    }
});

bot.action('refresh_clis', async (ctx) => {
    try {
        await ctx.answerCbQuery('🔍 Scan en cours...');
        await initAvailableClis();
        const session = getSession(ctx.chat.id);
        return renderCliSettings(ctx, session);
    } catch (err) {
        console.error('[Action Error] refresh_clis:', err);
        return ctx.answerCbQuery('❌ Erreur lors du scan des CLI');
    }
});

// --- COMMANDE /model ---
bot.command('model', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!args) {
        // Afficher le modèle actuel et les options avec boutons
        const currentModel = session.defaultModel || "⚡ Auto";
        const currentCli = session.defaultCli || FALLBACK_ORDER[0] || 'gemini';

        // Récupérer les modèles pour le CLI actuel
        let modelsForCli = AVAILABLE_MODELS[currentCli] || [];

        // Si pas de modèles détectés, essayer de les récupérer
        if (modelsForCli.length === 0 && AVAILABLE_CLIS.includes(currentCli)) {
            modelsForCli = await getAvailableModels(currentCli);
        }

        const buttons = modelsForCli.map(model =>
            [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
        );

        // Boutons pour changer de CLI
        const cliButtons = AVAILABLE_CLIS.map(cli =>
            [Markup.button.callback(`🔧 CLI: ${cli}`, `change_model_cli:${cli}`)]
        );

        buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
        buttons.push([Markup.button.callback("🔁 Refresh modèles", `refresh_models:${currentCli}`)]);
        buttons.push(...cliButtons);

        return ctx.reply(
            `🤖 **Configuration Modèle**\n\n` +
            `Actuel: **${currentModel}**\n` +
            `CLI: **${currentCli}**\n\n` +
            `Modèles disponibles (${modelsForCli.length}) :`,
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
        );
    }

    // Si argument fourni directement
    const modelName = args.toLowerCase();
    if (modelName === 'auto') {
        session.defaultModel = null;
        return ctx.reply("✅ Modèle réinitialisé à **Auto**", { parse_mode: 'Markdown' });
    }

    session.defaultModel = modelName;
    return ctx.reply(`✅ Modèle par défaut défini sur **${modelName}**`, { parse_mode: 'Markdown' });
});

bot.action('set_model:auto', (ctx) => {
    const session = getSession(ctx.chat.id);
    session.defaultModel = null;
    return ctx.editMessageText("✅ Modèle réinitialisé à **Auto**", { parse_mode: 'Markdown' });
});

bot.action(/set_model:(.+)/, (ctx) => {
    const session = getSession(ctx.chat.id);
    const modelName = ctx.match[1];
    session.defaultModel = modelName;
    return ctx.editMessageText(`✅ Modèle par défaut défini sur **${modelName}**`, { parse_mode: 'Markdown' });
});

// Changer le CLI depuis /model
bot.action(/change_model_cli:(.+)/, async (ctx) => {
    const session = getSession(ctx.chat.id);
    const newCli = ctx.match[1];
    session.defaultCli = newCli;

    // Récupérer les modèles pour le nouveau CLI
    let modelsForCli = AVAILABLE_MODELS[newCli] || [];
    if (modelsForCli.length === 0) {
        modelsForCli = await getAvailableModels(newCli);
    }

    const currentModel = session.defaultModel || "⚡ Auto";

    const buttons = modelsForCli.map(model =>
        [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
    );

    const cliButtons = AVAILABLE_CLIS.map(cli =>
        [Markup.button.callback(`🔧 CLI: ${cli}`, `change_model_cli:${cli}`)]
    );

    buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
    buttons.push([Markup.button.callback("🔁 Refresh modèles", `refresh_models:${newCli}`)]);
    buttons.push(...cliButtons);

    return ctx.editMessageText(
        `🤖 **Configuration Modèle**\n\n` +
        `Actuel: **${currentModel}**\n` +
        `CLI: **${newCli}**\n\n` +
        `Modèles disponibles (${modelsForCli.length}) :`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
});

// Refresh les modèles pour un CLI
bot.action(/refresh_models:(.+)/, async (ctx) => {
    const cli = ctx.match[1];
    await ctx.answerCbQuery('🔍 Scan des modèles...');

    const models = await getAvailableModels(cli);
    AVAILABLE_MODELS[cli] = models;

    const session = getSession(ctx.chat.id);
    const currentModel = session.defaultModel || "⚡ Auto";

    const buttons = models.map(model =>
        [Markup.button.callback(`${session.defaultModel === model ? '✅' : '🤖'} ${model}`, `set_model:${model}`)]
    );

    const cliButtons = AVAILABLE_CLIS.map(c =>
        [Markup.button.callback(`🔧 CLI: ${c}`, `change_model_cli:${c}`)]
    );

    buttons.push([Markup.button.callback("🔄 Auto", "set_model:auto")]);
    buttons.push(...cliButtons);

    return ctx.editMessageText(
        `🤖 **Configuration Modèle**\n\n` +
        `Actuel: **${currentModel}**\n` +
        `CLI: **${cli}**\n\n` +
        `Modèles trouvés: ${models.length}\n` +
        `Modèles disponibles :`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
});

// --- COMMANDE /start & HELP ---
bot.command('start', async ctx => {
    console.log(`[Command] /start reçu de ${ctx.chat.id}`);
    const session = getSession(ctx.chat.id);
    session.state = "idle";

    await ctx.reply(
        "👋 **Bienvenue sur VibeCoder Orchestrator !**\n\n" +
        "_Je suis votre assistant de code multi-agents._\n\n" +
        "💡 **Comment ça marche ?**\n" +
        "1. Sélectionnez un projet avec 📁 Projets\n" +
        "2. Décrivez ce que vous voulez coder\n" +
        "3. Je m'occupe de tout (Architect → Developer → Tech Lead)\n\n" +
        "🚀 **Essayez maintenant !**",
        { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) }
    );
});

bot.action('action:help', async ctx => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(Messages.help, { parse_mode: 'Markdown' });
    // Ajouter bouton retour
    await ctx.reply("🔙 Pour revenir au menu", {
        ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Principal', 'nav:main')]])
    });
});

bot.action('action:history', async ctx => {
    const session = getSession(ctx.chat.id);
    await ctx.answerCbQuery();

    if (!session.activeRepo) {
        return ctx.reply("⚠️ Sélectionnez d'abord un projet avec /code");
    }

    const history = await loadSessionHistory(BASE_PROG_PATH, session.activeRepo);

    if (history.length === 0) {
        return ctx.editMessageText("📊 **Historique vide**\n\nAucune session enregistrée pour ce projet.");
    }

    const lastSessions = history.slice(0, 5);
    let text = "📊 **Dernières sessions**\n\n";

    lastSessions.forEach((s, i) => {
        const status = s.success ? '✅' : '❌';
        const date = new Date(s.date).toLocaleString('fr-FR');
        text += `${status} **${i + 1}.** ${date}\n   _${s.prompt?.slice(0, 50) || 'N/A'}..._\n\n`;
    });

    text += `\n🔙 Utilisez /save pour sauvegarder manuellement.`;

    await ctx.editMessageText(text, { parse_mode: 'Markdown' });
});

bot.action('action:code', async ctx => {
    const session = getSession(ctx.chat.id);
    await ctx.answerCbQuery();

    if (!session.activeRepo) {
        await ctx.reply("⚠️ Veuillez d'abord sélectionner un projet avec /code");
        return;
    }

    await ctx.editMessageText(Messages.awaitingInput, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Retour', 'nav:main')]])
    });
});

bot.action('action:set_notes', async ctx => {
    const session = getSession(ctx.chat.id);
    session.state = "awaiting_notes";
    await ctx.answerCbQuery();
    await ctx.editMessageText("📝 **Notes de session**\n\n_Tapez vos notes et envoyez._");
});

// --- COMMANDE /save ---
bot.command('save', async ctx => {
    const session = getSession(ctx.chat.id);
    const notes = ctx.message.text.split(' ').slice(1).join(' ') || session.saveNotes || 'Sauvegarde manuelle';

    if (!session.lastPrompt) {
        return ctx.reply("⚠️ Aucune session à sauvegarder. Codez d'abord quelque chose !");
    }

    const result = await manualSave(BASE_PROG_PATH, {
        repo: session.activeRepo,
        cli: session.defaultCli || 'auto',
        model: session.defaultModel || 'auto',
        prompt: session.lastPrompt,
        summary: session.lastSummary || 'Résumé non disponible',
        filesCreated: session.lastFiles || [],
        testResult: session.lastTestResult || '',
        success: true,
        attempts: 1,
        tags: ['manual-save'],
        notes: notes
    });

    if (result.success) {
        await ctx.reply(`💾 Session sauvegardée dans **MEMORY** !\n\n📁 ${result.path}`);
    } else {
        await ctx.reply(`❌ Erreur: ${result.error}`);
    }
});

// --- COMMANDE /settings ---
bot.command('settings', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const cli = session.defaultCli || "⚡ Auto (fallback chain)";
    const model = session.defaultModel || "⚡ Auto";
    const repo = session.activeRepo || "❌ Aucun";

    await ctx.reply(
        `⚙️ **Paramètres de la session**\n\n` +
        `📁 Projet: **${escapeMd(repo)}**\n` +
        `🤖 CLI: ${cli} | 🧠 Model: ${model}\n` +
        `💡 Utilisez les tuiles ou /cli et /model pour modifier.`,
        { parse_mode: 'Markdown', ...createMainMenuKeyboard(session) }
    );
});

// --- COMMANDE /ls ---
bot.command('ls', async (ctx) => {
    const session = getSession(ctx.chat.id);
    if (!session.activeRepo) {
        return ctx.reply("⚠️ Tapez /code pour choisir un projet d'abord.");
    }

    const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    const targetPath = arg ? path.join(BASE_PROG_PATH, session.activeRepo, arg) : path.join(BASE_PROG_PATH, session.activeRepo);

    // Sécurité basique pour ne pas remonter au-dessus du projet
    if (!targetPath.startsWith(path.join(BASE_PROG_PATH, session.activeRepo))) {
        return ctx.reply("⛔ Accès refusé (en dehors du repo).");
    }

    try {
        const stats = await fs.stat(targetPath);

        if (stats.isDirectory()) {
            const dirents = await fs.readdir(targetPath, { withFileTypes: true });
            dirents.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            // Ne garder que le contexte utile, limiter à 40 éléments
            const MAX_ITEMS = 40;
            const items = dirents.slice(0, MAX_ITEMS).map(d => {
                const icon = d.isDirectory() ? '📁' : '📄';
                return `${icon} \`${d.name}\``;
            });

            if (dirents.length > MAX_ITEMS) {
                items.push(`\n... et ${dirents.length - MAX_ITEMS} autres éléments.`);
            }

            const title = arg ? `📂 ${session.activeRepo}/${arg}` : `📂 ${session.activeRepo} (Racine)`;
            await ctx.reply(`${title}\n\n${items.join('\n') || '*Dossier vide*'}`, { parse_mode: 'Markdown' });

        } else if (stats.isFile()) {
            const content = await fs.readFile(targetPath, 'utf8');
            let preview = content;
            if (content.length > 3900) {
                preview = content.substring(0, 3900) + "\n\n...[FICHIER TRONQUÉ POUR TELEGRAM]";
            }
            // Utiliser une syntax markdown appropriée si on connait l'extension
            const ext = path.extname(targetPath).substring(1) || 'text';
            await ctx.reply(`📄 **${arg}**\n\n\`\`\`${ext}\n${preview}\n\`\`\``, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        await ctx.reply(`❌ Impossible d'accéder à \`${arg || '/'}\`.\n\n${err.message}`, { parse_mode: 'Markdown' });
    }
});

// --- GESTION DES NOTES & PIPELINE HANDLER ---
bot.on('text', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const text = ctx.message.text.trim();

    // Protection: ignorer les messages du bot lui-même
    if (ctx.from && ctx.from.is_bot) return;

    // Gestion des notes
    if (session.state === "awaiting_notes") {
        session.saveNotes = text;
        session.state = "idle";
        await ctx.reply(`💾 Notes enregistrées: "${text}"\n\nUtilisez /save pour sauvegarder la session.`, {
            ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Principal', 'nav:main')]])
        });
        return;
    }

    // Protection: éviter les exécutions multiples
    if (session.isProcessing) {
        console.log('[Pipeline] Déjà en cours, message ignoré');
        return;
    }

    if (session.state === "awaiting_repo_name") {
        const res = await createNewRepo(BASE_PROG_PATH, text);
        if (res.success) {
            session.activeRepo = text;
            session.state = "idle";
            return ctx.reply(`🚀 Projet **${escapeMd(text)}** prêt.`, { parse_mode: 'Markdown' });
        }
        return ctx.reply(`❌ Erreur: ${res.error}`);
    }

    if (!session.activeRepo) return ctx.reply("⚠️ Tapez /code pour choisir un projet.");

    // Marquer comme en cours de traitement
    session.isProcessing = true;

    // Options personnalisées pour les agents
    const agentOptions = {
        defaultCli: session.defaultCli,
        defaultModel: session.defaultModel,
        disabledClis: session.disabledClis,
        preferredCli: null
    };

    const prompt = text;
    const targetPath = path.join(BASE_PROG_PATH, session.activeRepo);
    const statusMsg = await ctx.reply(`⏳ [${session.activeRepo}] Analyse...`);

    const sendEdit = async (m) => {
        try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, m); } catch (e) { }
    };

    try {
        // Variables pour la sauvegarde mémoire
        let finalCode = "", filesCreated = [], testResult = "", sessionSummary = "";

        await initMemory(BASE_PROG_PATH);

        // Log du début de session dans le Daily Log
        await appendToDailyLog(BASE_PROG_PATH, session.activeRepo,
            `Démarrage: ${prompt.slice(0, 80)}...`);

        const memoryContext = await queryMemory(BASE_PROG_PATH, prompt);
        let attempt = 1, success = false, errorMessage = null;
        const MAX_ATTEMPTS = 3;

        while (attempt <= MAX_ATTEMPTS) {
            await sendEdit(`🧠 (Essai ${attempt}/${MAX_ATTEMPTS}) Réflexion et génération du code...`);

            const agentResult = await runVibeAgent(prompt, memoryContext, errorMessage, agentOptions);
            const agentOutput = agentResult.output;
            finalCode = agentOutput;

            console.log(`[Pipeline] Agent output length: ${agentOutput?.length || 0}`);
            console.log(`[Pipeline] Agent used CLI: ${agentResult.usedCli}`);

            await sendEdit(`💾 (Essai ${attempt}/${MAX_ATTEMPTS}) Écriture...`);
            filesCreated = await applyCodeToFiles(finalCode, targetPath);
            if (filesCreated.length === 0) {
                errorMessage = "Format non respecté (### FILE: ou ### PATCH:).";
                attempt++; continue; // Retry
            }

            await sendEdit(`⚡ (Essai ${attempt}/${MAX_ATTEMPTS}) Lancement des tests...`);

            let logBuffer = "";
            let lastEditTime = 0;
            const onLog = (out, err) => {
                const now = Date.now();
                if (out) logBuffer += out;
                if (err) logBuffer += err;

                if (logBuffer.length > 1000) {
                    logBuffer = logBuffer.substring(logBuffer.length - 1000);
                }

                if (now - lastEditTime > 1500) {
                    lastEditTime = now;
                    sendEdit(`⚡ (Essai ${attempt}/${MAX_ATTEMPTS}) Tests en cours...\n\n\`\`\`text\n${logBuffer}\n\`\`\``).catch(() => { });
                }
            };

            const test = await executeAndTest(finalCode, targetPath, onLog);
            testResult = test.message || test.error;
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        // Générer un résumé automatique
        sessionSummary = await generateSummary(finalCode, prompt);

        if (success) {
            await sendEdit(`🔄 Commit Git dans ${session.activeRepo}...`);

            // Git commit optionnel
            try {
                await autoCommitGit(targetPath, "VibeCode: " + prompt.slice(0, 30));
            } catch (gitErr) {
                console.warn(`[Actions] Git non initialisé dans ${session.activeRepo}, commit ignoré.`);
            }

            // AUTO-SAVE: Sauvegarder la session dans MEMORY
            const saveResult = await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo,
                cli: agentOptions.defaultCli || 'auto',
                model: agentOptions.defaultModel || 'auto',
                prompt: prompt,
                summary: sessionSummary,
                filesCreated: filesCreated,
                testResult: testResult,
                success: true,
                attempts: attempt,
                tags: ['auto-saved', 'success'],
                notes: ''
            });

            if (saveResult.success) {
                console.log(`[Memory] Session auto-sauvegardée: ${saveResult.path}`);
            }

            session.lastPrompt = prompt;
            session.lastSummary = sessionSummary;
            session.lastFiles = filesCreated;
            session.lastTestResult = testResult;

            const filesList = filesCreated.length > 0
                ? filesCreated.map(f => `• \`${f}\``).join('\n')
                : 'Aucun';
            const testOutput = testResult ? testResult.trim() : 'Aucun test exécuté';

            await ctx.reply(
                `🎯 **Succès !**\n\n` +
                `📁 **Fichiers créés/modifiés :**\n${filesList}\n\n` +
                `⚡ **Résultat :**\n\`\`\`text\n${testOutput}\n\`\`\``,
                { parse_mode: 'Markdown' }
            );
            await sendEdit(`✅ Terminé !`);
        } else {
            // AUTO-SAVE même en cas d'échec
            await saveSessionSummary(BASE_PROG_PATH, {
                repo: session.activeRepo,
                cli: agentOptions.defaultCli || 'auto',
                model: agentOptions.defaultModel || 'auto',
                prompt: prompt,
                summary: `Échec après ${attempt} essais`,
                filesCreated: filesCreated,
                testResult: testResult,
                success: false,
                attempts: attempt,
                tags: ['auto-saved', 'failed'],
                notes: `Erreur: ${errorMessage}`
            });

            await ctx.reply(`❌ Échec après ${MAX_ATTEMPTS} essais.\n\nErreur: ${errorMessage}`);
            await sendEdit(`❌ Échec définitif.`);
        }

    } catch (e) {
        console.error(e);

        // AUTO-SAVE en cas d'erreur critique
        await saveSessionSummary(BASE_PROG_PATH, {
            repo: getSession(ctx.chat.id).activeRepo,
            cli: 'auto',
            model: 'auto',
            prompt: text,
            summary: 'Erreur critique',
            filesCreated: [],
            testResult: '',
            success: false,
            attempts: attempt,
            tags: ['auto-saved', 'failed-critical'],
            notes: `Exception: ${e.message}`
        });

        await ctx.reply(`💥 Erreur d'orchestration : ${e.message}`);
        await sendEdit(`💥 Erreur.`);
    } finally {
        session.isProcessing = false;
        session.state = "idle";
    }
});

// --- INIT ---
try {
    console.log("[Système] VibeCoder Orchestrator v2.5 - Role-based Fallback...");
    console.log("[Système] Commandes: /code, /cli, /model, /settings, /help, /save, /history");

    // Initialiser les CLI disponibles
    initAvailableClis();

    // Initialiser la mémoire
    initMemory(BASE_PROG_PATH);

    bot.launch();
    console.log("[Telegram] Connecté.");
} catch (e) { console.error(e); }

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
