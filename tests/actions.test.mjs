import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { applyCodeToFiles, executeAndTest } from '../utils/actions.js';

const tmpRoot = path.join(process.cwd(), 'tmp_test_actions');

export async function run() {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(tmpRoot, { recursive: true });

    const fileOutput = '### FILE: src/demo.js\n```js\nexport const n = 1;\n```';
    const written = await applyCodeToFiles(fileOutput, tmpRoot);
    assert.ok(written.includes('src/demo.js'));

    const patchOutput = '### PATCH: src/demo.js\n<<<<\nexport const n = 1;\n====\nexport const n = 2;\n>>>>';
    await applyCodeToFiles(patchOutput, tmpRoot);
    const content = await fs.readFile(path.join(tmpRoot, 'src', 'demo.js'), 'utf8');
    assert.match(content, /n = 2/);

    const traversal = '### FILE: ..\\evil.txt\n```txt\nbad\n```';
    await assert.rejects(() => applyCodeToFiles(traversal, tmpRoot));

    const result = await executeAndTest('no run marker', tmpRoot);
    assert.equal(result.success, true);
    assert.match(result.message, /Aucun test spécifié/i);
}

