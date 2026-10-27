// Local-only visual and interaction check. All API/auth requests are mocked before the Vite proxy.
// Run: node --experimental-websocket scripts/verify-design-references.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';

const output = mkdtempSync(join(tmpdir(), 'virtual-office-design-qa-'));
const calls = [];
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true }, plugins: [{ name: 'mock-design-api', configureServer(app) {
  app.middlewares.use((req, res, next) => {
    if (!/^\/(api|auth)\//.test(req.url)) return next();
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { calls.push({ path: req.url, method: req.method, body }); res.setHeader('Content-Type', 'application/json'); res.statusCode = req.url === '/api/onboarding' ? 201 : 401; res.end(req.url === '/api/onboarding' ? '{}' : '{"error":"Mock unauthenticated session"}'); });
  });
} }] });
await server.listen();
const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(output,'browser')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars'], { windowsHide: true, stdio: 'ignore' });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let connection;
try {
  const portFile = join(output, 'browser', 'DevToolsActivePort');
  for (let i=0; i<100 && !existsSync(portFile); i++) await delay(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const target = await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' }).then((response) => response.json());
  connection = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { connection.addEventListener('open', done); connection.addEventListener('error', reject); });
  let sequence=0; const pending = new Map(); const errors=[];
  connection.addEventListener('message', ({ data }) => { const message=JSON.parse(data); if (message.id) { const item=pending.get(message.id); pending.delete(message.id); message.error ? item.reject(message.error) : item.resolve(message.result); } else if (message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || '')); });
  const send = (method, params={}) => new Promise((resolve,reject) => { const id=++sequence; pending.set(id,{resolve,reject}); connection.send(JSON.stringify({ id,method,params })); });
  const evaluate = async (expression) => { const value=await send('Runtime.evaluate',{ expression, returnByValue:true, awaitPromise:true }); if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description); return value.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  let viewportWidth = 1440;
  await send('Emulation.setDeviceMetricsOverride',{ width:viewportWidth,height:1100,deviceScaleFactor:1,mobile:false });
  await send('Emulation.setEmulatedMedia',{ features:[{ name:'prefers-color-scheme',value:'light' }] });
  const open = async (path) => {
    await send('Page.navigate',{url:`http://127.0.0.1:5186${path}`});
    for(let i=0;i<100;i++) { await delay(80); if(await evaluate('!!document.querySelector(".vo")')) break; }
    await evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]).then(()=>true)');
    await delay(3000);
  };
  const freeze = () => evaluate('document.getAnimations().forEach(a=>{a.pause(); try { a.currentTime=5000; } catch { a.currentTime=CSS.percent(100); }}); true');
  const snapshot = async (label) => {
    await freeze();
    const info=await evaluate(`({font:getComputedStyle(document.querySelector('.vo')).fontFamily,fontLoaded:document.fonts.check('800 18px "Plus Jakarta Sans"'),svg:document.querySelector('.vo').querySelectorAll('svg').length,width:document.querySelector('.vo').getBoundingClientRect().width,height:document.querySelector('.vo').getBoundingClientRect().height,headings:[...document.querySelectorAll('.vo h1,.vo h2')].map(e=>({text:e.textContent,rect:[e.getBoundingClientRect().x,e.getBoundingClientRect().y,e.getBoundingClientRect().width,e.getBoundingClientRect().height],font:getComputedStyle(e).fontSize})),controls:[...document.querySelectorAll('.vo button,.vo a')].map(e=>({text:e.textContent.trim(),rect:[e.getBoundingClientRect().x,e.getBoundingClientRect().y,e.getBoundingClientRect().width,e.getBoundingClientRect().height]}))})`);
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:viewportWidth,height:Math.ceil(info.height),scale:1}});
    writeFileSync(join(output,`${label}.png`), Buffer.from(image.data,'base64'));
    return info;
  };
  const report=[];
  const pages = [['landing','/landing-reference/Main.dc.html','/'],['onboarding','/onboarding-reference/Onboarding.dc.html','/onboarding'],['dashboard','/dashboard-reference/Dashboard.dc.html','/dashboard']];
  const scenarios = [
    ...pages.map((page)=>[...page,'desktop',1440]),
    ...pages.map((page)=>[...page,'dark',1440]),
    ...pages.map((page)=>[...page,'mobile',390]),
    ['onboarding','/onboarding-reference/Onboarding.dc.html','/onboarding','step2',1440],
    ['onboarding','/onboarding-reference/Onboarding.dc.html','/onboarding','step3',1440],
  ];
  for (const [name,reference,path,variant,width] of scenarios.filter((scenario) => !process.argv.includes('--quick') || scenario[3] === 'desktop')) {
    viewportWidth = width;
    await send('Emulation.setDeviceMetricsOverride',{ width,height:1100,deviceScaleFactor:1,mobile:false });
    const prepare = async (path) => {
      await open(path);
      if(variant==='dark') { await evaluate(`(()=>{const e=document.querySelector('[aria-label="Ganti mode tampilan"]') || [...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Mode gelap');e.click();return true;})()`); await delay(500); }
      if(variant==='step2'||variant==='step3') { await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Lanjut').click(); true`); if(variant==='step3')await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Lanjut').click(); true`); await delay(800); }
    };
    const label=`${name}-${variant}`;
    await prepare(reference); const before=await snapshot(`${label}-reference`);
    await prepare(path); const after=await snapshot(`${label}-react`);
    const visual=comparePng(join(output,`${label}-reference.png`),join(output,`${label}-react.png`));
    const headingDifferences=before.headings.map((heading,index)=>({before:heading,after:after.headings[index]})).filter(({before,after})=>JSON.stringify(before)!==JSON.stringify(after));
    report.push({ name:label,before,after,headingDifferences,visual });
    console.log(JSON.stringify({name:label,referenceHeight:before.height,reactHeight:after.height,svg:[before.svg,after.svg],fontLoaded:after.fontLoaded,headingDifferences,visual}));
  }
  viewportWidth=1440; await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await open('/onboarding');
  await evaluate(`document.querySelector('input').value=''; true`);
  // Input through the browser's native setter, allowing React to observe genuine input events.
  const fill = (placeholder,value) => evaluate(`(()=>{const e=[...document.querySelectorAll('input,textarea')].find(e=>e.placeholder===${JSON.stringify(placeholder)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`);
  const click = (text) => evaluate(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing control');e.click();return true})()`);
  await fill('mis. Studio Kreatif Nusantara','Design QA Organization'); await click('1–5 orang'); await click('Lanjut');
  await fill('mis. Tim Kreatif','Design QA Workspace'); await fill('Nama klien','Design QA Client'); await fill('Brand voice, produk, dan target audiens','Fixture brief'); await click('Lanjut');
  await click('Buka kantor'); await delay(300);
  const submission=calls.find(call=>call.path==='/api/onboarding'); assert.ok(submission,'Onboarding uses the existing API'); assert.equal(JSON.parse(submission.body).organizationName,'Design QA Organization'); assert.equal(JSON.parse(submission.body).teamSize,'1-5');
  await open('/dashboard'); await click('Buka kantor'); await delay(200); assert.equal(await evaluate('location.pathname'),'/dashboard/office');
  assert.deepEqual(errors,[],'No browser runtime errors');
  writeFileSync(join(output,'report.json'),JSON.stringify({report,errors,calls},null,2));
  for (const comparison of report) {
    assert.equal(comparison.visual.sizeMismatch,false,`${comparison.name}: matching document size`);
    assert.deepEqual(comparison.headingDifferences,[],`${comparison.name}: matching heading geometry and typography`);
    assert.equal(comparison.before.svg,comparison.after.svg,`${comparison.name}: matching SVGs`);
    assert.ok(comparison.after.fontLoaded,`${comparison.name}: original font loaded`);
    assert.ok(comparison.visual.changedPixelPercent < 0.5,`${comparison.name}: fewer than 0.5% different pixels`);
  }
  console.log(JSON.stringify({output,errors,mockedRequests:calls.length,onboarding:'PASS',officeNavigation:'PASS'}));
} finally { connection?.close(); browser.kill(); await server.close(); }

function comparePng(left,right) {
  const a=readPng(left),b=readPng(right); if(a.width!==b.width||a.height!==b.height)return {sizeMismatch:true};
  let changed=0,total=0; for(let i=0;i<a.pixels.length;i+=3){let max=0;for(let c=0;c<3;c++){const d=Math.abs(a.pixels[i+c]-b.pixels[i+c]);total+=d;max=Math.max(max,d);}if(max>8)changed++;}
  return {sizeMismatch:false,changedPixelPercent:Number((changed/(a.width*a.height)*100).toFixed(4)),meanChannelDifference:Number((total/a.pixels.length).toFixed(4))};
}
function readPng(file) {
  const input=readFileSync(file); let width,height,channels; const chunks=[];
  for(let pos=8;pos<input.length;){const size=input.readUInt32BE(pos),type=input.toString('ascii',pos+4,pos+8),data=input.subarray(pos+8,pos+8+size);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);channels=data[9]===6?4:3;}if(type==='IDAT')chunks.push(data);pos+=size+12;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,result=Buffer.alloc(height*stride),pixels=Buffer.alloc(width*height*3);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const pos=y*stride+x,a=x>=channels?result[pos-channels]:0,b=y?result[pos-stride]:0,c=y&&x>=channels?result[pos-stride-channels]:0;result[pos]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}for(let x=0;x<width;x++)for(let c=0;c<3;c++)pixels[(y*width+x)*3+c]=result[y*stride+x*channels+c];}
  return {width,height,pixels};
}
