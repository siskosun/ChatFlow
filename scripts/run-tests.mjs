import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
if(!files.length)throw Error('NO_TESTS_DISCOVERED');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
