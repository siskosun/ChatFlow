// Build with esbuild 0.25.x, React 18.3.x and React DOM 18.3.x.
// This prototype is separate from the browser extension; it adds no runtime dependency to ChatFlow.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root=path.dirname(fileURLToPath(import.meta.url))
const {build}=await import(process.env.PROTOTYPE_NODE_MODULES?path.join(process.env.PROTOTYPE_NODE_MODULES,'esbuild/lib/main.js'):'esbuild')
const result=await build({entryPoints:[path.join(root,'prototype.tsx')],bundle:true,minify:true,jsx:'automatic',write:false,outfile:'prototype.js',loader:{'.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},nodePaths:process.env.PROTOTYPE_NODE_MODULES?[process.env.PROTOTYPE_NODE_MODULES]:[],target:'es2022'})
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script')
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
await writeFile(path.join(root,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatFlow 0.3 界面原型</title><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>')
console.log('Built standalone index.html')
