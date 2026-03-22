import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { initMemory, appendToDailyLog, appendFallbackTrace, queryMemory } from '../utils/memory.js';

const basePath = path.join(process.cwd(), 'tmp_test_memory');

export async function run() {
    await fs.rm(basePath, { recursive: true, force: true });
    await initMemory(basePath);
    await appendToDailyLog(basePath, 'repo-test', 'memory smoke event');

    const memoryDir = path.join(basePath, 'MEMORY');
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });
    const daily = entries.find(e => e.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(e.name));
    assert.ok(daily, 'daily log missing');

    const weeklyDir = path.join(memoryDir, 'weekly');
    const weeklyFiles = await fs.readdir(weeklyDir);
    assert.ok(weeklyFiles.some(n => /^\d{4}-W\d{2}\.md$/.test(n)), 'weekly log missing');

    await appendFallbackTrace(basePath, 'repo-test', {
        cli: 'codex',
        status: 'failed',
        reason: 'timeout',
        durationMs: 1234,
        exitCode: 124,
        timedOut: true,
        message: 'trace test'
    });

    const [weeklyName] = await fs.readdir(weeklyDir);
    const content = await fs.readFile(path.join(weeklyDir, weeklyName), 'utf8');
    assert.match(content, /Fallback CLI/);
    assert.match(content, /reason: timeout/);

    const memoryContext = await queryMemory(basePath, 'trace test');
    assert.ok(typeof memoryContext === 'string');
}

