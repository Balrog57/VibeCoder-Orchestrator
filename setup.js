import fs from 'fs/promises';
import { createInterface } from 'readline';
import { execa } from 'execa';
import path from 'path';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
    console.log("\n💎 --- VibeCoder Orchestrator: INSTALLATEUR --- 💎\n");

    try {
        // 1. Choix du dossier de code principal
        const defaultPath = "C:\\Users\\Marc\\Documents\\1G1R\\_Programmation";
        let baseProgPath = await question(`➡️ Dossier principal de vos projets [Défaut: ${defaultPath}]: `);
        if (!baseProgPath.trim()) baseProgPath = defaultPath;

        // 2. Variables Telegram
        const botToken = await question("➡️ Votre Token Bot Telegram: ");
        const telegramId = await question("➡️ Votre ID Telegram (numérique): ");

        if (!botToken.trim() || !telegramId.trim()) {
            throw new Error("Le Token et l'ID sont obligatoires.");
        }

        // 3. Création du fichier .env
        console.log("\n📝 Configuration du fichier .env...");
        const envContent = `BOT_TOKEN=${botToken.trim()}\nMY_TELEGRAM_ID=${telegramId.trim()}\nBASE_PROG_PATH=${baseProgPath.trim().replace(/\\/g, '\\\\')}\n`;
        await fs.writeFile('.env', envContent, 'utf8');

        // 4. Installation des dépendances
        console.log("\n📦 Installation des dépendances Node.js...");
        await execa('npm', ['install'], { stdio: 'inherit' });

        // 4.5. Vérification et Installation de Bun (requis pour QMD sur Windows/FTS5)
        console.log("\n⚡ Vérification de Bun...");
        try {
            await execa('bun', ['--version']);
            console.log("✅ Bun est déjà installé.");
        } catch (e) {
            console.log("⚠️ Bun n'est pas détecté. Tentative d'installation automatique...");
            try {
                // Commande officielle d'installation Bun pour Windows via PowerShell
                await execa('powershell', ['-Command', 'irm bun.sh/install.ps1 | iex'], { stdio: 'inherit' });
                console.log("✅ Bun a été installé. Note : Vous devrez peut-être redémarrer votre terminal pour que 'bun' soit reconnu.");

                // On essaie de rafraîchir le PATH pour la session actuelle si possible (approximatif)
                const bunPath = path.join(process.env.USERPROFILE, '.bun', 'bin');
                process.env.PATH = `${bunPath};${process.env.PATH}`;
            } catch (installErr) {
                console.error("❌ Échec de l'installation automatique de Bun.");
                console.log("👉 Veuillez installer Bun manuellement : https://bun.sh/docs/installation");
                throw new Error("Bun est requis pour le bon fonctionnement de QMD sur Windows.");
            }
        }

        // 4.6. Installation de QMD
        console.log("\n🔍 Installation de QMD (Moteur de recherche sémantique)...");
        try {
            await execa('bun', ['install', '-g', 'https://github.com/tobi/qmd'], { stdio: 'inherit' });
        } catch (e) {
            // Si bun install -g échoue (peut-être path non mis à jour), on tente avec le chemin absolu s'il vient d'être installé
            const bunBin = path.join(process.env.USERPROFILE, '.bun', 'bin', 'bun');
            try {
                await execa(bunBin, ['install', '-g', 'https://github.com/tobi/qmd'], { stdio: 'inherit' });
            } catch (e2) {
                console.log("⚠️ Impossible d'installer QMD via Bun.");
                console.log("👉 Tentative manuelle recommandée : bun install -g https://github.com/tobi/qmd");
            }
        }

        // 5. Initialisation de la mémoire globale
        console.log("\n🧠 Initialisation de la mémoire locale (QMD)...");
        const memoryDir = path.join(baseProgPath.trim(), 'MEMORY');
        if (!await fs.stat(memoryDir).catch(() => false)) {
            await fs.mkdir(memoryDir, { recursive: true });
        }

        // 6. Création du raccourci de démarrage (Auto-Start Windows)
        console.log("\n⚙️ Configuration du démarrage automatique Windows...");
        const startupFolder = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        const batPath = path.join(process.cwd(), 'start.bat');
        const shortcutScript = `
        Set oWS = WScript.CreateObject("WScript.Shell")
        sLinkFile = "${path.join(startupFolder, 'VibeCoder_Orchestrator.lnk')}"
        Set oLink = oWS.CreateShortcut(sLinkFile)
        oLink.TargetPath = "${batPath}"
        oLink.WorkingDirectory = "${process.cwd()}"
        oLink.Description = "Lancement automatique de VibeCoder Orchestrator"
        oLink.Save
        `;
        const vbsPath = path.join(process.cwd(), 'create_shortcut.vbs');
        await fs.writeFile(vbsPath, shortcutScript, 'utf8');
        await execa('cscript', [vbsPath], { stdio: 'ignore' });
        await fs.unlink(vbsPath); // Nettoyage

        console.log("\n✅ INSTALLATION TERMINÉE AVEC SUCCÈS !");
        console.log(`🚀 Lancez le bot avec : node index.js`);

    } catch (err) {
        console.error("\n❌ ERREUR LORS DE L'INSTALLATION :", err.message);
    } finally {
        rl.close();
    }
}

setup();
