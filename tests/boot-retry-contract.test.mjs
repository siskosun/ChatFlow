import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const service=fs.readFileSync(new URL('../src/tl-service.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../workspace/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../workspace/index.html',import.meta.url),'utf8');
test('no silent retry: only trusted workspace can explicitly reinitialize worker',()=>{
 assert.match(service,/function startBoot\(\)/);
 assert.match(service,/if\(msg\.type==='tl:retryBoot'\)\{workspace\(sender\);return retryBoot\(\);\}/);
 assert.match(ui,/await call\('tl:retryBoot'\)/);
 assert.match(html,/id="retry-workspace"[^>]*hidden/);
});
