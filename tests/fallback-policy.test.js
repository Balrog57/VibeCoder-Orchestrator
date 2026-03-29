import { describe, expect, it } from 'vitest';
import {
    assessExecutionResult,
    buildCliExecutionPlan,
    classifyFailureReason,
    createExceptionTrace,
    createFailureTrace,
    createSuccessTrace,
    isRecoverableReason
} from '../utils/fallback-policy.js';

describe('fallback policy', () => {
    it('orders candidates with preferred CLI first and disabled CLIs removed', () => {
        const plan = buildCliExecutionPlan(
            [{ cmd: 'qwen' }, { cmd: 'claude' }, { cmd: 'gemini' }],
            { defaultCli: 'claude', disabledClis: ['gemini'] }
        );

        expect(plan.map(item => item.cmd)).toEqual(['claude', 'qwen']);
    });

    it('can lock execution to a single explicit CLI', () => {
        const plan = buildCliExecutionPlan(
            [{ cmd: 'qwen' }, { cmd: 'claude' }, { cmd: 'gemini' }],
            { defaultCli: 'claude', strictCli: true }
        );

        expect(plan.map(item => item.cmd)).toEqual(['claude']);
    });

    it('detects recoverable failure reasons', () => {
        expect(classifyFailureReason('socket hang up', 1, false)).toBe('network_error');
        expect(classifyFailureReason('spawn ENOENT', null, false)).toBe('cli_unavailable');
        expect(isRecoverableReason('rate_limit')).toBe(true);
        expect(isRecoverableReason('non_zero_exit')).toBe(false);
    });

    it('assesses execution output and creates stable trace payloads', () => {
        const result = {
            stdout: '',
            stderr: '429 too many requests',
            exitCode: 1,
            failed: true,
            timedOut: false
        };

        const failure = assessExecutionResult(result);
        expect(failure).toMatchObject({
            failed: true,
            reason: 'rate_limit',
            recoverable: true
        });

        expect(createFailureTrace('claude', failure, result, 123)).toMatchObject({
            cli: 'claude',
            status: 'failed',
            reason: 'rate_limit',
            durationMs: 123
        });

        expect(createSuccessTrace('qwen', { stdout: 'hello', exitCode: 0 }, 88)).toMatchObject({
            cli: 'qwen',
            status: 'success',
            reason: 'ok'
        });

        expect(createExceptionTrace('codex', new Error('spawn ENOENT'), 42)).toMatchObject({
            cli: 'codex',
            status: 'failed',
            reason: 'cli_unavailable',
            durationMs: 42
        });
    });
});
