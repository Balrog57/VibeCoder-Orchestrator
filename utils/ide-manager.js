import path from 'path';
import { execa } from 'execa';
import { spawn } from 'child_process';

const IDE_CONFIG = {
    cursor: {
        command: 'cursor',
        checkCmd: ['--version'],
        openArgs: (repoPath) => [repoPath],
        priority: 1
    },
    vscode: {
        command: 'code',
        checkCmd: ['--version'],
        openArgs: (repoPath) => [repoPath],
        priority: 2
    },
    windsurf: {
        command: 'windsurf',
        checkCmd: ['--version'],
        openArgs: (repoPath) => [repoPath],
        priority: 3
    },
    webstorm: {
        command: 'webstorm64.exe',
        checkCmd: ['--help'],
        openArgs: (repoPath) => [repoPath],
        priority: 4
    },
    idea: {
        command: 'idea64.exe',
        checkCmd: ['--help'],
        openArgs: (repoPath) => [repoPath],
        priority: 5
    },
    pycharm: {
        command: 'pycharm64.exe',
        checkCmd: ['--help'],
        openArgs: (repoPath) => [repoPath],
        priority: 6
    },
    visualstudio: {
        command: 'devenv.exe',
        checkCmd: ['/?'],
        openArgs: (repoPath) => [repoPath],
        priority: 7
    }
};

export async function scanAvailableIdes() {
    const results = [];

    for (const [name, config] of Object.entries(IDE_CONFIG)) {
        const available = await isCommandAvailable(config.command, config.checkCmd);
        if (available) {
            results.push({ name, command: config.command, priority: config.priority });
        }
    }

    results.sort((a, b) => a.priority - b.priority);
    return results;
}

async function isCommandAvailable(command, checkCmd) {
    try {
        // Attempt direct execution first (works when command is on PATH).
        const direct = await execa(command, checkCmd, {
            timeout: 5000,
            reject: false,
            windowsHide: true
        });
        if (direct.exitCode === 0) return true;
    } catch (err) {
        // Ignore and fallback to where.exe check below.
    }

    try {
        const whereCheck = await execa('where.exe', [command], {
            timeout: 5000,
            reject: false,
            windowsHide: true
        });
        return whereCheck.exitCode === 0 && Boolean(whereCheck.stdout.trim());
    } catch (err) {
        return false;
    }
}

export function launchIdeForRepo(repoPath, options = {}) {
    const { preferredIde = null, fallbackOrder = [], disabledIdes = [] } = options;
    const normalizedRepoPath = path.resolve(repoPath);

    const allCandidates = fallbackOrder.filter((ideName) => IDE_CONFIG[ideName] && !disabledIdes.includes(ideName));
    if (allCandidates.length === 0) {
        throw new Error('Aucun IDE disponible (ou tous désactivés).');
    }

    const ordered = [...allCandidates];
    if (preferredIde && !disabledIdes.includes(preferredIde)) {
        const idx = ordered.indexOf(preferredIde);
        if (idx > 0) {
            ordered.splice(idx, 1);
            ordered.unshift(preferredIde);
        }
    }

    let lastError = null;
    for (const ideName of ordered) {
        const config = IDE_CONFIG[ideName];
        if (!config) continue;

        try {
            const args = config.openArgs(normalizedRepoPath);
            const child = spawn(config.command, args, {
                cwd: normalizedRepoPath,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();

            return { ide: ideName, command: config.command };
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`Impossible de lancer un IDE. Dernière erreur: ${lastError?.message || 'inconnue'}`);
}

