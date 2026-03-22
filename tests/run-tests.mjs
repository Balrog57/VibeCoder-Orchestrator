import { run as runI18n } from './i18n.test.mjs';
import { run as runActions } from './actions.test.mjs';
import { run as runMemory } from './memory.test.mjs';
import { run as runAccessibility } from './accessibility.test.mjs';

const cases = [
    ['i18n', runI18n],
    ['actions', runActions],
    ['memory', runMemory],
    ['accessibility', runAccessibility]
];

let failed = 0;
for (const [name, fn] of cases) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`FAIL ${name}: ${err?.message || err}`);
    }
}

if (failed) {
    console.error(`SUMMARY: ${cases.length - failed}/${cases.length} passed`);
    process.exit(1);
}

console.log(`SUMMARY: ${cases.length}/${cases.length} passed`);
