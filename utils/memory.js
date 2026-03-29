import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';

/**
 * SYSTÈME DE MÉMOIRE - Utilise QMD comme backend principal
 * 
 * Deux couches de mémoire :
 * 1. Daily Log (MEMORY/YYYY-MM-DD.md) - Journal quotidien append-only
 * 2. Session Memory (MEMORY/sessions/) - Résumés structurés par session
 * 
 * QMD est utilisé pour :
 * - L'indexation automatique des fichiers Markdown
 * - La recherche sémantique hybride (BM25 + vecteurs)
 * - Le reranking avec diversité (MMR)
 */

// Initialiser le dossier de mémoire et l'index QMD
export async function initMemory(basePath) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const sessionsPath = path.join(memoryPath, 'sessions');
    const weeklyPath = path.join(memoryPath, 'weekly');
    
    try {
        await fs.mkdir(memoryPath, { recursive: true });
        await fs.mkdir(sessionsPath, { recursive: true });
        await fs.mkdir(weeklyPath, { recursive: true });
        
        // Initialiser QMD si disponible
        await initQMD(basePath);
        
        console.log(`[Memory] Initialisé: ${memoryPath}`);
    } catch (err) {
        console.error(`[Memory] Erreur d'initialisation:`, err);
    }
}

// Initialiser QMD dans le répertoire de mémoire
async function initQMD(basePath) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const qmdPath = path.join(process.cwd(), 'libs', 'qmd', 'dist', 'cli', 'qmd.js');
    
    const env = {
        ...process.env,
        XDG_CONFIG_HOME: path.join(memoryPath, 'xdg-config'),
        XDG_CACHE_HOME: path.join(memoryPath, 'xdg-cache')
    };
    
    try {
        // QMD s'initialise automatiquement au premier usage
        // On utilise Bun car il inclut nativement fts5 requis par QMD sur Windows
        await execa('bun', [qmdPath, '--version'], {
            cwd: basePath,
            env,
            timeout: 5000
        });
        console.log('[Memory] QMD disponible via local libs');
    } catch (err) {
        console.warn('[Memory] QMD non disponible - fallback texte uniquement', err.message);
    }
}

// Interroger la mémoire locale via QMD
export async function queryMemory(basePath, prompt) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const qmdPath = path.join(process.cwd(), 'libs', 'qmd', 'dist', 'cli', 'qmd.js');
    
    const env = {
        ...process.env,
        XDG_CONFIG_HOME: path.join(memoryPath, 'xdg-config'),
        XDG_CACHE_HOME: path.join(memoryPath, 'xdg-cache')
    };
    
    // Essayer QMD en premier
    try {
        console.log(`[Memory] Query QMD: "${prompt.slice(0, 50)}..."`);
        
        const { stdout } = await execa('bun', [qmdPath, 'query', prompt, '--cwd', 'MEMORY'], {
            cwd: basePath,
            env,
            timeout: 20000, // 20s timeout (re-ranker can be slow)
            reject: false
        });
        
        // Vérifier si QMD a retourné des résultats valides
        if (stdout && 
            !stdout.includes('panic') && 
            !stdout.includes('segfault') &&
            !stdout.includes('No results found') &&
            stdout.trim().length > 0) {
            
            console.log(`[Memory] QMD résultats trouvés`);
            return stdout;
        } else {
            console.log('[Memory] QMD: Aucun résultat');
        }
    } catch (err) {
        console.warn(`[Memory] QMD échec: ${err.message}`);
    }
    
    // Fallback: recherche textuelle simple
    try {
        return await simpleTextSearch(memoryPath, prompt);
    } catch (err) {
        console.warn('[Memory] Recherche fallback échouée.');
        return '';
    }
}

// Recherche textuelle simple (fallback si QMD échoue)
export async function simpleTextSearch(memoryPath, query) {
    try {
        const mdFiles = await collectMarkdownFiles(memoryPath, memoryPath);
        
        if (mdFiles.length === 0) return '';
        
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const results = [];
        
        // Lire les 15 fichiers les plus récents
        for (const fileInfo of mdFiles.slice(-15)) {
            try {
                const filePath = fileInfo.absolutePath;
                const content = await fs.readFile(filePath, 'utf8');
                const contentLower = content.toLowerCase();
                
                // Score BM25 simplifié
                let score = 0;
                for (const term of queryTerms) {
                    const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
                    if (matches > 0) {
                        score += matches * (1 / Math.log2(content.length + 1));
                    }
                }
                
                // Boost temporel (fichiers récents)
                const dateMatch = fileInfo.relativePath.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                    const fileDate = new Date(dateMatch[1]);
                    const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                    const temporalBoost = Math.exp(-0.03 * daysOld);
                    score *= temporalBoost;
                }
                
                if (score > 0.1) {
                    // Extraire le snippet pertinent
                    const snippet = extractSnippet(content, queryTerms);
                    results.push({ filename: fileInfo.relativePath, score, content: snippet });
                }
            } catch (err) {
                // Ignorer les fichiers illisibles
            }
        }
        
        // Retourner les 3 meilleurs résultats
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 3).map(r => `[${r.filename}]: ${r.content}`).join('\n\n');
    } catch (err) {
        return '';
    }
}

async function collectMarkdownFiles(rootPath, currentPath) {
    const output = [];
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
        const absolutePath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            // Ignore technical folders that do not bring user context.
            if (entry.name === 'xdg-cache' || entry.name === 'xdg-config') continue;
            const nested = await collectMarkdownFiles(rootPath, absolutePath);
            output.push(...nested);
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
            output.push({
                absolutePath,
                relativePath: path.relative(rootPath, absolutePath).replace(/\\/g, '/')
            });
        }
    }

    return output;
}

function getIsoWeekInfo(date = new Date()) {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    const isoYear = utcDate.getUTCFullYear();

    return { isoYear, weekNo };
}

export function getWeeklyLogPath(memoryPath, date = new Date()) {
    const { isoYear, weekNo } = getIsoWeekInfo(date);
    const week = String(weekNo).padStart(2, '0');
    return path.join(memoryPath, 'weekly', `${isoYear}-W${week}.md`);
}

function sanitizeRepoName(repoName = 'unknown') {
    return repoName.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function getProjectMemoryPath(basePath, repoName) {
    const memoryPath = path.join(basePath, 'MEMORY');
    return path.join(memoryPath, 'projects', sanitizeRepoName(repoName), 'MEMORY.md');
}

async function appendToWeeklyLog(basePath, sessionName, event) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const timestamp = new Date().toISOString();
    const weeklyLogPath = getWeeklyLogPath(memoryPath, new Date());
    const logEntry = `## [${timestamp}] ${sessionName}\n${event}\n\n`;

    await fs.mkdir(path.dirname(weeklyLogPath), { recursive: true });
    await fs.appendFile(weeklyLogPath, logEntry, 'utf8');
    await indexWithQMD(basePath, weeklyLogPath);
    return weeklyLogPath;
}

export async function updateProjectMemory(basePath, sessionData) {
    const projectMemoryPath = getProjectMemoryPath(basePath, sessionData.repo);
    const filesTouched = sessionData.filesCreated?.length
        ? sessionData.filesCreated.map(file => `- ${file}`).join('\n')
        : '- Aucun';

    const body = [
        `# Project Memory: ${sessionData.repo}`,
        '',
        `Updated: ${new Date().toISOString()}`,
        `CLI: ${sessionData.cli || 'auto'}`,
        `Model: ${sessionData.model || 'auto'}`,
        `Status: ${sessionData.success ? 'success' : 'failed'}`,
        `Attempts: ${sessionData.attempts ?? 1}`,
        '',
        '## Latest Request',
        sessionData.prompt || 'N/A',
        '',
        '## Latest Summary',
        sessionData.summary || 'N/A',
        '',
        '## Latest Files',
        filesTouched,
        '',
        '## Latest Tests',
        sessionData.testResult || 'Non exÃ©cutÃ©s',
        '',
        '## Notes',
        sessionData.notes || 'Aucune'
    ].join('\n');

    await fs.mkdir(path.dirname(projectMemoryPath), { recursive: true });
    await fs.writeFile(projectMemoryPath, `${body}\n`, 'utf8');
    await indexWithQMD(basePath, projectMemoryPath);
    return projectMemoryPath;
}

// Extraire un snippet pertinent autour des termes recherchés
function extractSnippet(content, terms, contextSize = 150) {
    const contentLower = content.toLowerCase();
    let bestStart = 0;
    let bestScore = 0;
    
    for (const term of terms) {
        const index = contentLower.indexOf(term);
        if (index !== -1) {
            // Compter les occurrences dans le contexte
            const start = Math.max(0, index - contextSize);
            const end = Math.min(content.length, index + contextSize);
            const context = contentLower.slice(start, end);
            const score = terms.reduce((acc, t) => acc + (context.match(new RegExp(t, 'g')) || []).length, 0);
            
            if (score > bestScore) {
                bestScore = score;
                bestStart = start;
            }
        }
    }
    
    const snippet = content.slice(bestStart, bestStart + 400);
    return (bestStart > 0 ? '...' : '') + snippet + (bestStart + 400 < content.length ? '...' : '');
}

/**
 * Sauvegarder un événement dans le Daily Log
 * Format append-only: chaque événement est ajouté à la fin du fichier du jour
 */
export async function appendToDailyLog(basePath, sessionName, event) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    const dailyLogPath = path.join(memoryPath, `${date}.md`);
    
    const logEntry = `## [${timestamp}] ${sessionName}\n${event}\n\n`;
    
    try {
        await fs.mkdir(memoryPath, { recursive: true });
        await fs.appendFile(dailyLogPath, logEntry, 'utf8');
        console.log(`[Memory] Daily log: ${dailyLogPath}`);
        const weeklyPath = await appendToWeeklyLog(basePath, sessionName, event);
        console.log(`[Memory] Weekly log: ${weeklyPath}`);
        
        // Indexer avec QMD si disponible
        await indexWithQMD(basePath, dailyLogPath);
    } catch (err) {
        console.error('[Memory] Erreur d\'écriture du daily log:', err);
    }
}

export async function appendFallbackTrace(basePath, sessionName, trace) {
    const timestamp = new Date().toISOString();
    const event = [
        `Fallback CLI [${timestamp}]`,
        `- cli: ${trace.cli}`,
        `- status: ${trace.status}`,
        `- reason: ${trace.reason}`,
        `- durationMs: ${trace.durationMs}`,
        `- exitCode: ${trace.exitCode ?? 'n/a'}`,
        `- timedOut: ${trace.timedOut ? 'yes' : 'no'}`,
        `- message: ${trace.message || 'n/a'}`
    ].join('\n');

    await appendToDailyLog(basePath, sessionName, event);
}

// Indexer un fichier avec QMD
async function indexWithQMD(basePath, filePath) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const qmdPath = path.join(process.cwd(), 'libs', 'qmd', 'dist', 'cli', 'qmd.js');
    
    const env = {
        ...process.env,
        XDG_CONFIG_HOME: path.join(memoryPath, 'xdg-config'),
        XDG_CACHE_HOME: path.join(memoryPath, 'xdg-cache')
    };
    
    try {
        // QMD indexe automatiquement les fichiers Markdown dans le répertoire MEMORY
        // On force un reindex si nécessaire
        await execa('bun', [qmdPath, 'index'], {
            cwd: basePath,
            env,
            timeout: 15000,
            reject: false
        });
        console.log('[Memory] QMD index mis à jour');
    } catch (err) {
        // QMD peut échouer silencieusement
    }
}

/**
 * Sauvegarder le résumé complet d'une session
 * Structure inspirée d'OpenClaw avec frontmatter et contenu structuré
 */
export async function saveSessionSummary(basePath, sessionData) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const sessionsPath = path.join(memoryPath, 'sessions');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${timestamp}-${sanitizeRepoName(sessionData.repo)}.md`;
    const filePath = path.join(sessionsPath, filename);
    
    // Frontmatter structuré
    const frontmatter = {
        date: new Date().toISOString(),
        repo: sessionData.repo,
        cli: sessionData.cli || 'auto',
        model: sessionData.model || 'auto',
        success: sessionData.success,
        attempts: sessionData.attempts,
        filesCreated: sessionData.filesCreated?.length || 0,
        tags: sessionData.tags || []
    };
    
    let fmString = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
        if (Array.isArray(value)) {
            fmString += `${key}: [${value.join(', ')}]\n`;
        } else {
            fmString += `${key}: ${value}\n`;
        }
    }
    fmString += '---\n\n';
    
    // Contenu structuré
    const content = `# Session: ${sessionData.repo}\n\n` +
        `## 📋 Requête Utilisateur\n${sessionData.prompt}\n\n` +
        `## 🤖 Réponse IA\n${sessionData.summary || 'Non disponible'}\n\n` +
        `## 📁 Fichiers Créés/Modifiés\n${sessionData.filesCreated?.map(f => `- ${f}`).join('\n') || 'Aucun'}\n\n` +
        `## ⚡ Tests\n${sessionData.testResult || 'Non exécutés'}\n\n` +
        `## 📝 Notes\n${sessionData.notes || 'Aucune'}\n`;
    
    try {
        await fs.mkdir(sessionsPath, { recursive: true });
        await fs.writeFile(filePath, fmString + content, 'utf8');
        console.log(`[Memory] Session sauvée: ${filePath}`);
        
        // Ajouter aussi au daily log
        await appendToDailyLog(basePath, sessionData.repo, 
            `Session ${sessionData.success ? '✅' : '❌'} - ${sessionData.prompt.slice(0, 100)}`);
        
        await updateProjectMemory(basePath, sessionData);

        // Indexer avec QMD
        await indexWithQMD(basePath, filePath);
        
        return { success: true, path: filePath };
    } catch (err) {
        console.error('[Memory] Erreur de sauvegarde:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Générer un résumé automatique à partir du code généré
 */
export async function generateSummary(code, prompt) {
    const lines = code.split('\n').length;
    return `Code généré pour: "${prompt}". ${lines} lignes de code produites.`;
}

/**
 * Charger l'historique des sessions d'un repo
 */
export async function loadSessionHistory(basePath, repoName) {
    const memoryPath = path.join(basePath, 'MEMORY');
    const sessionsPath = path.join(memoryPath, 'sessions');
    
    try {
        const files = await fs.readdir(sessionsPath, { withFileTypes: true });
        const repoFiles = files
            .filter(f => f.isFile() && f.name.endsWith('.md') && f.name.includes(repoName.replace(/[^a-zA-Z0-9-_]/g, '_')))
            .map(f => f.name)
            .sort()
            .reverse(); // Plus récent en premier
        
        const sessions = [];
        for (const filename of repoFiles.slice(0, 10)) { // 10 dernières sessions
            try {
                const filePath = path.join(sessionsPath, filename);
                const content = await fs.readFile(filePath, 'utf8');
                sessions.push({ filename, content });
            } catch (err) {
                // Ignorer
            }
        }
        
        return sessions;
    } catch (err) {
        console.error('[Memory] Erreur de chargement de l\'historique:', err);
        return [];
    }
}

/**
 * Commande /save - Sauvegarde manuelle de la session actuelle
 */
export async function manualSave(basePath, session) {
    if (!session.activeRepo) {
        return { success: false, error: 'Aucun projet actif' };
    }
    
    const sessionData = {
        repo: session.activeRepo,
        cli: session.defaultCli || 'auto',
        model: session.defaultModel || 'auto',
        prompt: session.lastPrompt || 'Session manuelle',
        summary: session.lastSummary || 'Sauvegarde manuelle',
        filesCreated: session.lastFiles || [],
        testResult: session.lastTestResult || 'Non exécutés',
        success: true,
        attempts: 1,
        tags: ['manual-save'],
        notes: session.saveNotes || ''
    };
    
    return await saveSessionSummary(basePath, sessionData);
}
