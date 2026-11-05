/* Build-time dependency/order and syntax contract, not a general type checker. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const manifest=JSON.parse(read('manifest.json'));
const build=read('build.py');
const list=build.match(/RUNTIME_FILES\s*=\s*\[([\s\S]*?)\]/)?.[1];
assert.ok(list,'Explicit runtime allowlist is required');
const runtime=[...list.matchAll(/"([^"]+\.js)"/g)].map(x=>x[1]);
const requirements={
 'src/tl-provider.js':['src/tl-core.js'],
 'src/tl-page-scope.js':['src/tl-core.js'],
 'src/tl-evidence.js':['src/tl-core.js'],
 'src/tl-headings.js':['src/tl-core.js'],
 'src/tl-passages.js':['src/tl-core.js'],
 'src/tl-store.js':['src/tl-core.js','src/tl-passages.js','src/tl-evidence.js'],
 'src/tl-capture.js':['src/tl-core.js','src/tl-provider.js','src/tl-page-scope.js'],
 'src/tl-inject.js':['src/tl-core.js','src/tl-provider.js','src/tl-evidence.js'],
 'src/tl-tasks.js':['src/tl-core.js'],
 'src/tl-task-store.js':['src/tl-store.js','src/tl-tasks.js'],
 'src/tl-task-service.js':['src/tl-core.js','src/tl-tasks.js','src/tl-task-store.js'],
 'src/tl-archive.js':['src/tl-core.js','src/tl-store.js','src/tl-passages.js','src/tl-evidence.js'],
 'src/tl-context.js':['src/tl-core.js','src/tl-passages.js'],
 'src/experiment-service.js':['src/experiment-core.js','src/experiment-db.js'],
 'src/tl-service.js':['src/tl-core.js','src/tl-provider.js','src/tl-store.js','src/tl-task-service.js','src/experiment-service.js','src/tl-diagnostics.js'],
 'src/tl-tools-page.js':['src/tl-core.js','src/tl-provider.js','src/tl-page-scope.js','src/toolkit-port.js','src/tl-navigation.js','src/tl-headings.js'],
 'workspace/app.js':['src/tl-core.js','src/tl-store.js','src/tl-archive.js','src/tl-context.js','src/tl-evidence.js','src/tl-diagnostics.js'],
 'workspace/flow.js':['workspace/app.js','src/tl-task-store.js','src/tl-diagnostics.js'],
 'workspace/experiments.js':['src/experiment-core.js','src/experiment-db.js']
};
function checkOrder(name,files){
 const seen=new Set();
 for(const file of files){
  assert.ok(fs.existsSync(file),`${name}: missing ${file}`);
  for(const dependency of requirements[file]||[])assert.ok(seen.has(dependency),`${name}: ${file} before ${dependency}`);
  new vm.Script(read(file),{filename:file});seen.add(file);
 }
 return files.length;
}
const worker=manifest.background.service_worker;
const imports=read(worker).match(/importScripts\(([^)]+)\)/)?.[1];
assert.ok(imports,'Worker must declare its actual dependency graph');
const workerFiles=[...imports.matchAll(/['"]([^'"]+)['"]/g)].map(x=>path.posix.join(path.posix.dirname(worker),x[1]));
checkOrder('worker',[...workerFiles,worker]);
for(const [i,script]of manifest.content_scripts.entries())checkOrder(`content-${i}`,script.js);
for(const html of ['workspace/index.html','workspace/experiments.html']){
 const files=[...read(html).matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(x=>path.posix.normalize(path.posix.join('workspace',x[1])));
 checkOrder(html,files);
}
const tools=[...read('src/tl-task-service.js').matchAll(/files:\s*\[([^\]]+)\]/g)].map(m=>[...m[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map(x=>x[1])).find(xs=>xs.includes('src/tl-tools-page.js'));
assert.ok(tools,'Explicit optional-tools load order required');checkOrder('optional tools',tools);
// The on-demand task-source path also runs on tabs predating extension install.
const taskSourceScripts=[...read('src/tl-task-service.js').matchAll(/files:\s*\[([^\]]+)\]/g)]
 .map(m=>[...m[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map(x=>x[1]))
 .find(xs=>xs.includes('src/tl-page-scope.js')&&!xs.includes('src/tl-tools-page.js'));
assert.ok(taskSourceScripts,'Task source injection list is required');
checkOrder('task source scope',taskSourceScripts);
for(const file of [...runtime,...workerFiles,...tools])assert.ok(runtime.includes(file),`${file} omitted from package`);
assert.ok(!JSON.stringify(manifest.permissions).includes('<all_urls>'));
assert.ok(!JSON.stringify(manifest.host_permissions).includes('<all_urls>'));
for(const file of runtime)new vm.Script(read(file),{filename:file});
console.log(`RUNTIME_CONTRACT_OK: ${runtime.length} packaged modules; worker, page and workspace order checked`);
