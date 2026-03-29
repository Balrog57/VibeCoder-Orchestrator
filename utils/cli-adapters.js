import { execa } from 'execa';
import {
    CLI_CONFIG,
    checkCliAvailable,
    getAvailableModels,
    getFormattedArgs
} from './cli-detector.js';
import { assessExecutionResult } from './fallback-policy.js';

function buildCapabilityMap(cliName) {
    return {
        supportsResume: () => cliName === 'claude',
        supportsRemote: () => cliName === 'claude',
        supportsStreaming: () => false
    };
}

export function getCliAdapter(cliName) {
    const config = CLI_CONFIG[cliName];
    if (!config) return null;

    const capabilities = buildCapabilityMap(cliName);

    return {
        name: cliName,
        tier: config.tier,
        description: config.description,
        detect: async () => checkCliAvailable(cliName),
        listModels: async () => getAvailableModels(cliName),
        prepareExecution: ({ prompt, model = null }) => getFormattedArgs(cliName, model, prompt),
        classifyFailure: (result) => assessExecutionResult(result),
        async execute({ cwd = process.cwd(), prompt, model = null, timeoutMs = 120000 } = {}) {
            const formatted = getFormattedArgs(cliName, model, prompt);

            const result = await execa(cliName, formatted.args, {
                cwd,
                stdin: formatted.input ? 'pipe' : 'ignore',
                input: formatted.input,
                stdout: 'pipe',
                stderr: 'pipe',
                timeout: timeoutMs,
                shell: process.platform === 'win32',
                windowsHide: true,
                reject: false,
                stripFinalNewline: true
            });

            return {
                result,
                failure: assessExecutionResult(result)
            };
        },
        ...capabilities
    };
}

export function buildCliAdapters(cliNames = Object.keys(CLI_CONFIG)) {
    return cliNames
        .map(name => getCliAdapter(name))
        .filter(Boolean);
}
