import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import { initMemory, queryMemory, saveSessionMemory } from './utils/memory.js';
import { runArchitectAgent, runDeveloperAgent, runTechLeadAgent } from './utils/agents.js';
import { applyCodeToFiles, executeAndTest, autoCommitGit, listRepos, createNewRepo } from './utils/actions.js';

// Chargement et conversion de l'ID autorisé
const MY_TELEGRAM_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: Infinity });

const MAX_RETRIES = 2;
const BASE_PROG_PATH = process.env.BASE_PROG_PATH || "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
const REPO_PATH = process.cwd();

// --- GESTION DES SESSIONS ---
const sessions = {};
function getSession(chatId) {
    if (!sessions[chatId]) sessions[chatId] = { activeRepo: null, state: "idle" };
    return sessions[chatId];
}

// --- SÉCURITÉ ---
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id !== MY_TELEGRAM_ID) return;
    return next();
});

// --- UI REPO SELECTION ---
async function showRepoSelection(ctx, page = 0) {
    console.log(`[UI] Affichage de la sélection de projets (Page ${page})...`);
    const repos = await listRepos(BASE_PROG_PATH);
    console.log(`[UI] ${repos.length} projets trouvés dans ${BASE_PROG_PATH}.`);

    const pageSize = 6;
    const start = page * pageSize;
    const currentRepos = repos.slice(start, start + pageSize);

    const buttons = currentRepos.map(repo => [Markup.button.callback(`📁 ${repo}`, `select_repo:${repo}`)]);
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback("⬅️", `page:${page - 1}`));
    navButtons.push(Markup.button.callback("➕ Nouveau", "new_repo"));
    if (start + pageSize < repos.length) navButtons.push(Markup.button.callback("➡️", `page:${page + 1}`));
    buttons.push(navButtons);

    const text = "💎 **VibeCoder Orchestrator**\nChoisissez un projet :";
    const keyboard = Markup.inlineKeyboard(buttons);
    return ctx.callbackQuery ? ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }) : ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

bot.command('code', ctx => {
    console.log(`[Command] /code reçu de ${ctx.chat.id}`);
    getSession(ctx.chat.id).state = "idle";
    return showRepoSelection(ctx, 0);
});

bot.action(/page:(.+)/, ctx => showRepoSelection(ctx, parseInt(ctx.match[1])));
bot.action("new_repo", ctx => {
    getSession(ctx.chat.id).state = "awaiting_repo_name";
    return ctx.editMessageText("📝 Nom du nouveau projet :");
});

bot.action(/select_repo:(.+)/, async (ctx) => {
    const repoName = ctx.match[1];
    const session = getSession(ctx.chat.id);
    session.activeRepo = repoName;
    session.state = "idle";
    return ctx.editMessageText(`✅ Projet **${repoName}** actif. Instructions ?`, { parse_mode: 'Markdown' });
});

// --- PIPELINE HANDLER ---
bot.on('text', async (ctx) => {
    const session = getSession(ctx.chat.id);
    const text = ctx.message.text.trim();

    if (session.state === "awaiting_repo_name") {
        const res = await createNewRepo(BASE_PROG_PATH, text);
        if (res.success) {
            session.activeRepo = text;
            session.state = "idle";
            return ctx.reply(`🚀 Projet **${text}** prêt.`);
        }
        return ctx.reply(`❌ Erreur: ${res.error}`);
    }

    if (!session.activeRepo) return ctx.reply("⚠️ Tapez /code pour choisir un projet.");

    const prompt = text;
    const targetPath = path.join(BASE_PROG_PATH, session.activeRepo);
    const statusMsg = await ctx.reply(`⏳ [${session.activeRepo}] Analyse...`);

    const sendEdit = async (m) => {
        try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, m); } catch (e) { }
    };

    try {
        const memoryContext = await queryMemory(prompt);
        let attempt = 1, success = false, finalCode = "", errorMessage = null;

        while (attempt <= MAX_RETRIES + 1) {
            await sendEdit(`🧠 (Essai ${attempt}/${MAX_RETRIES + 1}) Réflexion...`);
            const plan = await runArchitectAgent(prompt, memoryContext);
            const devCode = await runDeveloperAgent(plan, memoryContext, errorMessage);
            finalCode = await runTechLeadAgent(devCode);

            await sendEdit(`💾 (Essai ${attempt}/${MAX_RETRIES + 1}) Écriture...`);
            const files = await applyCodeToFiles(finalCode, targetPath);
            if (files.length === 0) {
                errorMessage = "Format non respecté (### FILE:).";
                attempt++; continue;
            }

            await sendEdit(`⚡ (Essai ${attempt}/${MAX_RETRIES + 1}) Tests...`);
            const test = await executeAndTest(finalCode, targetPath);
            if (test.success) { success = true; break; }
            errorMessage = test.error; attempt++;
        }

        if (success) {
            await sendEdit(`🔄 Commit Git dans ${session.activeRepo}...`);
            await autoCommitGit(targetPath, "VibeCode: " + prompt.slice(0, 30));
            await saveSessionMemory(session.activeRepo, `Req: ${prompt}\nRes: ${finalCode}`, { path: targetPath, success: true });
            await ctx.reply(`🎯 **Succès !**\n\n\`\`\`\n${finalCode.slice(0, 1000)}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`❌ Échec après ${MAX_RETRIES + 1} essais.\n\nErreur: ${errorMessage}`);
        }
    } catch (e) {
        console.error(e);
        await ctx.reply("💥 Erreur orchestrateur.");
    }
});

// --- INIT ---
try {
    console.log("[Système] VibeCoder Orchestrator v2.1...");
    await initMemory();
    bot.launch();
    console.log("[Telegram] Connecté.");
} catch (e) { console.error(e); }

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
