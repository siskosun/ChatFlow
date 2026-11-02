import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['tl-core.js','tl-provider.js'])vm.runInThisContext(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
const P=globalThis.ChatFlowProviders;
test('only the explicitly supported ChatGPT provider is registered',()=>{
 assert.deepEqual(P.registered(),['chatgpt']);
 assert.equal(P.forUrl('https://chatgpt.com/c/abc12345').id,'chatgpt');
 assert.equal(P.forUrl('https://chat.openai.com/c/abc12345').id,'chatgpt');
 assert.equal(P.forUrl('https://claude.ai/'),null);
 assert.equal(P.forUrl('https://gemini.google.com/'),null);
 assert.throws(()=>P.identify('https://claude.ai/'),/UNSUPPORTED_PROVIDER/);
});
test('ChatGPT adapter preserves normal-chat and target-page identity checks',()=>{
 const source=P.identify('https://chatgpt.com/c/abc12345');
 assert.equal(source.provider,'chatgpt');assert.equal(source.identity.conversationId,'abc12345');
 assert.equal(P.identify('https://chatgpt.com/',{target:true}).identity.conversationId,null);
 assert.throws(()=>P.identify('https://chatgpt.com/g/g-p-12345678'),/NO_CONVERSATION_ID/);
 assert.throws(()=>P.identify('https://chatgpt.com/?temporary-chat=true',{target:true}),/NOT_NEW_NORMAL_CHAT/);
});
test('read endpoint adapter allows only same-origin read routes for the selected conversation',()=>{
 const adapter=P.get('chatgpt'),source={origin:'https://chatgpt.com',conversationId:'abc12345'};
 assert.equal(adapter.readEndpoint('/api/auth/session',source).pathname,'/api/auth/session');
 assert.equal(adapter.readEndpoint('/backend-api/conversation/abc12345',source).pathname,'/backend-api/conversation/abc12345');
 assert.equal(adapter.readEndpoint('/backend-api/conversation/abc12345/files',source).origin,source.origin);
 assert.throws(()=>adapter.readEndpoint('/backend-api/conversation/other12345',source),/UNSUPPORTED_READ_ENDPOINT/);
 assert.throws(()=>adapter.readEndpoint('https://evil.example/backend-api/conversation/abc12345',source),/CROSS_ORIGIN_AUTH_REQUEST_REJECTED/);
 assert.throws(()=>adapter.readEndpoint('/backend-api/conversation/abc12345','bad'),/INVALID_PROVIDER_SOURCE/);
});
test('capabilities do not overclaim upload or model-read confirmation',()=>{
 const caps=P.capabilityMatrix()[0].capabilities;
 assert.equal(caps.manualSendOnly,true);
 assert.equal(caps.uploadConfirmation,'page_observation_only');
 assert.equal(caps.modelReadConfirmation,false);
 assert.equal(caps.supported,true);
});
