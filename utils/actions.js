import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';

function resolvePathInsideRepo(repoPath, relativeFilePath) {
    if (!relativeFilePath || typeof relativeFilePath !== 'string') {
        throw new Error('Chemin de fichier invalide.');
    }

    if (path.isAbsolute(relativeFilePath)) {
        throw new Error(`Chemin absolu interdit: ${relativeFilePath}`);
    }

    const normalizedRepoPath = path.resolve(repoPath);
    const absolutePath = path.resolve(normalizedRepoPath, relativeFilePath);
    const relativeFromRepo = path.relative(normalizedRepoPath, absolutePath);

    if (relativeFromRepo.startsWith('..') || path.isAbsolute(relativeFromRepo)) {
        throw new Error(`Chemin hors dépôt interdit: ${relativeFilePath}`);
    }

    return absolutePath;
}

function parseCommandLine(commandToRun) {
    const trimmed = commandToRun.trim();
    if (!trimmed) {
        throw new Error('Commande vide.');
    }

    // Refuse explicit shell chaining/redirection to avoid injection primitives.
    if (/[|&;<>`]/.test(trimmed)) {
        throw new Error('La commande contient des opérateurs shell interdits.');
    }

    const tokens = [];
    const tokenRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
    let match;

    while ((match = tokenRegex.exec(trimmed)) !== null) {
        const quotedDouble = match[1];
        const quotedSingle = match[2];
        if (quotedDouble !== undefined) {
            tokens.push(quotedDouble.replace(/\\(["\\])/g, '$1'));
        } else if (quotedSingle !== undefined) {
            tokens.push(quotedSingle.replace(/\\(['\\])/g, '$1'));
        } else {
            tokens.push(match[0]);
        }
    }

    if (tokens.length === 0) {
        throw new Error('Impossible de parser la commande.');
    }

    const [cmd, ...args] = tokens;
    return { cmd, args };
}

/**
 * Parcourt le texte généré par l'IA et extrait les blocs de code pour les écrire sur le disque.
 * Format attendu :
 * 1. Pour chaque fichier à créer ou modifier :
 * ### FILE: chemin/vers/fichier.ext
 * ```language
 * // code complet
 * ```
 *
 * 2. Spécifie la commande de test finale tout à la fin :
 * ### RUN: commande_de_test
 *
 * IMPORTANT : Assure-toi qu'il n'y a AUCUN espace ou texte entre le marqueur ### FILE: et le début du bloc de code (```).
 *
 * ZÉRO TEXTE INTRODUCTIF. ZÉRO BLA-BLA. JUSTE LE FORMAT TECHNIQUE.
 */
export async function applyCodeToFiles(llmOutput, repoPath) {
    // Regex simplifiée et robuste pour ### FILE:
    // Match: ### FILE: chemin/vers/fichier.ext suivi d'un bloc de code
    const fileRegex = /### FILE:\s*([^\s\r\n]+)\s*\n```([^\n]*)\r?\n([\s\S]*?)```/gi;
    const patchRegex = /### PATCH:\s*([^\s\r\n]+)\s*\r?\n<<<<\r?\n([\s\S]*?)\r?\n====\r?\n([\s\S]*?)\r?\n>>>>/gi;

    let match;
    let filesWritten = [];

    console.log('[Actions] Tentative de parsing du output Tech Lead...');
    console.log(`[Actions] Output length: ${llmOutput.length}`);
    console.log(`[Actions] Premier 200 chars: ${llmOutput.slice(0, 200)}`);

    // Log pour debug si aucun match
    const hasFileMatch = fileRegex.test(llmOutput);
    fileRegex.lastIndex = 0; // Reset après le test

    const hasPatchMatch = patchRegex.test(llmOutput);
    patchRegex.lastIndex = 0; // Reset après le test

    const hasMatch = hasFileMatch || hasPatchMatch;

    console.log(`[Actions] Has ### FILE: matches: ${hasFileMatch}, Has ### PATCH: matches: ${hasPatchMatch}`);

    if (!hasMatch) {
        console.log('[Actions] Aucun bloc de code détecté avec ### FILE:. Analyse du contenu brut...');

        // Tentative de récupération : chercher directement les blocs de code markdown
        const codeBlockRegex = /```([^\n]*)\r?\n([\s\S]*?)```/g;
        const codeBlocks = [];
        const codeLanguages = [];
        let codeMatch;
        while ((codeMatch = codeBlockRegex.exec(llmOutput)) !== null) {
            codeBlocks.push(codeMatch[2]);
            codeLanguages.push(codeMatch[1] || '');
        }

        if (codeBlocks.length > 0) {
            // Extraire le nom de fichier du contexte
            let fileName = null;

            // Essai 1: Chercher dans le texte
            const fileNameMatch = llmOutput.match(/(?:file|fichier|create|écris|nom)[\s:]+([^\s\r\n]+\.\w+)/i);
            if (fileNameMatch) fileName = fileNameMatch[1];

            // Essai 2: Déduire de la langue du code
            if (!fileName && codeLanguages[0]) {
                const langToExt = {
                    'python': '.py', 'py': '.py',
                    'javascript': '.js', 'js': '.js', 'node': '.js',
                    'typescript': '.ts', 'ts': '.ts',
                    'html': '.html',
                    'css': '.css',
                    'json': '.json',
                    'markdown': '.md', 'md': '.md',
                    'bash': '.sh', 'shell': '.sh',
                    'sql': '.sql',
                    'java': '.java',
                    'c': '.c', 'cpp': '.cpp', 'c++': '.cpp',
                    'go': '.go',
                    'rust': '.rs',
                    'ruby': '.rb',
                    'php': '.php'
                };
                const ext = langToExt[codeLanguages[0].toLowerCase()];
                if (ext) {
                    fileName = `generated${ext}`;
                }
            }

            // Essai 3: Regarder le contenu du code pour des indices
            if (!fileName && codeBlocks[0]) {
                if (codeBlocks[0].includes('def main()') || codeBlocks[0].includes('import ') || codeBlocks[0].includes('#!/')) {
                    fileName = 'script.py';
                } else if (codeBlocks[0].includes('function ') || codeBlocks[0].includes('const ') || codeBlocks[0].includes('export ')) {
                    fileName = 'index.js';
                } else if (codeBlocks[0].includes('<html') || codeBlocks[0].includes('<!DOCTYPE')) {
                    fileName = 'index.html';
                }
            }

            // Fallback final
            fileName = fileName || 'generated-code.js';

            // Écrire le premier bloc de code trouvé
            const absolutePath = resolvePathInsideRepo(repoPath, fileName);
            const dir = path.dirname(absolutePath);

            try {
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(absolutePath, codeBlocks[0], 'utf-8');
                filesWritten.push(fileName);
                console.log(`[Actions] Fichier écrit (récupération) : ${absolutePath}`);
            } catch (err) {
                console.error(`[Actions] Erreur d'écriture pour le fichier ${absolutePath}:`, err);
            }
        }

        // Sauvegarder l'output problématique pour analyse si nécessaire
        try {
            const debugFile = resolvePathInsideRepo(repoPath, 'debug-last-failed-output.txt');
            await fs.writeFile(debugFile, llmOutput, 'utf-8');
            console.log(`[Actions] Output brut sauvegardé dans ${debugFile}`);
        } catch (e) { }
    }

    while ((match = fileRegex.exec(llmOutput)) !== null) {
        const relativeFilePath = match[1].trim();
        const language = match[2] || '';
        const codeContent = match[3];  // ← Le code est dans le groupe 3, pas 2 !

        console.log(`[Actions] Fichier trouvé: ${relativeFilePath} (${language || 'unknown'})`);
        console.log(`[Actions] Code length: ${codeContent.length}`);

        const absolutePath = resolvePathInsideRepo(repoPath, relativeFilePath);
        const dir = path.dirname(absolutePath);

        try {
            // S'assurer que le dossier parent existe
            await fs.mkdir(dir, { recursive: true });

            // Écrire le contenu dans le fichier
            await fs.writeFile(absolutePath, codeContent, 'utf-8');
            filesWritten.push(relativeFilePath);
            console.log(`[Actions] Fichier écrit : ${absolutePath}`);
        } catch (err) {
            console.error(`[Actions] Erreur d'écriture pour le fichier ${absolutePath}:`, err);
            throw new Error(`Erreur d'écriture sur ${relativeFilePath}: ${err.message}`);
        }
    }

    // --- APPLICATION DES PATCHS ---
    while ((match = patchRegex.exec(llmOutput)) !== null) {
        const relativeFilePath = match[1].trim();
        const originalCode = match[2];
        const newCode = match[3];

        console.log(`[Actions] Patch trouvé pour: ${relativeFilePath}`);
        const absolutePath = resolvePathInsideRepo(repoPath, relativeFilePath);

        try {
            const currentContent = await fs.readFile(absolutePath, 'utf-8');

            // On vérifie si on trouve le bloc exact
            if (!currentContent.includes(originalCode)) {
                throw new Error(`Le bloc original à remplacer n'a pas été trouvé dans le fichier.`);
            }

            const updatedContent = currentContent.replace(originalCode, newCode);
            await fs.writeFile(absolutePath, updatedContent, 'utf-8');
            filesWritten.push(relativeFilePath);
            console.log(`[Actions] Patch appliqué sur : ${absolutePath}`);
        } catch (err) {
            console.error(`[Actions] Erreur d'application du patch sur ${absolutePath}:`, err);
            throw new Error(`Erreur de patch sur ${relativeFilePath}: ${err.message}`);
        }
    }

    return filesWritten;
}

/**
 * Extrait la commande de test "### RUN: commande" et l'exécute avec timeout
 */
export async function executeAndTest(llmOutput, repoPath, onProgress = null) {
    const runRegex = /### RUN:\s*([^\r\n]+)/;
    const match = runRegex.exec(llmOutput);

    if (!match) {
        console.log('[Actions] Aucune commande ### RUN: trouvée.');
        return { success: true, message: 'Aucun test spécifié.' };
    }

    const commandToRun = match[1].trim();
    console.log(`[Actions] Exécution de la commande de test : ${commandToRun}`);

    try {
        // Exécuter la commande sans shell pour réduire le risque d'injection.
        const { cmd, args } = parseCommandLine(commandToRun);

        const child = execa(cmd, args, {
            cwd: repoPath,
            timeout: 15000,
            shell: false
        });

        if (onProgress) {
            child.stdout?.on('data', data => onProgress(data.toString(), null));
            child.stderr?.on('data', data => onProgress(null, data.toString()));
        }

        const { stdout, stderr } = await child;
        return { success: true, message: `Test réussi:\n${stdout}` };
    } catch (err) {
        console.error(`[Actions] Erreur lors de l'exécution de: ${commandToRun}`);
        return { success: false, error: err.stderr || err.message };
    }
}

/**
 * Effectue un commit Git si les modifications sont approuvées.
 * Initialise le dépôt si nécessaire.
 */
export async function autoCommitGit(repoPath, message) {
    console.log(`[Actions] Création d'un commit Git...`);
    try {
        // Vérifier si .git existe
        const gitPath = path.join(repoPath, '.git');
        try {
            await fs.access(gitPath);
        } catch (e) {
            console.log(`[Actions] Initialisation d'un nouveau dépôt Git dans ${repoPath}...`);
            await execa('git', ['init'], { cwd: repoPath });
        }

        // Ajout de tous les fichiers modifiés/créés
        await execa('git', ['add', '.'], { cwd: repoPath });

        // Commit automatique
        await execa('git', ['commit', '-m', message], { cwd: repoPath });
        console.log(`[Actions] Commit Git effectué avec succès.`);
        return true;
    } catch (err) {
        if (err.stdout && err.stdout.includes('nothing to commit')) {
            console.log(`[Actions] Rien à commiter.`);
            return true;
        }
        console.error(`[Actions] Erreur de commit Git:`, err.message);
        throw new Error(`Échec du commit Git: ${err.message}`);
    }
}

/**
 * Liste les répertoires disponibles dans le chemin de base
 */
export async function listRepos(basePath) {
    try {
        const entries = await fs.readdir(basePath, { withFileTypes: true });
        return entries
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name);
    } catch (error) {
        console.error("Erreur lors du listage des repos:", error);
        return [];
    }
}

/**
 * Crée un nouveau répertoire de projet avec un .gitignore de base
 */
export async function createNewRepo(basePath, name) {
    const targetPath = path.join(basePath, name);
    try {
        await fs.mkdir(targetPath, { recursive: true });
        // Initialiser un gitignore par défaut
        const gitignoreContent = "node_modules/\n.env\n.DS_Store\n";
        await fs.writeFile(path.join(targetPath, ".gitignore"), gitignoreContent);
        return { success: true, path: targetPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
