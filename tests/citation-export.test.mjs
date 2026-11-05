import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync(new URL('../src/tl-core.js',import.meta.url),'utf8'),{filename:'tl-core.js'});
const C=globalThis.TLCore,bt=String.fromCharCode(96);
const cite=id=>'\uE200cite\uE202'+id+'\uE201';
function fixture(text,refs,role='assistant',options={}){
 const message={id:'message-reference',author:{role},content:{parts:[text]},metadata:{content_references:refs,unrelated:'UNRELATED_METADATA_NOT_ARCHIVED'},status:'finished_successfully'};
 return C.normalizeConversation({conversation_id:'citation_fixture_123',title:'Source citation fixture',current_node:'node-reference',mapping:{'node-reference':{parent:null,children:[],message}}},'https://chatgpt.com/c/citation_fixture_123',options);
}
const codes=snapshot=>snapshot.integrity.issues.map(x=>x.code);
const reference=(marker,url='https://example.com/report',title='Source')=>({matched_text:marker,items:[{title,url}]});
test('explicit citations export as source links while raw text and message anchors remain unchanged',()=>{
 const marker=cite('turn0search0'),raw='结论 '+marker+'。',snapshot=fixture(raw,[reference(marker,'https://example.com/%2fReport?x=%2B&token=PRIVATE_SECRET','官方 [报告]')]),message=snapshot.messages[0];
 assert.equal(message.text,raw);assert.equal(message.id,'message-reference');assert.equal(message.nodeId,'node-reference');
 assert.deepEqual(message.sourceReferences,[{marker,links:[{title:'官方 [报告]',url:'https://example.com/%2fReport?x=%2B'}]}]);
 assert.equal(C.exportMessageText(message),'结论 ([官方 \\[报告\\]](<https://example.com/%2fReport?x=%2B>))。');
 assert.ok(C.history(snapshot).includes(C.exportMessageText(message)));
 assert.equal(JSON.stringify(snapshot).includes('PRIVATE_SECRET'),false);
 assert.equal(JSON.stringify(snapshot).includes('UNRELATED_METADATA_NOT_ARCHIVED'),false);
 assert.equal(snapshot.integrity.state,'valid');
});
test('unknown references remain literal and carry a diagnostic instead of guessed sources',()=>{
 const known=cite('turn0search0'),unknown=cite('turn0search1'),snapshot=fixture(known+' '+unknown,[reference(known)]),message=snapshot.messages[0];
 assert.ok(C.exportMessageText(message).includes(unknown));assert.ok(codes(snapshot).includes('UNRESOLVED_CONTENT_REFERENCE'));
 assert.equal(message.sourceReferences.length,1);assert.equal(message.sourceReferences[0].marker,known);
 const absent=fixture(unknown,undefined);assert.equal(C.exportMessageText(absent.messages[0]),unknown);assert.ok(codes(absent).includes('UNRESOLVED_CONTENT_REFERENCE'));
});
test('user text and metadata cannot become assistant citations',()=>{
 const marker=cite('turn0search0'),snapshot=fixture(marker,[reference(marker)],'user'),message=snapshot.messages[0];
 assert.equal(message.sourceReferences,undefined);assert.equal(C.exportMessageText(message),marker);assert.equal(snapshot.integrity.state,'valid');
});
test('fenced, inline, multiline inline and indented code retain literal reference examples',()=>{
 const marker=cite('turn0search0'),code=[bt+'inline '+marker+bt,bt.repeat(2)+'multi\nline '+marker+bt.repeat(2),bt+'cross-indent\n    '+marker+'\nend'+bt,bt.repeat(4)+'js\n'+marker+'\n'+bt.repeat(3)+'\n'+bt.repeat(4),'~~~text\n'+marker+'\n~~~','    '+marker,'> '+bt.repeat(3)+'text\n> '+marker+'\n> '+bt.repeat(3)].join('\n\n');
 const raw='Visible '+marker+'\n\n'+code,snapshot=fixture(raw,[reference(marker)]),rendered=C.exportMessageText(snapshot.messages[0]);
 assert.equal(snapshot.messages[0].text,raw);
 assert.equal(rendered,'Visible ([Source](<https://example.com/report>))\n\n'+code);
 const codeOnly=fixture(code,[reference(marker)]);assert.equal(codeOnly.messages[0].sourceReferences,undefined);assert.equal(codeOnly.integrity.state,'valid');
});
test('an unclosed fenced code block is preserved through end of message',()=>{
 const marker=cite('turn0search0'),raw=bt.repeat(3)+'js\n'+marker,snapshot=fixture(raw,[reference(marker)]);
 assert.equal(C.exportMessageText(snapshot.messages[0]),raw);assert.equal(snapshot.messages[0].sourceReferences,undefined);assert.equal(snapshot.integrity.state,'valid');
});
test('unsafe source URLs never become links or silently leave a partial citation list',()=>{
 const marker=cite('turn0search0');
 for(const url of ['javascript:alert(1)','data:text/html,unsafe','https://user:password@example.com/private','https://example.com:8000/private','https://example.com/a\nb','https://example.com/\\unsafe']){
  const snapshot=fixture(marker,[{matched_text:marker,items:[{title:'safe',url:'https://example.com/good'},{title:'unsafe',url}]}]);
  assert.equal(C.exportMessageText(snapshot.messages[0]),marker);assert.equal(snapshot.messages[0].sourceReferences,undefined);
  assert.ok(codes(snapshot).includes('UNSAFE_CONTENT_REFERENCE_URL'),url);
 }
});
test('duplicate metadata is deduplicated, conflicting mappings keep the raw marker',()=>{
 const marker=cite('turn0search0'),r=reference(marker),duplicate=fixture(marker,[r,{...r}]);
 assert.equal(duplicate.messages[0].sourceReferences.length,1);assert.equal(duplicate.messages[0].sourceReferences[0].links.length,1);assert.equal(duplicate.integrity.state,'valid');
 const conflict=fixture(marker,[r,reference(marker,'https://other.example.com/report')]);
 assert.equal(conflict.messages[0].sourceReferences,undefined);assert.equal(C.exportMessageText(conflict.messages[0]),marker);
 assert.ok(codes(conflict).includes('CONTENT_REFERENCE_CONFLICT'));
});
test('supported websites and fallback sources remain bound to their exact marker',()=>{
 const first=cite('turn0search0'),second=cite('turn0search1'),snapshot=fixture(first+' '+second,[
  {matched_text:first,items:[{url:'https://example.com/a',title:'A',supporting_websites:[{url:'https://example.com/b',title:'B'},{url:'https://example.com/a',title:'A duplicate'}]}]},
  {matched_text:second,fallback_items:[{url:'http://example.com/c',title:'C'}]},
 ]);
 assert.deepEqual(snapshot.messages[0].sourceReferences.map(x=>x.links.map(l=>l.url)),[['https://example.com/a','https://example.com/b'],['http://example.com/c']]);
 assert.equal(snapshot.integrity.state,'valid');
});
test('only exact citation markers are rewritten; ordinary prose metadata is ignored',()=>{
 const marker=cite('turn0search0'),other=cite('turn0search00'),snapshot=fixture('Claim '+marker+' '+other,[reference(marker),reference('Claim','https://unrelated.example.com')]);
 const rendered=C.exportMessageText(snapshot.messages[0]);assert.ok(rendered.startsWith('Claim '));assert.ok(rendered.includes(other));assert.equal(rendered.includes('unrelated'),false);
});
test('GenUI citations and JSX Cite markers use only the same-message explicit source binding',()=>{
 const genui='\uE200genui\uE202{"citation":{"refs":["turn0search0"]}}\uE201',jsx='<Cite refs={["turn0search1"]} />',snapshot=fixture(genui+' '+jsx,[reference(genui),reference(jsx,'https://example.com/second')]);
 assert.equal(snapshot.messages[0].sourceReferences.length,2);assert.equal(snapshot.integrity.state,'valid');
 assert.ok(C.exportMessageText(snapshot.messages[0]).includes('https://example.com/second'));
});
test('unknown widgets and hidden references preserve literal text without exporting hidden metadata',()=>{
 const marker='\uE200genui\uE202{"charts_widget_v2":{}}\uE201',hidden=cite('turn0search0'),snapshot=fixture(marker+' '+hidden,[reference(marker),{...reference(hidden,'https://hidden.example.com'),type:'hidden'}]);
 assert.equal(C.exportMessageText(snapshot.messages[0]),marker+' '+hidden);assert.equal(snapshot.messages[0].sourceReferences,undefined);
 assert.equal(JSON.stringify(snapshot).includes('hidden.example.com'),false);assert.ok(codes(snapshot).includes('UNRESOLVED_CONTENT_REFERENCE'));
});
test('signed URL markers keep their delimiter after scrubbing and never retain the secret',()=>{
 const raw='\uE200url\uE202Report\uE202https://example.com/a?x=%2B&sig=PRIVATE_SIGNATURE\uE201',snapshot=fixture(raw,[reference(raw,'https://example.com/a?x=%2B&sig=PRIVATE_SIGNATURE','Report')]);
 const message=snapshot.messages[0];assert.equal(message.text,'\uE200url\uE202Report\uE202https://example.com/a?x=%2B\uE201');
 assert.equal(message.sourceReferences[0].marker,message.text);assert.equal(JSON.stringify(snapshot).includes('PRIVATE_SIGNATURE'),false);
 assert.equal(C.exportMessageText(message),'([Report](<https://example.com/a?x=%2B>))');
});
test('restore may suppress new diagnostics while retaining and reprojecting minimal references',()=>{
 const marker=cite('turn0search0'),unknown=cite('turn0search1'),first=fixture(marker,[reference(marker)]),message=first.messages[0];
 const projected=fixture(message.text,message.sourceReferences.map(r=>({matched_text:r.marker,items:r.links})),'assistant',{referenceDiagnostics:false});
 assert.deepEqual(projected.messages[0].sourceReferences,message.sourceReferences);assert.equal(C.exportMessageText(projected.messages[0]),C.exportMessageText(message));
 const legacy=fixture(unknown,undefined,'assistant',{referenceDiagnostics:false});assert.equal(legacy.integrity.state,'valid');assert.equal(C.exportMessageText(legacy.messages[0]),unknown);
});
test('over-budget reference metadata stays visible and records that it could not be projected',()=>{
 const marker=cite('turn0search0'),snapshot=fixture(marker,Array.from({length:C.SOURCE_REFERENCE_LIMITS.references+1},()=>reference(marker)));
 assert.equal(C.exportMessageText(snapshot.messages[0]),marker);assert.equal(snapshot.messages[0].sourceReferences,undefined);assert.ok(codes(snapshot).includes('CONTENT_REFERENCE_LIMIT'));
});
