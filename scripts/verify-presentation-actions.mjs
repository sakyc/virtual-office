// Isolated browser fixtures only. No database, provider, WhatsApp or real session.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
const output=mkdtempSync(resolve('output/presentation-browser-'));
const template={id:'11111111-2222-3333-4444-555555555555',name:'Carousel presentasi',description:'Template untuk presentasi',version:1,outputFormat:'Carousel',divisionIds:['social-id'],fields:[{name:'topik',label:'Topik',type:'text',required:true},{name:'platform',label:'Platform',type:'multi',options:['Instagram','Facebook','TikTok','LinkedIn'],default:['Instagram']}],instructions:'Susun carousel dari fakta pengguna'};
const options={canCreate:true,templates:[template,{...template,id:'general',name:'Template umum',divisionIds:[]}],builtins:[{...template,id:'social-builtin',name:'Bawaan social',divisionIds:[],divisionTemplateIds:['social']},{...template,id:'ads-builtin',name:'Bawaan ads',divisionIds:[],divisionTemplateIds:['ads']}],divisions:[{id:'social-id',name:'Social Media',templateId:'social'},{id:'ads-id',name:'Ads',templateId:'ads'}],agents:[{id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',name:'Rina',role:'Penulis konten',divisionId:'social-id'},{id:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',name:'Adit',role:'Ads writer',divisionId:'ads-id'}],clients:[],models:[{id:'fixture-model',label:'Model fixture',costLabel:'Hemat'}]};
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-dev-runtime']},server:{port:5191,host:'127.0.0.1',hmr:false},plugins:[{name:'presentation-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(!req.url.startsWith('/__qa/')&&!req.url.startsWith('/dashboard/jobs'))return next();
  const content=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="chatting"><div id="panel"><header class="panel-head"><div class="who"><strong>Rina · Penulis konten</strong><span>Kantor demo presentasi</span></div></header><div class="jobs" id="fixture"></div></div><script type="module">
  import React from 'react';import {createRoot} from 'react-dom/client';import {WorkspaceTaskComposer} from '/src/react/workspace-task-composer.jsx';import {TemplateLibrary} from '/src/react/task-templates.jsx';import '/src/style.css';import '/src/board.css';import '/src/office-readability.css';
  const options=${JSON.stringify(options)};window.submissions=[];window.deny=false;window.cancelled=false;
  const api={taskOptions:async()=>options,createWorkspaceJob:async(body)=>{window.submissions.push(body);await new Promise(r=>setTimeout(r,80));if(window.deny)throw Error('Akses AI demo sedang dinonaktifkan. Hubungi admin.');return {jobId:45};}};
  const root=createRoot(document.getElementById('fixture'));
  if(location.pathname==='/__qa/templates'){document.body.className='';document.getElementById('panel').style.cssText='position:static;transform:none;opacity:1;pointer-events:auto;width:auto;height:auto;margin:20px';root.render(React.createElement(TemplateLibrary,{data:{templates:options.templates,builtins:[],canManage:true},tab:'custom',search:'',onTab(){},onSearch(){},onCreate(){},onInspect(){},onCopy(){},onEdit(){},onArchive(){}}));}
  else root.render(React.createElement(WorkspaceTaskComposer,{api,embedded:true,initialTemplate:new URLSearchParams(location.search).get('template')||'',onCancel(){window.cancelled=true;root.render(React.createElement('p',null,'Form ditutup'));},onCreated(id){window.created=id;}}));
  </script></body></html>`;
  res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,content));
});}}]});
await server.listen();const base=server.resolvedUrls.local[0].replace(/\/$/,'');
let browser,socket;const delay=ms=>new Promise(r=>setTimeout(r,ms));const errors=[];
try{
  const executable=process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';assert(existsSync(executable));
  browser=spawn(executable,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${join(output,'browser')}`,'--no-first-run','--no-default-browser-check','--hide-scrollbars'],{windowsHide:true,stdio:'ignore'});
  const file=join(output,'browser','DevToolsActivePort');for(let i=0;i<100&&!existsSync(file);i++)await delay(100);
  const port=readFileSync(file,'utf8').split('\n')[0],target=await fetch(`http://127.0.0.1:${port}/json/new`,{method:'PUT'}).then(r=>r.json());socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r);socket.addEventListener('error',j);});
  let seq=0;const tasks=new Map();socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const t=tasks.get(m.id);tasks.delete(m.id);m.error?t.reject(m.error):t.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;tasks.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);};
  const fill=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()`);
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/__qa/templates'});await wait('!!document.querySelector(".tt-use-template")');await evaluate('document.querySelector(".tt-use-template").click();true');
  await wait('!!document.querySelector(".work-task-inline select")');assert.equal(await evaluate('document.querySelectorAll("select")[1].value'),template.id);
  assert.equal(await evaluate('document.querySelectorAll("select")[1].textContent.includes("Bawaan ads")'),false);
  assert.equal(await evaluate('document.querySelector(".task-multi-summary").textContent'),'1 dipilih: Instagram');
  await evaluate('for(const e of document.querySelectorAll(".task-multi input:not(:checked)"))e.click();true');
  assert.equal(await evaluate('document.querySelectorAll(".task-multi input:checked").length'),4);
  await evaluate('document.querySelector(".task-multi input").click();true');
  assert.equal(await evaluate('document.querySelectorAll(".task-multi input:checked").length'),3);
  await evaluate('document.querySelector(".task-multi input").click();true');
  await fill('input[maxlength="150"]','Carousel promosi');await fill('.task-inputs input','Kopi lokal');await fill('label:last-of-type select','fixture-model');
  await evaluate('window.deny=true;document.querySelector(".btnp").click();true');await wait('document.body.textContent.includes("Akses AI demo sedang dinonaktifkan")');
  assert.equal(await evaluate('document.querySelector("input[maxlength=\\"150\\"]").value'),'Carousel promosi');
  await evaluate('window.deny=false;document.querySelector(".btnp").click();document.querySelector(".btnp").click();true');await wait('window.created===45');assert.equal(await evaluate('window.submissions.length'),2);
  assert.equal(await evaluate('window.submissions.at(-1).templateId'),template.id);assert.equal(await evaluate('window.submissions.at(-1).values.topik'),'Kopi lokal');
  assert.deepEqual((await evaluate('window.submissions.at(-1).values.platform')).sort(),['Facebook','Instagram','LinkedIn','TikTok']);
  const style=await evaluate('(()=>{const b=document.querySelector(".btnp"),s=getComputedStyle(b),label=getComputedStyle(document.querySelector("label"));return {height:b.getBoundingClientRect().height,font:s.fontSize,label:label.fontSize,background:s.backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth}})()');assert(style.height>=44);assert.equal(style.font,'15px');assert.equal(style.label,'15px');assert(!style.overflow);
  writeFileSync(join(output,'office-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await evaluate('document.querySelector(".task-multi").scrollIntoView({block:"center"});true');
  assert.equal(await evaluate('document.querySelectorAll(".task-multi .is-selected").length'),4);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".task-multi input")).width'),'20px');
  writeFileSync(join(output,'platform-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate('document.querySelector(".work-actions").scrollIntoView();true');writeFileSync(join(output,'office-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await fill('select',options.agents[1].id);
  assert.equal(await evaluate('document.querySelectorAll("select")[1].value'),'');
  assert.equal(await evaluate('document.querySelectorAll("select")[1].textContent.includes("Carousel presentasi")'),false);
  assert.equal(await evaluate('document.querySelectorAll("select")[1].textContent.includes("Bawaan ads")'),true);
  assert.equal(await evaluate('document.querySelectorAll("select")[1].textContent.includes("Template umum")'),true);
  await evaluate('document.querySelector(".btns").click();true');await wait('window.cancelled===true');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['template-to-task','template-prefilled','multi-select-four-without-ctrl','AI-off-error-preserves-input','submit-double-click-guard','styled-readable-buttons','desktop-mobile-no-overflow','division-filter-and-agent-switch','cancel'],screenshots:output,providerCalls:0,databaseConnections:0}));
}finally{socket?.close();browser?.kill();await server.close();}
