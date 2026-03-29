export const RECOVERABLE_REASONS = Object.freeze([
    'rate_limit',
    'quota_limit',
    'token_limit',
    'auth_error',
    'network_error',
    'timeout',
    'cli_unavailable',
    'spawn_error'
]);

export function classifyFailureReason(output = '', exitCode = null, timedOut = false) {
    if (timedOut) return 'timeout';

    const text = String(output || '').toLowerCase();

    if (text.includes('rate limit') || text.includes('too many requests') || text.includes('429')) {
        return 'rate_limit';
    }

    if (text.includes('quota') || text.includes('credit') || text.includes('billing')) {
        return 'quota_limit';
    }

    if (text.includes('token limit') || text.includes('context length') || text.includes('max tokens')) {
        return 'token_limit';
    }

    if (
        text.includes('unauthorized') ||
        text.includes('forbidden') ||
        text.includes('authentication') ||
        text.includes('invalid api key')
    ) {
        return 'auth_error';
    }

    if (
        text.includes('network') ||
        text.includes('econnrefused') ||
        text.includes('enotfound') ||
        text.includes('socket hang up')
    ) {
        return 'network_error';
    }

    if (text.includes('spawn') || text.includes('enoent') || text.includes('not recognized as an internal')) {
        return 'cli_unavailable';
    }

    if (exitCode !== null && exitCode !== 0) {
        return 'non_zero_exit';
    }

    return 'empty_output';
}

export function isRecoverableReason(reason) {
    return RECOVERABLE_REASONS.includes(reason);
}

export function assessExecutionResult(result) {
    const stdout = result.stdout?.trim() || '';
    const stderr = result.stderr?.trim() || '';
    const combinedOutput = `${stdout}\n${stderr}`.trim();
    const reason = classifyFailureReason(combinedOutput, result.exitCode, Boolean(result.timedOut));
    const failed = result.failed || result.exitCode !== 0 || !stdout || isRecoverableReason(reason);

    return {
        failed,
        reason,
        recoverable: isRecoverableReason(reason),
        detail: combinedOutput || 'Aucune sortie'
    };
}

export function buildCliExecutionPlan(configList, {
    defaultCli = null,
    disabledClis = [],
    strictCli = false,
    preferredOrder = []
} = {}) {
    const filtered = configList.filter(agent => !disabledClis.includes(agent.cmd));

    if (!filtered.length) {
        return [];
    }

    if (strictCli) {
        if (!defaultCli || disabledClis.includes(defaultCli)) {
            return [];
        }
        const forced = filtered.find(agent => agent.cmd === defaultCli);
        return forced ? [forced] : [];
    }

    let ordered = [...filtered];
    if (Array.isArray(preferredOrder) && preferredOrder.length) {
        const prioritized = [];
        const seen = new Set();
        for (const cliName of preferredOrder) {
            const found = ordered.find(agent => agent.cmd === cliName);
            if (found && !seen.has(found.cmd)) {
                prioritized.push(found);
                seen.add(found.cmd);
            }
        }
        const remaining = ordered.filter(agent => !seen.has(agent.cmd));
        ordered = [...prioritized, ...remaining];
    }

    if (defaultCli && !disabledClis.includes(defaultCli)) {
        const defaultIdx = ordered.findIndex(agent => agent.cmd === defaultCli);
        if (defaultIdx > 0) {
            const [preferred] = ordered.splice(defaultIdx, 1);
            ordered.unshift(preferred);
        }
    }

    return ordered;
}

export function createFailureTrace(cli, failure, result, durationMs) {
    return {
        cli,
        status: 'failed',
        reason: failure.reason,
        durationMs,
        exitCode: result.exitCode,
        timedOut: Boolean(result.timedOut),
        recoverable: failure.recoverable,
        message: failure.detail.slice(0, 500)
    };
}

export function createSuccessTrace(cli, result, durationMs) {
    return {
        cli,
        status: 'success',
        reason: 'ok',
        durationMs,
        exitCode: result.exitCode,
        timedOut: false,
        recoverable: false,
        message: `Output length: ${result.stdout?.length || 0}`
    };
}

export function createExceptionTrace(cli, error, durationMs) {
    const reason = classifyFailureReason(error.message || '', null, false);
    return {
        cli,
        status: 'failed',
        reason: reason === 'empty_output' ? 'spawn_error' : reason,
        durationMs,
        exitCode: null,
        timedOut: false,
        recoverable: true,
        message: error.message?.slice(0, 500) || 'Unknown error'
    };
}
