// Optional artwork tool. Requires Playwright + Chrome; never connects to Habitica's API.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.GAMIFY_RENDER_NODE_MODULES ? path.join(process.env.GAMIFY_RENDER_NODE_MODULES, '_renderer.cjs') : import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = fs.readFileSync(path.join(root, 'dist/gamify-for-siyuan/index.js'), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  // Only public artwork is allowed; no API or account requests can leave this page.
  await page.route('**/*', route => route.request().url().startsWith('https://habitica-assets.s3.amazonaws.com/mobileApp/images/') ? route.continue() : route.abort());
  for (const [kind, title, subtitle] of [
    ['companion', '在笔记旁查看角色', 'YOUR HABITICA CHARACTER, AT A GLANCE'],
    ['complete', '勾选 TODO，进度即时呈现', 'COMPLETE A TASK. SEE YOUR PROGRESS.'],
    ['reward', '领取奖励，金币跃入角色卡', 'EARN REWARDS. WATCH THE GOLD FLY.'],
  ]) {
    const light = kind === 'complete';
    await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:${light ? '#f0edf8' : '#15131f'};color:${light ? '#292438' : '#eeeaf7'};font:14px/1.7 'Segoe UI','Microsoft YaHei',sans-serif}
      body:before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 80% 25%,#aa87f51b,transparent 60%);pointer-events:none}
      .heading{position:absolute;left:68px;top:34px}.label{font-size:11px;letter-spacing:3px;color:${light ? '#72549e' : '#bba2eb'}}h1{font-size:32px;font-weight:650;letter-spacing:1px;margin:10px 0 5px}.sub{font-size:10px;letter-spacing:2px;opacity:.5}
      .frame{position:absolute;left:52px;right:52px;top:190px;bottom:44px;border:1px solid ${light ? '#30204319' : '#ffffff12'};border-radius:17px;background:${light ? '#fcfbfe' : '#1b1925'};box-shadow:0 18px 70px #0002;overflow:hidden}
      .toolbar{height:44px;border-bottom:1px solid ${light ? '#3020430e' : '#ffffff09'};padding:12px 22px;font-size:11px;color:${light ? '#756d84' : '#82798f'};letter-spacing:1px}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#a28db9;margin-right:6px;opacity:.45}.crumb{margin-left:24px}
      .rail{position:absolute;left:0;top:44px;bottom:0;width:48px;border-right:1px solid #8f7aa212;text-align:center;padding-top:20px;color:#9c8db3;font-size:19px;line-height:3}
      .note{position:absolute;left:145px;top:270px;width:570px}.date{color:#978aa8;font-size:11px;letter-spacing:2px}.note h2{font-size:27px;font-weight:600;margin:12px 0 6px}.intro{color:#978da5;font-size:13px;margin:0 0 28px}.todo{height:62px;display:flex;align-items:center;gap:15px;border-bottom:1px solid #978aa812;font-size:16px}.box{width:17px;height:17px;border:1.5px solid #9b8bb0;border-radius:4px;display:grid;place-items:center;font-size:12px;line-height:1}.done .box{background:#a8e8c9;color:#315843;border-color:#a8e8c9}.done .task{opacity:.45;text-decoration:line-through}.tag{font-size:10px;color:#b39acb;letter-spacing:1px;margin-top:27px}
      .dock{position:absolute;right:64px;bottom:68px;color:#a38acb;width:20px;height:24px}.dock svg{width:20px;height:24px}.caption{position:absolute;left:70px;bottom:16px;font-size:9px;letter-spacing:1px;opacity:.4}
    </style><div class="heading"><div class="label">GAMIFY for SiYuan</div><h1>${title}</h1><div class="sub">${subtitle}</div></div>
    <div class="frame"><div class="toolbar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="crumb">SiYuan / 我的笔记 / 今天</span></div><div class="rail">☰<br>▤<br>⌕</div></div>
    <main class="note"><span class="date">TODAY / 今日计划</span><h2>把想做的事，一件件完成</h2><p class="intro">阅读、记录，以及留给自己的时间。</p>
      <div class="todo done"><span class="box">✓</span><span class="task">读完一章书，记下一个想法</span></div>
      <div class="todo" data-node-id="showcase-todo"><span class="box protyle-action--task"></span><span class="task">整理今天的阅读笔记</span></div>
      <div class="todo"><span class="box"></span><span class="task">给明天留一份清晰的计划</span></div><div class="tag">TODO → HABITICA</div></main><div class="dock" data-type="gamify-for-siyuancompanion"></div><div class="caption">界面示例 · DEMONSTRATION</div></html>`);
    await page.evaluate(({bundle, light}) => {
      const lib = new Function('require', 'module', bundle + '\nreturn {GamifyView,PLUGIN_CSS,HABITICA_ICON};')(() => ({Plugin:class{}}), {exports:{}});
      const state = { target:12, credits:Array.from({length:6},(_,i)=>({id:String(i)})), pending:{}, rewards:[],total:8 };
      const user = { profile:{name:'冒险者'}, stats:{lvl:12,hp:46,maxHealth:50,gp:28.40,class:'warrior'}, preferences:{skin:'ddc994',size:'slim',shirt:'blue',hair:{base:1,bangs:1,color:'brown'}},items:{gear:{equipped:{armor:'armor_warrior_1',head:'head_warrior_1',weapon:'weapon_warrior_1',shield:'shield_warrior_1'}}} };
      const view = new lib.GamifyView({css:lib.PLUGIN_CSS,onConnect:async()=>{},onSound:()=>{},onRefresh:()=>{},onResolve:async()=>{}});
      view.host.dataset.theme=light?'light':'dark';view.update({state,user,status:'online',backlog:1190});view.open();
      view.root.querySelector('.card').style.cssText='right:100px;bottom:68px;transform:scale(.78);transform-origin:bottom right;max-height:none;';
      document.querySelector('.dock').innerHTML=lib.HABITICA_ICON;
      window.demo={view,state,user};
    }, {bundle,light});
    await page.waitForFunction(() => [...window.demo.view.root.querySelectorAll('.avatar img')].every(img=>img.complete), {timeout:20000});
    if (kind !== 'companion') {
      await page.evaluate(kind => {
        const {view,state,user}=window.demo;
        const el=document.querySelector('[data-node-id="showcase-todo"]');el.classList.add('done');el.querySelector('.box').textContent='✓';
        if(kind==='complete') {
          state.pending={demo:{since:Date.now()}};view.update({state,user,status:'online',backlog:1190});view.completeTodo({element:el,blockId:'showcase-todo',progress:7,target:12});
        } else {
          user.stats.gp+=.12;state.total++;state.credits=[];view.update({state,user,status:'online',backlog:1190});view.rewardFeedback(.12,{element:el,blockId:'showcase-todo'});
        }
      },kind);
      await page.waitForTimeout(kind === 'complete' ? 300 : 480);
      await page.evaluate(()=>{for(const a of document.getAnimations())a.pause();});
    }
    const index={companion:'01',complete:'02',reward:'03'}[kind];
    await page.screenshot({path:path.join(root,`images/${index}-${kind}.png`)});
    console.log(`Rendered ${kind}`);
  }
} finally { await browser.close(); }
