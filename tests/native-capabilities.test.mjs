import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { readFile } from 'node:fs/promises';

async function module(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.txt': 'text' } });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const { createNativeCapabilities } = await module('src/adapters/xiaohongshu/capabilities.ts');
const { createAdapter } = await module('src/adapters/xiaohongshu/index.ts');
const { submitNativeMessage, nativeMessageForm } = await module('src/adapters/xiaohongshu/message-compose.ts');
const { mountRewind } = await module('src/rewind.ts');
const pause = ms => new Promise(r => setTimeout(r, ms));
const note = '<section class="note-container"><h1 id="detail-title">测试文章</h1><p id="detail-desc">测试正文</p><div class="author"><a class="name" href="/user/profile/writer">作者甲</a></div><div class="like-wrapper like-active"><svg><use href="#like_b"></use></svg><span class="count">12</span></div><button class="collect-wrapper" aria-pressed="false"><span class="count">4</span></button><div class="note-detail-follow-btn"><button>关注</button></div><div class="parent-comment"><article class="comment-item" id="comment-a"><div class="author"><a class="name">读者甲</a></div><div class="content">评论甲</div><button class="reply">回复</button><button class="like-wrapper" aria-pressed="true">赞</button></article><article class="comment-item" id="comment-b"><div class="author"><a class="name">读者乙</a></div><div class="content">评论乙</div><button class="reply">回复</button></article><button class="show-more">展开回复</button></div><div class="interaction-container"><p class="content-input" contenteditable="true"></p><div class="right-btn-area"><button class="submit">发送</button></div></div></section>';
function fixture(t, html = note, path = '/explore/example') {
  const win = new Window({ url: `https://www.xiaohongshu.com${path}`, settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => win.happyDOM.close());
  win.document.body.innerHTML = `<main id="app">${html}</main>`;
  return { win, doc: win.document, caps: createNativeCapabilities(win.document) };
}
test('native states come from real icons/aria, with note and comment actions scoped separately', t => {
  const f = fixture(t), controls = f.caps.read();
  assert.equal(controls.filter(c => c.kind === 'like').length, 2);
  assert.equal(controls.find(c => c.kind === 'like' && !c.group).active, false);
  assert.equal(controls.find(c => c.kind === 'like' && c.group === 'comment').active, true);
  assert.equal(controls.find(c => c.kind === 'collect').count, '4');
  assert.equal(controls.find(c => c.kind === 'reply').targetLabel, '读者甲');
  f.doc.querySelector('use').setAttribute('href','#unknown-icon');
  assert.equal(f.caps.read().find(c => c.kind === 'like' && !c.group).active, null);
});
for (const scenario of ['route', 'subject', 'removed', 'disabled', 'hidden', 'static']) test(`native controls reject ${scenario} changes before any click`, t => {
  const f = fixture(t), control = f.caps.read().find(c => c.kind === 'collect');
  const button = f.doc.querySelector('.collect-wrapper'); let clicks = 0; button.onclick = () => clicks++;
  if (scenario === 'route') f.win.history.pushState(null,'','/explore/other');
  if (scenario === 'subject') f.doc.querySelector('#detail-title').textContent = '另一篇';
  if (scenario === 'removed') button.remove();
  if (scenario === 'disabled') button.disabled = true;
  if (scenario === 'hidden') button.hidden = true;
  if (scenario === 'static') f.doc.body.insertAdjacentHTML('beforeend','<a href="#reference" data-reference-path="/explore/example"></a>');
  assert.equal(typeof f.caps.activate(control),'string'); assert.equal(clicks,0);
});
test('valid action clicks once and subsequent reads observe the native state', t => {
  const f = fixture(t); let clicks = 0; const button = f.doc.querySelector('.collect-wrapper');
  button.onclick = () => { clicks++; button.setAttribute('aria-pressed','true'); };
  assert.equal(f.caps.activate(f.caps.read().find(c => c.kind === 'collect')),null);
  assert.equal(clicks,1); assert.equal(f.caps.read().find(c => c.kind === 'collect').active,true);
});
test('feed likes remain attached to the exact source card and are absent from note details',t=>{
  const f=fixture(t,'<article class="note-item"><a class="title" href="/explore/one">条目</a><button class="like-wrapper" aria-pressed="false"><span class="count">8</span></button></article>','/explore');
  const adapter=createAdapter(f.doc), data=adapter.read(); assert.equal(data.controls[0].subject,data.entries[0].subject);
  let clicks=0;f.doc.querySelector('button').onclick=()=>clicks++;
  f.doc.querySelector('a').setAttribute('href','/explore/other'); assert.equal(typeof adapter.activateControl(data.controls[0]),'string'); assert.equal(clicks,0);
  f.win.history.pushState(null,'','/explore/one'); assert.equal(adapter.read().controls.length,0);
});
test('reply does not overwrite a native comment draft', t => {
  const f = fixture(t); f.doc.querySelector('.content-input').textContent = '尚未发送';
  const reply = f.caps.read().find(c => c.kind === 'reply'); let clicks = 0;
  f.doc.querySelector('.reply').onclick = () => clicks++;
  assert.equal(typeof f.caps.activate(reply),'string'); assert.equal(clicks,0);
});
test('profile tabs and search filters change section keys without inventing missing controls', t => {
  const f = fixture(t,'<section class="user-page"><span class="user-name">作者</span><div class="xhs-user-page-primary-tabs"><button class="reds-tab-item active">笔记</button><button class="reds-tab-item">收藏</button></div></section>','/user/profile/writer');
  const adapter = createAdapter(f.doc), before = adapter.read().sectionKey;
  const tabs = f.doc.querySelectorAll('.reds-tab-item'); tabs[0].classList.remove('active'); tabs[1].classList.add('active');
  assert.notEqual(adapter.read().sectionKey,before);
  f.win.history.pushState(null,'','/search_result?keyword=test');
  f.doc.querySelector('#app').innerHTML = '<div class="search-layout"><button class="filter">筛选</button><div class="ai-chat-filter"><button class="filter">不要读取</button></div></div><div class="filter-panel"><div class="filters"><span>排序</span><button class="tags active">综合</button><button class="tags">最新</button></div></div>';
  const result = adapter.read(); assert.equal(result.controls.filter(c => c.kind === 'filter-open').length,1);
  assert.equal(result.controls.filter(c => c.kind === 'filter').length,2); assert.equal(result.sectionKey,'排序:综合');
});
test('live list and room have dedicated models; chat readout is bounded and excludes nick duplication', t => {
  const f = fixture(t,'<article class="live-item"><a href="/livestream/room"><div class="title">直播测试</div></a></article>','/livelist');
  const adapter = createAdapter(f.doc); assert.equal(adapter.read().entries[0].kind,'live');
  f.win.history.pushState(null,'','/livestream/room');
  f.doc.querySelector('#app').innerHTML = '<span class="anchor-name">主播</span><video></video><div class="live-chat"><h2 class="intro-title">测试直播</h2>'+Array.from({length:90},(_,i)=>`<p class="msg-content"><span class="nickname">观众</span><span>发言${i}</span></p>`).join('')+'</div>';
  const room = adapter.read(); assert.equal(room.kind,'live'); assert.equal(room.video,true); assert.equal(room.liveMessages.length,80);
  assert.deepEqual(room.liveMessages[0],{author:'观众',text:'发言10'});
});
test('comment hierarchy records parent relationship without combining child body text', t => {
  const f = fixture(t), result = createAdapter(f.doc).read();
  assert.equal(result.comments[0].text,'评论甲'); assert.equal(result.comments[1].parentId,'comment-a');
});
test('social interaction UI observes actual source state while retaining the reading node', async t => {
  const f = fixture(t); const rewind = mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot;
  const copy = root.querySelector('.note-copy'); const native = f.doc.querySelector('.collect-wrapper'); let clicks = 0;
  native.onclick = () => { clicks++; native.setAttribute('aria-pressed','true'); };
  const button = [...root.querySelectorAll('.note-actions button')].find(b=>b.textContent==='收藏 4');
  assert.ok(button); button.click(); assert.equal(clicks,1); assert.equal(button.disabled,true);
  await pause(950); assert.equal(root.querySelector('.note-copy'),copy); assert.equal(button.textContent,'取消收藏 4'); assert.equal(button.disabled,false);
});
test('profile same-URL switching discards old entries and loads the selected collection', async t => {
  const f = fixture(t,'<section class="user-page"><span class="user-name">作者</span><div class="xhs-user-page-primary-tabs"><button class="reds-tab-item active">笔记</button><button class="reds-tab-item">收藏</button></div><article class="note-item"><a class="title" href="/explore/a">原作品</a></article></section>','/user/profile/writer');
  const tabs = f.doc.querySelectorAll('.reds-tab-item'); tabs[1].onclick = () => { tabs[0].classList.remove('active'); tabs[1].classList.add('active'); f.doc.querySelector('.note-item a').setAttribute('href','/explore/b'); f.doc.querySelector('.note-item a').textContent='收藏作品'; };
  const rewind = mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot;
  [...root.querySelectorAll('.native-actions button')].find(b=>b.textContent==='收藏').click(); await pause(1100);
  assert.equal(root.querySelector('[data-entry]').textContent,'收藏作品');
});

const messageHTML = '<section class="xhs-im-page"><div class="xhs-im-editor" contenteditable="true"></div><button>发送</button></section>';
for (const reason of ['recipient', 'changed during input', 'draft', 'disabled', 'ambiguous', 'static']) test(`message bridge blocks ${reason}`, async t => {
  const f = fixture(t,messageHTML,'/chat/one'), editor = f.doc.querySelector('.xhs-im-editor'), button=f.doc.querySelector('button'); let clicks=0,current=true;
  button.onclick = () => clicks++;
  if (reason==='recipient') current=false;
  if (reason==='changed during input') editor.oninput=()=>{current=false;};
  if (reason==='draft') editor.textContent='保留';
  if (reason==='disabled') button.disabled=true;
  if (reason==='ambiguous') button.after(button.cloneNode(true));
  if (reason==='static') f.doc.body.insertAdjacentHTML('beforeend','<a href="#reference" data-reference-path="/chat/one"></a>');
  assert.equal(typeof await submitNativeMessage(f.doc,'新消息',()=>current),'string'); assert.equal(clicks,0);
  if(reason==='draft') assert.equal(editor.textContent,'保留');
  if(reason==='ambiguous') assert.equal(nativeMessageForm(f.doc),null);
});
test('message bridge forwards an explicit local-fixture request once without claiming delivery',async t=>{
  const f=fixture(t,messageHTML,'/chat/one'); let clicks=0; f.doc.querySelector('button').onclick=()=>clicks++;
  assert.equal(await submitNativeMessage(f.doc,'测试😀',()=>true),null); assert.equal(clicks,1);
  assert.equal(typeof await submitNativeMessage(f.doc,'不可重复',()=>true),'string'); assert.equal(clicks,1);
});
for(const [name,path,kind] of [['provided-live-list-01','/livelist','list'],['20260927-live-room-01','/livestream/sample','live']]) test(`private offline ${kind} reference yields structural data only`,async t=>{
  let html;try{html=await readFile(`references/xiaohongshu/captures/${name}/page.html`,'utf8');}catch(e){if(e.code==='ENOENT'){t.skip('Private capture absent');return;}throw e;}
  const f=fixture(t,'',path);f.doc.body.innerHTML=html;const result=createAdapter(f.doc).read();
  assert.equal(result.kind,kind);
  if(kind==='list'){assert.equal(result.entries.length,27);assert.ok(result.entries.every(e=>e.kind==='live'));}
  else{assert.equal(result.video,true);assert.equal(Boolean(result.author),true);}
});

async function until(check, label, timeout = 2600) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await pause(25); }
  assert.fail(`Timed out: ${label}`);
}
function searchFixture(t) {
  return fixture(t, '<section class="search-layout"><button class="filter">筛选</button><div class="filter-panel" hidden><div class="filters"><span>排序</span><button class="tags active">综合</button><button class="tags">最新</button></div></div><div class="feeds-container"><article class="note-item"><a class="title" href="/explore/a">甲作品</a></article><article class="note-item"><a class="title" href="/explore/b">乙作品</a></article></div></section>', '/search_result?keyword=test');
}
test('search filter UI waits for asynchronous data and accepts reordered same-ID results', async t => {
  const f = searchFixture(t), nativePanel = f.doc.querySelector('.filter-panel');
  f.doc.querySelector('.filter').onclick = () => { nativePanel.hidden = false; };
  const rewind = mountRewind(f.doc, { initial: '2015', save(){} }); t.after(() => rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot;
  [...root.querySelectorAll('button')].find(b => b.textContent === '筛选').click();
  await until(() => [...root.querySelectorAll('button')].some(b => b.textContent === '最新'), 'filter controls appeared');
  const tags = f.doc.querySelectorAll('.tags');
  tags[1].onclick = () => { tags[0].classList.remove('active'); tags[1].classList.add('active'); };
  [...root.querySelectorAll('button')].find(b => b.textContent === '最新').click();
  await until(() => root.querySelector('.status')?.textContent.includes('所选内容'), 'pending filter status');
  await pause(650); // Exceed the 350ms stability window with the original rows still present.
  assert.match(root.querySelector('.status').textContent, /所选内容/);
  const feed = f.doc.querySelector('.feeds-container'); feed.prepend(feed.lastElementChild);
  await until(() => root.querySelector('[data-entry]')?.textContent === '乙作品', 'reordered rows committed');
  assert.equal(root.querySelectorAll('[data-entry]').length, 2);
  assert.equal([...root.querySelectorAll('button')].find(b => b.textContent === '最新').getAttribute('aria-pressed'), 'true');
});
test('changed result rows without the requested native selection do not commit', async t => {
  const f = searchFixture(t); f.doc.querySelector('.filter-panel').hidden = false;
  const rewind = mountRewind(f.doc, { initial: '2015', save(){} }); t.after(() => rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot;
  f.doc.querySelectorAll('.tags')[1].onclick = () => {
    const row = f.doc.querySelector('.note-item a'); row.href = '/explore/new'; row.textContent = '后台刷新作品';
  };
  [...root.querySelectorAll('button')].find(b => b.textContent === '最新').click();
  await pause(1000);
  assert.equal(root.querySelector('[data-entry]').textContent, '甲作品');
  assert.match(root.querySelector('.status').textContent, /所选内容/);
});
for (const kind of ['like', 'follow']) test(`historical ${kind} control reflects native acknowledgment without rebuilding article`, async t => {
  const f = fixture(t), rewind = mountRewind(f.doc, { initial: '2010', save(){} }); t.after(() => rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot, copy = root.querySelector('.note-copy');
  const native = kind === 'like' ? f.doc.querySelector('.note-container > .like-wrapper') : f.doc.querySelector('.note-detail-follow-btn button');
  let clicks = 0; native.onclick = () => { clicks++; native.setAttribute('aria-pressed', 'true'); };
  const button = [...root.querySelectorAll('.native-actions button')].find(b => kind === 'like' ? b.textContent === '赞 12' : b.textContent === '关注');
  assert.ok(button); button.click(); button.click(); assert.equal(clicks, 1);
  await until(() => button.getAttribute('aria-pressed') === 'true' && !button.disabled, 'source acknowledgment');
  assert.equal(root.querySelector('.note-copy'), copy);
});

test('a selected search filter may close its native panel while waiting for new results', async t => {
  const f = searchFixture(t), panel = f.doc.querySelector('.filter-panel'); panel.hidden = false;
  const rewind = mountRewind(f.doc, { initial: '2015', save(){} }); t.after(() => rewind.destroy());
  const root = f.doc.querySelector('rednote-rewind-document').shadowRoot, tags = f.doc.querySelectorAll('.tags');
  tags[1].onclick = () => { tags[0].classList.remove('active'); tags[1].classList.add('active'); panel.hidden = true; };
  [...root.querySelectorAll('button')].find(b => b.textContent === '最新').click();
  await pause(650); assert.match(root.querySelector('.status').textContent, /所选内容/);
  const feed = f.doc.querySelector('.feeds-container'); feed.prepend(feed.lastElementChild);
  await until(() => root.querySelector('[data-entry]')?.textContent === '乙作品', 'closed filter result');
  assert.equal(root.querySelector('.status').textContent, '');
});

test('self identity only comes from unambiguous account navigation, never article links', t => {
  const f = fixture(t);
  f.doc.querySelector('#detail-desc').innerHTML = '<nav><a href="/user/profile/impostor">我</a></nav>';
  const adapter = createAdapter(f.doc); t.after(() => adapter.destroy());
  assert.equal(adapter.read().selfUrl, '');
  f.doc.querySelector('#app').insertAdjacentHTML('beforeend','<nav><a href="/user/profile/me">我</a></nav>');
  assert.equal(adapter.read().selfUrl, 'https://www.xiaohongshu.com/user/profile/me');
  f.doc.querySelector('#app').insertAdjacentHTML('beforeend','<nav><a href="/user/profile/other">我的主页</a></nav>');
  assert.equal(adapter.read().selfUrl, '');
});
