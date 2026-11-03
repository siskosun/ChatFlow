import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Stage } from './vendor/stageshow/kit/stage'
import { Window, Text } from './vendor/stageshow/kit/window'
import { Row } from './vendor/stageshow/kit/parts/Row'
import { Badge } from './vendor/stageshow/kit/controls/Badge'
import StaticCard from './vendor/stageshow/examples/static-card'
import './prototype.css'

const SCREENS = { home: '首页', capture: '首次保存', saved: '保存完成', handoff: '继续对话', prepared: '接续已准备', task: '交出任务', copied: '任务已复制', result: '回传结果', returned: '结果已保存', backup: '备份等待' }
type Screen = keyof typeof SCREENS
const params = new URLSearchParams(location.search)
function Action({ children, onClick, secondary=false, disabled=false }: { children: React.ReactNode; onClick?:()=>void; secondary?:boolean; disabled?:boolean }) {
  return <button type="button" className={secondary?'cf-button cf-secondary':'cf-button cf-primary'} onClick={onClick} disabled={disabled}>{children}</button>
}
function Source({editable=false}: {editable?:boolean}) {
  return <div className="cf-source"><span className="cf-label">来源对话</span><div className="cf-source-line"><Text>春季活动方案</Text><span className="cf-source-id">3fa210</span>{editable&&<button className="cf-text-button">更换</button>}</div></div>
}
function Product({screen,setScreen}: {screen:Screen;setScreen:(s:Screen)=>void}) {
  const result = screen==='result'||screen==='returned'
  const task = screen==='task'||screen==='copied'||result
  const saved = screen==='saved'
  return <>
    <div className="cf-top"><Text className="cf-brand">ChatFlow</Text><nav aria-label="工作区导航"><button className="cf-text-button" onClick={()=>setScreen('backup')}>我的档案</button><button className="cf-text-button" onClick={()=>setScreen('backup')}>高级功能</button></nav></div>
    <div className={'cf-main'+(screen==='home'?' cf-home':'')}>
      {screen==='home'?<>
        <div className="cf-title">继续手上的工作</div>
        <div className="cf-choices">
          <button className="cf-choice" onClick={()=>setScreen('capture')}><strong>继续对话</strong><span>保存历史和文件</span><span className="cf-choice-action">保存并继续 →</span></button>
          <button className="cf-choice" onClick={()=>setScreen('task')}><strong>任务回传</strong><span>交出任务，带回结果</span><span className="cf-choice-action">交出任务或回传 →</span></button>
        </div>
        <div className="cf-home-history"><span className="cf-section-label">最近保存</span><Row pad={12} title={<Text>春季活动方案</Text>} subtitle={<Text>今天 14:20 · 24 条消息</Text>}><button className="cf-text-button" onClick={()=>setScreen('saved')}>继续 →</button></Row><Row pad={12} title={<Text>网站改版讨论</Text>} subtitle={<Text>昨天 · 18 条消息</Text>}><button className="cf-text-button" onClick={()=>setScreen('saved')}>继续 →</button></Row></div>
      </>:<>
        <button className="cf-back" onClick={()=>setScreen('home')}>‹ 首页</button>
        <div className="cf-heading"><div className="cf-title">{task?'任务回传':screen==='backup'?'备份对话':screen==='handoff'||screen==='prepared'?'继续到新对话':saved?'对话已保存':'保存这段对话'}</div>{saved&&<Badge tone="success">已保存到浏览器</Badge>}</div>
        {task&&<div className="cf-modes"><button aria-pressed={!result} onClick={()=>setScreen('task')}>交出任务</button><button aria-pressed={result} onClick={()=>setScreen('result')}>回传结果</button></div>}
        <div className="cf-panel">
          {(screen==='capture'||saved)&&<>
            <Source editable={!saved}/>
            {saved?<>
              <div className="cf-stats"><strong>24 条消息</strong><span>3 个文件已保存</span></div>
              <div className="cf-file-list"><Row pad={12} title={<Text>活动方案.pdf</Text>} meta={<Text>2.4 MB</Text>}/><Row pad={12} title={<Text>预算明细.xlsx</Text>} meta={<Text>128 KB</Text>}/><Row pad={12} title={<Text>素材包.zip</Text>} meta={<Text>8.1 MB</Text>}/></div>
              <Action onClick={()=>setScreen('handoff')}>继续到新对话</Action>
              <div className="cf-secondary-row"><Action secondary onClick={()=>setScreen('capture')}>重新采集</Action><Action secondary onClick={()=>setScreen('backup')}>下载备份</Action></div>
            </>:<>
              <div className="cf-field-group"><label className="cf-label" htmlFor="files">文件范围</label><select id="files"><option>全部文件</option><option>最后生成的文件</option></select></div>
              <Action onClick={()=>setScreen('saved')}>保存对话</Action>
            </>}
          </>}
          {(screen==='handoff'||screen==='prepared')&&<>
            <Source/>
            {screen==='handoff'?<>
              <div className="cf-field-group"><label className="cf-label" htmlFor="instructions">接下来做什么？<span className="cf-input-note">可选</span></label><textarea id="instructions" rows={4} placeholder="例如：继续检查方案的成本和风险。"/></div>
              <div className="cf-caption">将准备对话历史和 3 个已保存文件</div>
              <Action onClick={()=>setScreen('prepared')}>准备历史与文件</Action>
            </>:<>
              <div className="cf-success">接续文件已准备</div>
              <div className="cf-file-list"><Row pad={12} title={<Text>对话历史</Text>} meta={<Text>24 条消息</Text>}/><Row pad={12} title={<Text>附件</Text>} meta={<Text>3 个文件</Text>}/></div>
              <Action>打开新对话</Action><span className="cf-caption cf-centered">上传后核对，再自行发送</span>
            </>}
          </>}
          {(screen==='task'||screen==='copied')&&<>
            <Source editable/>
            <div className="cf-field-group"><label className="cf-label" htmlFor="task-body">要交给 Agent 的任务</label><textarea id="task-body" rows={4} defaultValue="核对活动预算的计算公式，列出需要修改的地方。"/></div>
            {screen==='copied'?<><div className="cf-success">任务已复制</div><div className="cf-caption">粘贴给 Agent；完成后回到这里。</div><Action onClick={()=>setScreen('result')}>回传结果</Action><button className="cf-text-button cf-centered">再次复制任务</button></>:<Action onClick={()=>setScreen('copied')}>复制任务</Action>}
          </>}
          {result&&<>
            <div className="cf-field-group cf-first"><label className="cf-label" htmlFor="result-body">Agent 的结果</label><textarea id="result-body" rows={4} defaultValue={'[ChatFlow 任务 CF-DEMO]\n检查完成：预算公式一致；建议补充两项费用假设。'}/><span className="cf-input-note">示例结果 · 内容完整保留</span></div>
            <div className="cf-match"><div className="cf-success">来源已匹配</div><Source/><p>核对活动预算的计算公式</p></div>
            {screen==='returned'?<><div className="cf-success">结果已保存到浏览器</div><Action onClick={()=>setScreen('home')}>复制结果并返回原对话</Action><span className="cf-caption cf-centered">返回后自行粘贴并发送</span></>:<Action onClick={()=>setScreen('returned')}>保存结果</Action>}
          </>}
          {screen==='backup'&&<>
            <Source/>
            <div className="cf-stats"><strong>2 / 3 个文件已保存</strong><span>1 个正在下载</span></div>
            <div className="cf-file-list"><Row pad={12} title={<Text>活动方案.pdf</Text>} meta={<Text>已保存</Text>}/><Row pad={12} title={<Text>预算明细.xlsx</Text>} meta={<Text>已保存</Text>}/><Row pad={12} title={<Text>素材包.zip</Text>} meta={<Text>下载中</Text>}/></div>
            <div className="cf-progress" role="progressbar" aria-valuenow={67} aria-valuemin={0} aria-valuemax={100}><span/></div>
            <Action disabled>下载完成后可备份</Action>
            <span className="cf-caption cf-centered">请保留此页面</span>
          </>}
        </div>
        <div className="cf-below">{saved?<button className="cf-text-button" onClick={()=>setScreen('backup')}>查看全部档案 →</button>:screen==='capture'?<button className="cf-text-button">更多设置</button>:task&&screen!=='returned'?<div><span className="cf-section-label">最近的任务</span><Row pad={12} title={<Text>检查页面在窄屏下的布局</Text>} meta={<Text>待回传</Text>}/></div>:<button className="cf-text-button" onClick={()=>setScreen('saved')}>返回档案</button>}</div>
      </>}
    </div>
  </>
}
function Demo() {
  const [screen,setScreen]=useState<Screen>((params.get('screen') as Screen)||'saved')
  const [dark,setDark]=useState(params.get('dark')==='1')
  if(params.get('gold'))return <div className="gold"><StaticCard/></div>
  return <div className="prototype" data-dark={dark}>
    <header className="prototype-toolbar"><div><strong>ChatFlow 0.3</strong><span>交互原型 · 合成数据</span></div><button onClick={()=>setDark(!dark)}>{dark?'切换浅色':'切换暗色'}</button></header>
    <nav className="prototype-screens" aria-label="选择原型画面">{Object.entries(SCREENS).map(([s,label])=><button key={s} aria-pressed={screen===s} onClick={()=>setScreen(s as Screen)}>{label}</button>)}</nav>
    <main id="example"><Stage width={960} height={730} compact={{below:600,width:358,height:780}} theme={dark?'dark':'light'} fidelity="realistic" className="cf-stage">{(_,__,layout)=>layout==='compact'?<div className="cf-compact-content"><Product screen={screen} setScreen={setScreen}/></div>:<Window url="ChatFlow · 本地工作区" urlShape="pill" className="cf-window"><Product screen={screen} setScreen={setScreen}/></Window>}</Stage></main>
    <p className="prototype-note">仅用于对照布局与按钮。保存、复制、返回、下载均为演示，不操作真实数据。</p>
  </div>
}
createRoot(document.getElementById('root')!).render(<Demo/>);
