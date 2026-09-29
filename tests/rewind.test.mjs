import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Bundle only in memory. Never start a live browser, server or request.
const result = await build({ entryPoints: ['src/rewind.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.woff2': 'dataurl', '.txt': 'text' } });
const { mountRewind } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const adapterBundle = await build({ entryPoints: ['src/adapters/xiaohongshu/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { createAdapter } = await import(`data:text/javascript;base64,${Buffer.from(adapterBundle.outputFiles[0].text).toString('base64')}`);
const startupBundle = await build({ entryPoints: ['src/startup-guard.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { createStartupGuard, waitForDocumentBody } = await import(`data:text/javascript;base64,${Buffer.from(startupBundle.outputFiles[0].text).toString('base64')}`);
const eraBundle = await build({ entryPoints: ['src/eras/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { normalizeEra } = await import(`data:text/javascript;base64,${Buffer.from(eraBundle.outputFiles[0].text).toString('base64')}`);
const makeWindow = (path = '/explore') => new Window({ url: `https://www.xiaohongshu.com${path}`, settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
const settle = () => new Promise(resolve => setTimeout(resolve, 30));
const rootOf = doc => {
  const root = doc.querySelector('rednote-rewind-document')?.shadowRoot;
  assert.ok(root, 'A historical era should mount a document in the current tab'); return root;
};
const reader = doc => {
  const main = rootOf(doc).querySelector('main[data-reader]');
  assert.ok(main, 'Historical document needs its own reading area'); return main;
};
const labels = doc => [...reader(doc).querySelectorAll('a[data-entry]')].map(link => link.textContent);
const noPageEraShortcuts = doc => {
  // Compare booleans so private fixtures cannot be printed if a control leaks.
  assert.equal(Boolean(rootOf(doc).querySelector('[data-action="now"],[data-action="source-now"],[data-action="video-now"],[data-mail-action="now"]')), false,
    'Era changes belong to the shared slider rather than shortcuts in the reading page');
};
const action = (doc, name) => {
  const control = rootOf(doc).querySelector(`[data-action="${name}"]`);
  assert.ok(control, `Missing explicit ${name} control`); control.click(); noPageEraShortcuts(doc);
};
const mailbox = doc => {
  const inbox = rootOf(doc).querySelector('[data-inbox]'); assert.ok(inbox, 'Messages and notifications need a historical reading view'); return inbox;
};
const mailRows = doc => [...mailbox(doc).querySelectorAll('[data-mail-item]')];
const mailTexts = doc => mailRows(doc).map(row => row.querySelector('.body').textContent);
const mailAction = (doc, name) => {
  const button = mailbox(doc).querySelector(`[data-mail-action="${name}"]`); assert.ok(button, `Missing mailbox ${name} control`); button.click();
};
const waitForMailbox = () => new Promise(resolve => setTimeout(resolve, 850));
function chatFixture(path = '/chat') {
  const win = makeWindow(path); const doc = win.document;
  doc.body.innerHTML = '<main id="app"><nav><a href="/chat">消息</a></nav><section class="xhs-im-page"><div class="xhs-im-conv-list"></div><div class="xhs-im-chat-window"><div class="xhs-im-chat-window__header-name"></div><div class="xhs-im-msg-list-wrap"><div class="xhs-im-msg-list"></div></div><div contenteditable="true" class="xhs-im-editor">TEST_UNSENT_DRAFT</div><button class="send">发送</button></div></section></main>';
  const source = doc.querySelector('#app'); let sends = 0;
  source.querySelector('nav a').addEventListener('click', event => { event.preventDefault(); win.history.pushState(null, '', '/chat'); });
  source.querySelector('.send').addEventListener('click', () => sends++);
  function addConversation(name, index, onOpen = () => {}) {
    const item = doc.createElement('div'); item.className = 'xhs-im-conv-item';
    item.innerHTML = '<span class="xhs-im-conv-item__name"></span><span class="xhs-im-conv-item__summary-text"></span><span class="xhs-im-conv-item__time">昨日</span><span class="xhs-im-conv-item__badge">2</span>';
    item.querySelector('.xhs-im-conv-item__name').textContent = name;
    item.querySelector('.xhs-im-conv-item__summary-text').textContent = `摘要 ${index}`;
    item.addEventListener('click', () => {
      source.querySelectorAll('.xhs-im-conv-item').forEach(row => row.classList.remove('active'));
      item.classList.add('active'); source.querySelector('.xhs-im-chat-window__header-name').textContent = name;
      win.history.pushState(null, '', `/chat/conversation${index}`); onOpen();
    });
    source.querySelector('.xhs-im-conv-list').append(item); return item;
  }
  function message(text, outgoing = false) {
    const item = doc.createElement('div'); item.className = 'chat-item';
    const bubble = doc.createElement('div'); bubble.className = outgoing ? 'chat-item__content--right' : 'chat-item__content--left';
    const body = doc.createElement('span'); body.className = 'xhs-im-bubble__text'; body.textContent = text; bubble.append(body); item.append(bubble); return item;
  }
  const list = source.querySelector('.xhs-im-msg-list');
  return { win, doc, source, list, addConversation, message, sends: () => sends };
}
function notificationFixture() {
  const win = makeWindow('/notification'); const doc = win.document;
  doc.body.innerHTML = '<main id="app"><section class="notification-page"><div class="reds-tabs-list"></div><div class="tabs-content-container"></div><button class="action-reply">回复</button><button class="action-like">赞</button><button class="follow">关注</button></section></main>';
  let writes = 0; doc.querySelectorAll('.action-reply,.action-like,.follow').forEach(button => button.addEventListener('click', () => writes++));
  const tabs = ['评论和@', '赞和收藏', '新增关注'].map((label, index) => {
    const tab = doc.createElement('div'); tab.className = `reds-tab-item${index === 0 ? ' active' : ''}`; tab.textContent = label;
    tab.addEventListener('click', () => { doc.querySelectorAll('.reds-tab-item').forEach(node => node.classList.remove('active')); tab.classList.add('active'); });
    doc.querySelector('.reds-tabs-list').append(tab); return tab;
  });
  function record(text, index = 1) {
    const row = doc.createElement('div'); row.className = 'container';
    row.innerHTML = '<div class="main"><div class="info"><div class="user-info"><a href="/user/profile/reader">读者</a></div><div class="interaction-hint">通知<span class="interaction-time">昨日</span></div><div class="interaction-content"></div><div class="quote-info"></div></div></div><div class="extra"><a href="javascript:alert(1)">危险链接</a></div>';
    row.querySelector('.interaction-content').textContent = text;
    row.querySelector('.quote-info').textContent = `引用 ${index}`; return row;
  }
  return { win, doc, tabs, list: doc.querySelector('.tabs-content-container'), record, writes: () => writes };
}
function appendNotes(doc, start, count) {
  for (let i = start; i < start + count; i++) {
    const card = doc.createElement('section'); card.className = 'note-item';
    card.innerHTML = `<div><a class="cover" href="/explore/note${i}"><img alt="插图"></a><div class="footer"><a class="title" href="/explore/note${i}"></a><div class="author-wrapper"><a class="author" href="/user/profile/writer${i}"><span class="name">作者 ${i}</span></a><span class="count">${i}</span></div></div></div>`;
    card.querySelector('.title').textContent = `条目 ${i}`;
    doc.querySelector('.feeds-container').append(card);
  }
}
function fixture(count = 23) {
  const win = makeWindow();
  win.document.body.innerHTML = '<main id="app"><h1>小红书</h1><nav><a href="/notification"><span>消息</span><span class="badge">2</span></a></nav><input value="尚未提交的检索词"><button id="original">原有控件</button><div class="feeds-container"></div><video></video></main>';
  appendNotes(win.document, 1, count); return win;
}
function mount(t, win, options = {}) {
  const rewind = mountRewind(win.document, { initial: '1995', save() {}, ...options });
  if (win.document.querySelector('rednote-rewind-document')) noPageEraShortcuts(win.document);
  t.after(async () => { rewind.destroy(); await win.happyDOM.close(); }); return rewind;
}

test('startup guard hides the source synchronously before an asynchronous preference resolves', async t => {
  const win = fixture(2); const doc = win.document; t.after(() => win.happyDOM.close());
  let resolvePreference; let preferenceResolved = false;
  const preference = new Promise(resolve => { resolvePreference = resolve; }).then(() => { preferenceResolved = true; });
  const guard = createStartupGuard(doc); t.after(() => guard.release());
  assert.equal(preferenceResolved, false); assert.equal(guard.active, true);
  assert.equal(doc.documentElement.hasAttribute('data-rednote-rewind-starting'), true);
  const cover = doc.querySelector('rednote-rewind-startup'); assert.ok(cover);
  assert.equal(cover.parentElement, doc.documentElement);
  assert.equal(win.getComputedStyle(doc.body).opacity, '0');
  assert.equal(doc.querySelector('#app').inert, false, 'Guard must not mutate source accessibility state');
  resolvePreference(); await preference; guard.release();
  assert.equal(guard.active, false); assert.equal(doc.querySelector('rednote-rewind-startup'), null);
});

test('startup protection can begin before documentElement, head or body exists', async t => {
  const win = makeWindow(); const doc = win.document; t.after(() => win.happyDOM.close());
  doc.documentElement.remove();
  const guard = createStartupGuard(doc); t.after(() => guard.release());
  assert.equal(guard.active, true); assert.equal(doc.documentElement, null);
  const html = doc.createElement('html'); doc.append(html); await settle();
  assert.equal(html.hasAttribute('data-rednote-rewind-starting'), true);
  assert.equal(doc.querySelector('rednote-rewind-startup')?.parentElement, html);
  assert.equal(doc.head, null); assert.equal(doc.body, null);
  const head = doc.createElement('head'); const body = doc.createElement('body'); html.append(head, body);
  assert.equal(await waitForDocumentBody(doc), true);
  assert.equal(win.getComputedStyle(body).opacity, '0');
  guard.release(); assert.equal(html.hasAttribute('data-rednote-rewind-starting'), false);
});

test('historical reader takes over before startup cover removal while source remains isolated', t => {
  const win = fixture(2); const doc = win.document;
  const guard = createStartupGuard(doc); t.after(() => guard.release());
  mount(t, win);
  assert.ok(doc.querySelector('rednote-rewind-startup')); assert.ok(reader(doc));
  guard.release();
  assert.equal(doc.querySelector('rednote-rewind-startup'), null);
  assert.equal(doc.querySelector('style[data-rednote-rewind="startup"]'), null);
  assert.equal(doc.querySelector('#app').inert, true);
  assert.equal(doc.querySelector('#app').getAttribute('aria-hidden'), 'true');
  assert.ok(doc.querySelector('style[data-rednote-rewind="document"]'));
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, '1995');
});

test('normal-mode startup release restores existing attributes and styles without changing source nodes', t => {
  const win = fixture(2); const doc = win.document; t.after(() => win.happyDOM.close());
  doc.documentElement.setAttribute('data-rednote-rewind-starting', 'prior-value');
  doc.documentElement.setAttribute('style', 'background: white;');
  doc.body.setAttribute('style', 'opacity: 0.8;');
  const source = doc.querySelector('#app'); source.inert = true; source.setAttribute('aria-hidden', 'false');
  const before = { html: doc.documentElement.getAttribute('style'), body: doc.body.getAttribute('style'), source: source.outerHTML };
  const guard = createStartupGuard(doc); guard.release(); guard.release();
  assert.equal(doc.documentElement.getAttribute('data-rednote-rewind-starting'), 'prior-value');
  assert.equal(doc.documentElement.getAttribute('style'), before.html); assert.equal(doc.body.getAttribute('style'), before.body);
  assert.equal(doc.querySelector('#app'), source); assert.equal(source.outerHTML, before.source);
  assert.equal(win.getComputedStyle(doc.body).opacity, '0.8'); assert.equal(guard.active, false);
  assert.equal(doc.querySelector('rednote-rewind-startup,style[data-rednote-rewind="startup"]'), null);
});

test('body readiness waits for both head and body rather than only one container', async t => {
  const win = makeWindow(); const doc = win.document; t.after(() => win.happyDOM.close());
  doc.head.remove(); doc.body.remove(); let finished = false;
  const waiting = waitForDocumentBody(doc, { timeoutMs: 500 }).then(value => { finished = true; return value; });
  doc.documentElement.append(doc.createElement('body')); await settle(); assert.equal(finished, false);
  doc.documentElement.prepend(doc.createElement('head'));
  assert.equal(await waiting, true);
  assert.equal(await waitForDocumentBody(doc), true);
});

test('body readiness settles on cancellation, including a signal aborted before registration', async t => {
  const win = makeWindow(); const doc = win.document; t.after(() => win.happyDOM.close()); doc.body.remove();
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal(await waitForDocumentBody(doc, { signal: cancelled.signal }), false);
  const cancellation = new AbortController();
  const guard = createStartupGuard(doc); t.after(() => guard.release());
  const waiting = waitForDocumentBody(doc, { signal: cancellation.signal });
  cancellation.abort(); guard.release();
  assert.equal(await waiting, false); assert.equal(guard.active, false);
  doc.documentElement.append(doc.createElement('body')); await settle();
  assert.equal(doc.querySelector('rednote-rewind-startup'), null);
  assert.equal(doc.documentElement.hasAttribute('data-rednote-rewind-starting'), false);
});

test('startup and body timeouts release protection instead of leaving a permanently hidden page', async t => {
  const win = makeWindow(); const doc = win.document; t.after(() => win.happyDOM.close()); doc.body.remove();
  assert.equal(await waitForDocumentBody(doc, { timeoutMs: 15 }), false);
  const cancellation = new AbortController(); let timeoutCalls = 0;
  const guard = createStartupGuard(doc, { timeoutMs: 20, onTimeout() { timeoutCalls++; cancellation.abort(); } });
  t.after(() => guard.release());
  assert.equal(await waitForDocumentBody(doc, { signal: cancellation.signal, timeoutMs: 500 }), false);
  assert.equal(guard.active, false); assert.equal(timeoutCalls, 1);
  assert.equal(doc.documentElement.hasAttribute('data-rednote-rewind-starting'), false);
  assert.equal(doc.querySelector('rednote-rewind-startup,style[data-rednote-rewind="startup"]'), null);
  doc.documentElement.append(doc.createElement('body')); await settle();
  assert.notEqual(win.getComputedStyle(doc.body).opacity, '0'); assert.equal(timeoutCalls, 1);
});

test('1995 has fixed ten-entry pages; scrolling never appends rows', async t => {
  const win = fixture(); const doc = win.document; mount(t, win);
  const first = labels(doc); assert.equal(first.length, 10);
  assert.equal(first[0], '条目 1'); assert.equal(first.at(-1), '条目 10');
  reader(doc).dispatchEvent(new win.Event('scroll')); win.dispatchEvent(new win.Event('scroll'));
  await settle(); assert.deepEqual(labels(doc), first);
  action(doc, 'next'); await settle(); assert.equal(labels(doc).length, 10); assert.equal(labels(doc)[0], '条目 11');
  action(doc, 'next'); await settle(); assert.equal(labels(doc).length, 3); assert.equal(labels(doc)[0], '条目 21');
  action(doc, 'previous'); await settle(); action(doc, 'previous'); await settle(); assert.deepEqual(labels(doc), first);
});

test('background additions leave the current page and reading position unchanged', async t => {
  const win = fixture(20); const doc = win.document; mount(t, win);
  const first = labels(doc); const main = reader(doc); main.scrollTop = 120;
  appendNotes(doc, 21, 5); await settle();
  assert.deepEqual(labels(doc), first); assert.equal(reader(doc), main); assert.equal(main.scrollTop, 120);
  action(doc, 'next'); await settle(); action(doc, 'next'); await settle();
  assert.equal(labels(doc).length, 5); assert.equal(labels(doc)[0], '条目 21');
});

test('loading after a short tail page starts after its last entry without skipping or changing the old page', async t => {
  const win = fixture(3); const doc = win.document; mount(t, win);
  const first = labels(doc); reader(doc).scrollTop = 91;
  action(doc, 'next');
  // Simulate a new source batch arriving only after the explicit request.
  appendNotes(doc, 4, 11);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.deepEqual(labels(doc), Array.from({ length: 10 }, (_, i) => `条目 ${i + 4}`));
  action(doc, 'previous');
  assert.deepEqual(labels(doc), first); assert.equal(reader(doc).scrollTop, 91);
  action(doc, 'next'); action(doc, 'next');
  assert.deepEqual(labels(doc), ['条目 14']);
});

test('source text updates appear only after explicit refresh', async t => {
  const win = fixture(3); const doc = win.document; mount(t, win);
  doc.querySelector('.note-item .title').textContent = '修订后的条目'; await settle();
  assert.equal(labels(doc)[0], '条目 1'); action(doc, 'refresh'); await settle();
  assert.equal(labels(doc)[0], '修订后的条目');
});

test('an initially empty profile waits for its asynchronous article directory', async t => {
  const win = makeWindow('/user/profile/author'); const doc = win.document;
  doc.body.innerHTML = '<main id="app"><section class="user-page"><div class="user-info"><span class="user-name">测试作者</span><p class="user-desc">作者简介。</p></div><div class="feeds-container"></div></section></main>';
  mount(t, win);
  // An author header alone must not freeze an empty directory as a completed page.
  await new Promise(resolve => setTimeout(resolve, 850)); assert.equal(labels(doc).length, 0);
  appendNotes(doc, 1, 4); await new Promise(resolve => setTimeout(resolve, 850));
  assert.deepEqual(labels(doc), ['条目 1', '条目 2', '条目 3', '条目 4']);
});

test('clicking the current homepage URL does not start a request or block pagination', t => {
  const win = fixture(); const doc = win.document; mount(t, win); action(doc, 'next');
  const currentPage = labels(doc); const home = [...rootOf(doc).querySelectorAll('a')].find(anchor => anchor.textContent === '首页');
  assert.ok(home); home.click();
  assert.deepEqual(labels(doc), currentPage); assert.equal(reader(doc).querySelector('.status').textContent, '');
  action(doc, 'next'); assert.deepEqual(labels(doc), ['条目 21', '条目 22', '条目 23']);
});

test('now restores source accessibility state, input values and original event handlers', t => {
  const win = fixture(3); const doc = win.document;
  const source = doc.querySelector('#app'); const input = source.querySelector('input');
  const retained = doc.createElement('aside'); retained.inert = true; retained.setAttribute('aria-hidden', 'false'); doc.body.append(retained);
  let clicks = 0; source.querySelector('#original').addEventListener('click', () => clicks++); input.value = '未提交的新文字';
  const saved = []; const rewind = mount(t, win, { initial: 'now', save: era => saved.push(era) }); rewind.setEra('1995');
  assert.equal(source.inert, true); assert.equal(source.getAttribute('aria-hidden'), 'true');
  assert.equal(doc.querySelector('#app'), source); assert.equal(source.querySelector('input'), input);
  rewind.setEra('now');
  assert.equal(source.inert, false); assert.equal(source.hasAttribute('aria-hidden'), false);
  assert.equal(retained.inert, true); assert.equal(retained.getAttribute('aria-hidden'), 'false');
  assert.equal(input.value, '未提交的新文字'); source.querySelector('#original').click(); assert.equal(clicks, 1);
  assert.equal(doc.querySelector('rednote-rewind-document'), null);
  assert.equal(doc.documentElement.hasAttribute('data-rednote-rewind-era'), false); assert.deepEqual(saved, ['1995', 'now']);
});

test('a dynamically added modern overlay outside the app is isolated and restored', async t => {
  const win = fixture(2); const doc = win.document; const rewind = mount(t, win);
  const portal = doc.createElement('div'); portal.className = 'modern-overlay'; portal.textContent = '现代浮层'; doc.body.append(portal);
  await settle(); assert.equal(portal.inert, true); assert.equal(portal.getAttribute('aria-hidden'), 'true');
  rewind.setEra('now'); assert.equal(portal.inert, false); assert.equal(portal.hasAttribute('aria-hidden'), false); assert.equal(portal.isConnected, true);
});

test('source HTML is literal text; no modern layout, image or video leaks into the default document', t => {
  const win = fixture(2); const doc = win.document;
  const text = '<img src=x onerror="alert(1)"><script>alert(2)</script>'; doc.querySelector('.note-item .title').textContent = text;
  mount(t, win); assert.equal(labels(doc)[0], text);
  assert.equal(Boolean(rootOf(doc).querySelector('img:not([data-era-logo]),video,script,iframe,[onclick],[onerror],.badge,.note-detail-mask,.swiper-wrapper')), false);
});

test('message navigation shows the real unread count as plain text', t => {
  const win = fixture(2); mount(t, win);
  const messages = rootOf(win.document).querySelector('a[data-nav="messages"]');
  assert.ok(messages); assert.equal(messages.textContent, '消息 (2)'); assert.equal(messages.querySelector('svg,img,.badge'), null);
});

test('chat count takes priority over notifications and late updates leave the reading document unchanged', async t => {
  const win = fixture(12); const doc = win.document;
  doc.querySelector('.badge').textContent = '5';
  const chat = doc.createElement('a'); chat.href = '/chat'; chat.textContent = '2 消息';
  doc.querySelector('#app nav').append(chat); mount(t, win);
  const message = () => rootOf(doc).querySelector('a[data-nav="messages"]');
  assert.equal(message().textContent, '消息 (2)');
  const main = reader(doc); main.scrollTop = 73; const entries = labels(doc);
  chat.textContent = '3 消息';
  await new Promise(resolve => setTimeout(resolve, 2300));
  assert.equal(message().textContent, '消息 (3)'); assert.equal(reader(doc), main);
  assert.equal(main.scrollTop, 73); assert.deepEqual(labels(doc), entries);
  chat.textContent = '消息';
  await new Promise(resolve => setTimeout(resolve, 2300));
  assert.equal(message().textContent, '消息', 'A removed unread badge must not leave a stale count');
  assert.equal(reader(doc), main); assert.equal(main.scrollTop, 73); assert.deepEqual(labels(doc), entries);
});

test('the adapter does not guess counts from a dot, capped badge or private message body', async t => {
  const win = fixture(2); t.after(() => win.happyDOM.close()); const doc = win.document;
  const adapter = createAdapter(doc); t.after(() => adapter.destroy());
  assert.equal(adapter.read().unread, 2);
  doc.querySelector('.badge').textContent = '99+'; assert.equal(adapter.read().unread, null);
  doc.querySelector('.badge').textContent = ''; assert.equal(adapter.read().unread, null);
  doc.querySelector('#app').insertAdjacentHTML('beforeend', '<div class="conversation"><p>正文中出现 18 条消息</p></div>');
  assert.equal(adapter.read().unread, null);
  doc.querySelector('.badge').textContent = '0'; assert.equal(adapter.read().unread, 0);
});

test('unsafe links are not promoted into the historical document', t => {
  const win = fixture(3); const doc = win.document;
  const cards = doc.querySelectorAll('.note-item');
  cards[0].querySelector('.cover').setAttribute('href', 'javascript:alert(1)');
  cards[1].querySelector('.cover').setAttribute('href', 'https://example.test/explore/foreign');
  mount(t, win); assert.deepEqual(labels(doc), ['条目 3']);
  for (const link of rootOf(doc).querySelectorAll('a[href]')) assert.equal(link.getAttribute('href').startsWith('javascript:'), false);
});

test('a note opens as text with an explicit image request and paged comments', async t => {
  const win = makeWindow('/explore/article'); const doc = win.document;
  doc.body.innerHTML = '<main id="app"><section id="noteContainer" class="note-container"><div class="author"><a class="name" href="/user/profile/author">作者</a></div><div class="media-container"><div class="note-slider-img"><img src="https://example.test/picture.jpg" width="600" height="400"></div></div><div class="note-content"><h1 id="detail-title">文章题目</h1><div id="detail-desc">文章正文</div><div class="comments-el"></div></div></section></main>';
  for (let i = 1; i <= 12; i++) {
    const comment = doc.createElement('div'); comment.className = 'comment-item';
    comment.innerHTML = `<div class="author"><a class="name" href="/user/profile/commenter">读者</a></div><div class="content">评论 ${i}</div><div class="date">一九九五年</div>`;
    doc.querySelector('.comments-el').append(comment);
  }
  mount(t, win);
  assert.equal(Boolean(rootOf(doc).querySelector('img:not([data-era-logo]),video,.note-detail-mask')), false);
  assert.ok(rootOf(doc).querySelector('[data-action="images"]'));
  assert.equal(reader(doc).textContent.includes('文章正文'), true);
  assert.equal(rootOf(doc).querySelectorAll('[data-discussion] [data-comment]').length, 0);
  assert.ok(rootOf(doc).querySelector('[data-compose] textarea'));
  action(doc, 'comments');
  const comments = () => [...rootOf(doc).querySelectorAll('[data-discussion] article .body')].map(node => node.textContent);
  assert.equal(comments().length, 10); assert.equal(comments()[0], '评论 1');
  action(doc, 'comments-next'); await settle();
  assert.deepEqual(comments(), ['评论 11', '评论 12']);
  action(doc, 'comments-previous'); await settle(); assert.equal(comments()[0], '评论 1');
});

test('explicitly opened pictures remain open after reading comments and changing eras', t => {
  const win = makeWindow('/explore/article'); const doc = win.document;
  const imageRequests = [];
  // Do not let the reader's off-document Image object initiate any network request.
  t.mock.setter(win.HTMLImageElement.prototype, 'src', value => { if (!value.startsWith('/logos/eras/')) imageRequests.push(value); });
  doc.body.innerHTML = '<main id="app"><section class="note-container"><div class="media-container"><div class="note-slider-img"><img src="https://ci.xhscdn.com/fixture-picture.jpg" width="600" height="400"></div></div><div class="note-content"><h1 id="detail-title">附图文章</h1><div id="detail-desc">文章正文。</div></div></section></main>';
  const rewind = mount(t, win);
  assert.equal(rootOf(doc).querySelector('[data-period-image]'), null); assert.equal(imageRequests.length, 0);
  action(doc, 'images');
  assert.ok(rootOf(doc).querySelector('[data-pictures] [data-period-image]')); assert.ok(imageRequests.length > 0);
  action(doc, 'comments');
  assert.ok(rootOf(doc).querySelector('[data-pictures] [data-period-image]')); assert.ok(rootOf(doc).querySelector('[data-discussion]'));
  rewind.setEra('now'); rewind.setEra('1995');
  assert.ok(rootOf(doc).querySelector('[data-pictures] [data-period-image]'));
  assert.equal(rootOf(doc).querySelector('[data-action="images"]').disabled, true);
  assert.equal(Boolean(rootOf(doc).querySelector('img:not([data-era-logo]),video')), false);
});

for (const era of ['1985', '1995', '2000', '2005', '2010', '2015']) test(`${era} list to note to author and browser back preserve document style, page and reading position`, async t => {
  const win = fixture(); const doc = win.document; const app = doc.querySelector('#app');
  function showSourceRoute() {
    doc.querySelector('#noteContainer')?.remove(); app.querySelector('.user-page')?.remove();
    if (win.location.pathname.startsWith('/explore/note')) {
      const note = doc.createElement('section'); note.id = 'noteContainer'; note.className = 'note-container';
      note.innerHTML = '<div class="author"><a class="name" href="/user/profile/author">作者资料链接</a></div><div class="note-content"><h1 id="detail-title">路线测试文章</h1><div id="detail-desc">用于验证路线的正文。</div></div>';
      note.querySelector('a').addEventListener('click', event => { event.preventDefault(); win.history.pushState(null, '', '/user/profile/author'); showSourceRoute(); });
      doc.body.append(note);
    } else if (win.location.pathname.startsWith('/user/profile/')) {
      const profile = doc.createElement('section'); profile.className = 'user-page';
      profile.innerHTML = '<div class="user-info"><span class="user-name">路线测试作者</span><p class="user-desc">作者简介。</p></div><div class="empty-container">没有条目</div>';
      app.append(profile);
    }
  }
  app.querySelectorAll('a.cover').forEach(anchor => anchor.addEventListener('click', event => {
    event.preventDefault(); win.history.pushState(null, '', anchor.href); showSourceRoute();
  }));
  win.addEventListener('popstate', showSourceRoute);
  mount(t, win, { initial: era }); action(doc, 'next'); await settle();
  const second = labels(doc); reader(doc).scrollTop = 137;
  reader(doc).querySelector('a[data-entry]').click();
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(reader(doc).textContent.includes('路线测试文章'), true);
  assert.equal(rootOf(doc).querySelector('.note-detail-mask,.swiper-wrapper'), null);
  const author = [...reader(doc).querySelectorAll('a')].find(anchor => anchor.textContent === '作者资料链接');
  assert.ok(author); author.click(); await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(reader(doc).textContent.includes('路线测试作者'), true);
  win.history.back(); await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(reader(doc).textContent.includes('路线测试文章'), true);
  win.history.back(); await new Promise(resolve => setTimeout(resolve, 850));
  assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 137);
  assert.equal(doc.querySelector('#app').inert, true);
});

test('a back-forward-cache return clears an outgoing route request and restores the saved page', async t => {
  const win = fixture(); const doc = win.document;
  // Keep the source document alive while modelling a native navigation away.
  doc.querySelectorAll('a.cover').forEach(anchor => anchor.addEventListener('click', event => event.preventDefault()));
  mount(t, win); action(doc, 'next'); const second = labels(doc); reader(doc).scrollTop = 133;
  reader(doc).querySelector('a[data-entry]').click();
  assert.equal(reader(doc).querySelector('.status').textContent.includes('正在读取'), true);
  win.dispatchEvent(new win.Event('pagehide'));
  const restored = new win.Event('pageshow'); Object.defineProperty(restored, 'persisted', { value: true });
  win.dispatchEvent(restored);
  assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 133);
  assert.equal(reader(doc).querySelector('.status').textContent, '');
  // Advance the clock beyond the old request timeout without a ten-second wait.
  const future = Date.now() + 11000; t.mock.method(Date, 'now', () => future);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(reader(doc).querySelector('.status').textContent, '');
  action(doc, 'next'); assert.deepEqual(labels(doc), ['条目 21', '条目 22', '条目 23']);
});

test('the slider switches document and panel together and keeps a recovery control', t => {
  const win = fixture(2); const doc = win.document; const rewind = mount(t, win, { initial: 'now' }); rewind.togglePanel();
  const panel = doc.querySelector('rednote-rewind-control').shadowRoot;
  const slider = panel.querySelector('input'); slider.value = '1'; slider.dispatchEvent(new win.Event('input'));
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, '1995'); assert.ok(reader(doc));
  assert.equal(panel.querySelector('section').dataset.era, '1995');
  panel.querySelector('.close').click(); assert.equal(panel.querySelector('.open').hidden, false);
  panel.querySelector('.open').click(); assert.equal(panel.querySelector('section').hidden, false);
  panel.querySelector('[data-value="now"]').click(); assert.equal(panel.querySelector('section').dataset.era, 'now');
  assert.equal(doc.querySelector('rednote-rewind-document'), null);
});

test('disposal restores existing root state and removes only extension UI', t => {
  const win = fixture(2); const doc = win.document; const source = doc.querySelector('#app');
  doc.documentElement.setAttribute('data-rednote-rewind-era', 'preexisting'); const rewind = mount(t, win); rewind.destroy();
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, 'preexisting');
  assert.equal(doc.querySelector('rednote-rewind-control'), null); assert.equal(doc.querySelector('rednote-rewind-document'), null);
  assert.equal(doc.querySelector('#app'), source); assert.equal(source.inert, false);
});

test('panel open state can be restored after a development reload', t => {
  const win = fixture(2); const changes = []; const rewind = mount(t, win, { open: true, onPanelChange: open => changes.push(open) });
  const panel = win.document.querySelector('rednote-rewind-control').shadowRoot;
  assert.equal(panel.querySelector('section').hidden, false); assert.equal(panel.querySelector('section').dataset.era, '1995');
  rewind.togglePanel(); assert.deepEqual(changes, [true, false]);
});

test('a mailbox accepts a late first conversation list and only explicit pagination changes its rows', async t => {
  const chat = chatFixture(); mount(t, chat.win); await waitForMailbox();
  assert.equal(mailRows(chat.doc).length, 0);
  for (let i = 1; i <= 12; i++) chat.addConversation(`联系人 ${i}`, i);
  await waitForMailbox(); assert.equal(mailRows(chat.doc).length, 10);
  const first = mailTexts(chat.doc); const readingArea = reader(chat.doc); readingArea.scrollTop = 125;
  chat.addConversation('联系人 13', 13);
  readingArea.dispatchEvent(new chat.win.Event('scroll')); await settle();
  assert.deepEqual(mailTexts(chat.doc), first); assert.equal(readingArea.scrollTop, 125);
  mailAction(chat.doc, 'next'); assert.deepEqual(mailTexts(chat.doc), ['摘要 11', '摘要 12', '摘要 13']);
  mailAction(chat.doc, 'previous'); assert.deepEqual(mailTexts(chat.doc), first);
  assert.equal(mailbox(chat.doc).querySelector('.xhs-im-conv-list,.xhs-im-chat-window,img,video,textarea,[contenteditable]'), null);
  assert.equal(mailbox(chat.doc).textContent.includes('TEST_UNSENT_DRAFT'), false); assert.equal(chat.sends(), 0);
});

test('opening a conversation reads newest-first pages without sending or executing message HTML', async t => {
  const chat = chatFixture(); let opens = 0;
  const dangerousText = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  chat.addConversation('测试读者', 1, () => {
    opens++;
    chat.list.replaceChildren(...Array.from({ length: 12 }, (_, i) => chat.message(i === 11 ? dangerousText : `消息 ${i + 1}`, i % 2 === 0)));
    const link = chat.doc.createElement('a'); link.href = 'javascript:alert(1)'; link.textContent = '链接'; chat.list.lastElementChild.append(link);
  });
  mount(t, chat.win); await waitForMailbox(); mailAction(chat.doc, 'open'); await waitForMailbox();
  assert.equal(opens, 1); assert.equal(mailTexts(chat.doc).length, 10);
  assert.equal(mailTexts(chat.doc)[0], dangerousText); assert.equal(mailTexts(chat.doc)[1], '消息 11');
  assert.equal(mailbox(chat.doc).querySelector('img,video,script,iframe,textarea,[contenteditable],[onclick],[onerror],a[href^="javascript:"]'), null);
  assert.equal(mailbox(chat.doc).textContent.includes('TEST_UNSENT_DRAFT'), false); assert.equal(chat.sends(), 0);
  const first = mailTexts(chat.doc); chat.list.append(chat.message('后台新消息'));
  await settle(); assert.deepEqual(mailTexts(chat.doc), first);
  mailAction(chat.doc, 'next'); assert.deepEqual(mailTexts(chat.doc), ['消息 2', '消息 1', '后台新消息']);
  mailAction(chat.doc, 'previous'); assert.deepEqual(mailTexts(chat.doc), first);
  mailAction(chat.doc, 'back'); await waitForMailbox(); assert.deepEqual(mailTexts(chat.doc), ['摘要 1']);
  assert.equal(chat.sends(), 0);
});

test('changing a correspondent cannot display the old body beneath the newly selected name', async t => {
  const chat = chatFixture();
  const old = chat.addConversation('甲', 1); old.classList.add('active');
  chat.doc.querySelector('.xhs-im-chat-window__header-name').textContent = '甲';
  chat.list.append(chat.message('甲的旧正文'));
  chat.addConversation('乙', 2); // The source updates selection/header before its body arrives.
  mount(t, chat.win); await waitForMailbox();
  const target = [...mailbox(chat.doc).querySelectorAll('[data-mail-action="open"]')].find(button => button.textContent.startsWith('乙'));
  assert.ok(target); target.click(); await waitForMailbox();
  assert.equal(mailRows(chat.doc).length, 0);
  assert.equal(mailbox(chat.doc).textContent.includes('甲的旧正文'), false);
  chat.list.replaceChildren(chat.message('乙的新正文')); await waitForMailbox();
  assert.deepEqual(mailTexts(chat.doc), ['乙的新正文']);
  assert.equal(mailbox(chat.doc).querySelector('h3').textContent, '乙'); assert.equal(chat.sends(), 0);
});

test('native conversation pushState keeps the selected mailbox and browser back restores a paginated directory', async t => {
  const chat = chatFixture();
  for (let i = 1; i <= 12; i++) chat.addConversation(`联系人 ${i}`, i, () => chat.list.replaceChildren(chat.message(`会话 ${i} 正文`)));
  mount(t, chat.win); await waitForMailbox(); const originalMailbox = mailbox(chat.doc);
  mailAction(chat.doc, 'open'); await waitForMailbox();
  assert.equal(chat.win.location.pathname, '/chat/conversation1');
  assert.equal(mailbox(chat.doc), originalMailbox, 'Native chat route changes must not replace the mailbox with a directory');
  assert.deepEqual(mailTexts(chat.doc), ['会话 1 正文']);
  assert.ok(mailbox(chat.doc).querySelector('[data-mail-action="back"]'));
  assert.equal(mailbox(chat.doc).querySelector('[data-mail-action="open"]'), null);
  chat.win.history.back(); await waitForMailbox();
  assert.equal(chat.win.location.pathname, '/chat'); assert.equal(mailRows(chat.doc).length, 10);
  assert.equal(mailbox(chat.doc).querySelector('[data-mail-action="back"]'), null);
  mailAction(chat.doc, 'next'); assert.deepEqual(mailTexts(chat.doc), ['摘要 11', '摘要 12']);
  assert.equal(chat.sends(), 0);
});

test('a chat deep link waits for its first body and returns through the original directory link', async t => {
  const chat = chatFixture('/chat/conversation1'); mount(t, chat.win); await waitForMailbox();
  assert.equal(mailRows(chat.doc).length, 0);
  const contact = chat.addConversation('深链接联系人', 1); contact.classList.add('active');
  chat.doc.querySelector('.xhs-im-chat-window__header-name').textContent = '深链接联系人';
  chat.list.replaceChildren(chat.message('较早记录'), chat.message('最近记录'));
  await waitForMailbox();
  assert.deepEqual(mailTexts(chat.doc), ['最近记录', '较早记录']);
  assert.equal(mailbox(chat.doc).querySelector('[data-mail-action="open"]'), null);
  mailAction(chat.doc, 'back'); await waitForMailbox();
  assert.equal(chat.win.location.pathname, '/chat'); assert.deepEqual(mailTexts(chat.doc), ['摘要 1']);
  assert.ok(mailbox(chat.doc).querySelector('[data-mail-action="open"]')); assert.equal(chat.sends(), 0);
});

test('notification categories paginate text and wait for new records after the active tab changes', async t => {
  const notifications = notificationFixture();
  const literal = '<img onerror="alert(1)" src=x>';
  notifications.list.append(...Array.from({ length: 12 }, (_, i) => notifications.record(i === 0 ? literal : `评论通知 ${i + 1}`, i + 1)));
  mount(t, notifications.win); await waitForMailbox();
  assert.equal(mailRows(notifications.doc).length, 10); assert.equal(mailTexts(notifications.doc)[0].includes(literal), true);
  assert.equal(mailbox(notifications.doc).querySelector('img,script,[onerror],a[href^="javascript:"],.notification-page,.reds-tabs-list'), null);
  mailAction(notifications.doc, 'next'); assert.equal(mailRows(notifications.doc).length, 2);
  mailAction(notifications.doc, 'previous'); assert.equal(mailRows(notifications.doc).length, 10);
  const category = label => [...mailbox(notifications.doc).querySelectorAll('[data-mail-action="category"]')].find(button => button.textContent === label);
  assert.equal([...mailbox(notifications.doc).querySelectorAll('[data-mail-action="category"]')].length, 3);
  category('赞和收藏').click(); await waitForMailbox();
  assert.equal(mailRows(notifications.doc).length, 0); assert.equal(mailbox(notifications.doc).textContent.includes('评论通知'), false);
  notifications.list.replaceChildren(notifications.record('赞和收藏记录')); await waitForMailbox();
  assert.equal(mailTexts(notifications.doc)[0].includes('赞和收藏记录'), true);
  category('新增关注').click(); await waitForMailbox(); assert.equal(mailRows(notifications.doc).length, 0);
  notifications.list.replaceChildren(notifications.record('关注记录')); await waitForMailbox();
  assert.equal(mailTexts(notifications.doc)[0].includes('关注记录'), true);
  assert.equal(notifications.writes(), 0, 'Reading category tabs must not submit replies, likes or follows');
});

test('switching to now cancels a waiting mailbox and restores the original source', async t => {
  const chat = chatFixture(); const rewind = mount(t, chat.win);
  const oldMailbox = mailbox(chat.doc); const markup = oldMailbox.innerHTML;
  assert.equal(chat.source.inert, true); rewind.setEra('now');
  assert.equal(chat.source.inert, false); assert.equal(chat.source.hasAttribute('aria-hidden'), false);
  assert.equal(oldMailbox.isConnected, false);
  chat.addConversation('晚到联系人', 1); await waitForMailbox();
  assert.equal(oldMailbox.innerHTML, markup, 'Destroyed mailbox timers must not continue rendering');
  assert.equal(chat.doc.querySelector('rednote-rewind-document'), null); assert.equal(chat.sends(), 0);
});

const samples = [
  ['provided-home-signed-in-01', '/explore', 'list'],
  ['20260927-search-notes-01', '/search_result?keyword=test', 'list'],
  ['20260927-search-users-01', '/search_result?keyword=test&type=51', 'list'],
  ['20260927-profile-public-notes-01', '/user/profile/fixture', 'profile'],
  ['20260927-note-image-detail-01', '/explore/fixture', 'note'],
  ['20260927-note-video-detail-02', '/explore/fixture', 'note'],
  ['20260927-note-comments-expanded-01', '/explore/fixture', 'note'],
  ['20260927-search-empty-01', '/search_result?keyword=test', 'list'],
];
for (const era of ['1985', '1995', '2000', '2005', '2010', '2015']) for (const [name, route, kind] of samples) {
  test(`${era} private sample renders a historical document and restores source: ${name}`, async t => {
    let html;
    try { html = await readFile(`references/xiaohongshu/captures/${name}/page.html`, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') { t.skip('Private capture is not present'); return; } throw error; }
    const win = makeWindow(route); win.document.write(html); const source = win.document.querySelector('#app'); assert.ok(source);
    const adapter = createAdapter(win.document); const snapshot = adapter.read(); adapter.destroy();
    assert.equal(snapshot.kind, kind, 'Static sample route classification is wrong');
    if (kind === 'note') assert.ok(snapshot.text.length > 0 || snapshot.comments.length > 0, 'Detail extraction returned no readable data');
    if (name.includes('search-empty')) assert.equal(snapshot.empty, true);
    else if (kind !== 'note') assert.ok(snapshot.entries.length > 0, 'List extraction returned no entries');
    // Automatic 2000 pictures must remain offline, including when private captures contain URLs.
    t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
    const original = source.innerHTML; const rewind = mount(t, win, { initial: era });
    assert.ok(reader(win.document).textContent.trim().length > 0, 'Historical document must not be empty'); assert.equal(source.inert, true);
    assert.equal(rootOf(win.document).querySelector('video,iframe,.note-detail-mask,.swiper-wrapper'), null);
    if (era === '1985') {
      assert.ok(rootOf(win.document).querySelector('form.terminal-command input[name="command"]'));
      assert.equal(reader(win.document).querySelector('img,canvas,video'), null);
    }
    rewind.setEra('now');
    // A boolean comparison prevents a failure from printing private captured text.
    assert.equal(source.innerHTML === original, true, 'Source content changed during reversible presentation'); assert.equal(source.inert, false);
  });
}

test('all seven discrete controls preserve their era and keep fixed panel dimensions', t => {
  for (const value of ['2005', '2010', '2015']) assert.equal(normalizeEra(value), value);
  assert.equal(normalizeEra('1985'), '1985'); assert.equal(normalizeEra('1995'), '1995'); assert.equal(normalizeEra('2000'), '2000');
  assert.equal(normalizeEra('1991'), '1985', 'Persisted retired era must migrate to the terminal era');
  for (const value of [undefined, null, '1992', 1985, {}, 'now']) assert.equal(normalizeEra(value), 'now');
  const win = fixture(2); const doc = win.document; const saved = [];
  mount(t, win, { initial: normalizeEra('1991'), open: true, save: value => saved.push(value) });
  const panel = doc.querySelector('rednote-rewind-control').shadowRoot; const slider = panel.querySelector('input');
  assert.equal(slider.max, '6'); assert.equal(slider.value, '0');
  assert.equal(slider.getAttribute('aria-valuetext'), '一九八五年');
  assert.match(reader(doc).getAttribute('aria-label'), /一九八五年/);
  const size = () => ['width', 'height', 'padding'].map(key => win.getComputedStyle(panel.querySelector('section'))[key]);
  const dimensions = size();
  for (const era of ['1985', '1995', '2000', '2005', '2010', '2015', 'now', '1985']) {
    panel.querySelector(`[data-value="${era}"]`).click(); assert.deepEqual(size(), dimensions);
    assert.equal(panel.querySelector('output').textContent, era);
    assert.equal(slider.value, String(['1985', '1995', '2000', '2005', '2010', '2015', 'now'].indexOf(era)));
    const logos = [panel, doc.querySelector('rednote-rewind-document')?.shadowRoot].flatMap(root => [...(root?.querySelectorAll('[data-era-logo]') || [])]);
    assert.equal(logos.length, era === '1985' || era === 'now' ? 0 : 2);
    for (const logo of logos) assert.equal(logo.getAttribute('src'), `/logos/eras/${era}.png`);
  }
  slider.value = '1'; slider.dispatchEvent(new win.Event('input'));
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, '1995');
  assert.deepEqual(saved, ['1985', '1995', '2000', '2005', '2010', '2015', 'now', '1985', '1995']);
});

test('1985 explicit terminal commands retain source isolation, pages and position across historical switches', async t => {
  const win = fixture(); const doc = win.document; const rewind = mount(t, win, { initial: '1985' });
  const source = doc.querySelector('#app'); const host = doc.querySelector('rednote-rewind-document');
  const sourceMarkup = source.innerHTML; const first = labels(doc);
  assert.ok(rootOf(doc).querySelector('form.terminal-command input'));
  assert.equal(reader(doc).querySelector('img,canvas,video'), null);
  assert.equal(reader(doc).querySelector('[data-action="previous"]').getAttribute('aria-disabled'), 'true');
  action(doc, 'previous'); assert.deepEqual(labels(doc), first);
  action(doc, 'next'); const second = labels(doc); reader(doc).scrollTop = 130;
  appendNotes(doc, 24, 3); reader(doc).dispatchEvent(new win.Event('scroll')); await settle();
  assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 130);
  const states = [];
  const observer = new win.MutationObserver(records => records.forEach(record => states.push(record.oldValue)));
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-rednote-rewind-era'], attributeOldValue: true });
  rewind.setEra('1995');
  assert.equal(doc.querySelector('rednote-rewind-document'), host); assert.equal(source.inert, true);
  assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 130);
  assert.ok(reader(doc).querySelector('form'));
  rewind.setEra('1985'); await settle(); observer.disconnect();
  assert.deepEqual(states, ['1985', '1995']); assert.equal(source.inert, true);
  assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 130);
  const portal = doc.createElement('aside'); doc.body.append(portal); await settle(); assert.equal(portal.inert, true);
  rewind.setEra('now'); assert.equal(source.inert, false); assert.equal(portal.inert, false);
  assert.equal(doc.querySelector('rednote-rewind-document'), null);
  assert.equal(source.innerHTML.startsWith(sourceMarkup.slice(0, 100)), true);
});

function command(doc, value) {
  const form = rootOf(doc).querySelector('form.terminal-command');
  assert.ok(form, 'The terminal needs a command prompt');
  form.querySelector('input[name="command"]').value = value;
  form.dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }));
  noPageEraShortcuts(doc);
}

test('1985 command search submits through the original route while preserving its input draft', async t => {
  const win = fixture(2); const doc = win.document; const source = doc.querySelector('#app');
  const originalInput = source.querySelector('input'); originalInput.value = '原站草稿';
  const target = doc.createElement('a');
  target.href = '/search_result?keyword=%E5%92%96%E5%95%A1&source=web_explore_feed'; source.append(target);
  let submissions = 0;
  target.addEventListener('click', event => { event.preventDefault(); submissions++; win.history.pushState(null, '', target.href); });
  mount(t, win, { initial: '1985' });
  assert.equal(rootOf(doc).querySelector('.search-panel'), null);
  assert.equal(reader(doc).querySelector('form[role="search"]').hidden, true);
  command(doc, 'S 咖啡');
  assert.equal(submissions, 1);
  assert.equal(originalInput.value, '原站草稿'); assert.equal(source.inert, true);
  await waitForMailbox(); assert.equal(reader(doc).querySelector('h2').textContent, '检索结果');
  assert.ok(rootOf(doc).querySelector('form.terminal-command'));
  command(doc, 'S');
  const search = reader(doc).querySelector('form[role="search"]');
  assert.equal(search.hidden, true); assert.equal(rootOf(doc).querySelector('input[name=command]').value, 'S ');
  assert.match(rootOf(doc).querySelector('.terminal-command-status').textContent, /检索词/);
});

test('1985 numbered selection, help and invalid commands perform deliberate actions only', async t => {
  const win = fixture(3); const doc = win.document; let opens = 0;
  doc.querySelectorAll('a.cover').forEach((link, index) => link.addEventListener('click', event => {
    event.preventDefault(); opens++; assert.equal(index, 1); win.history.pushState(null, '', link.href);
  }));
  mount(t, win, { initial: '1985' });
  assert.equal(reader(doc).querySelector('.terminal-help').hidden, true);
  command(doc, '?'); assert.equal(reader(doc).querySelector('.terminal-help').hidden, false);
  command(doc, '?'); assert.equal(reader(doc).querySelector('.terminal-help').hidden, true);
  command(doc, '20'); assert.equal(opens, 0);
  assert.match(rootOf(doc).querySelector('.terminal-command-status').textContent, /已有/);
  command(doc, 'unknown'); assert.equal(opens, 0);
  assert.match(rootOf(doc).querySelector('.terminal-command-status').textContent, /未知命令/);
  command(doc, '2'); assert.equal(opens, 1); assert.equal(win.location.pathname, '/explore/note2');
  assert.equal(doc.querySelector('#app').inert, true);
});

test('1985 W opens only the official publishing entrance through an explicit command', t => {
  const win = fixture(2); const doc = win.document; const opened = [];
  t.mock.method(win, 'open', (url, target, features) => { opened.push({ url, target, features }); return null; });
  mount(t, win, { initial: '1985' }); assert.equal(opened.length, 0);
  command(doc, 'W'); assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'https://creator.xiaohongshu.com/');
  assert.equal(opened[0].target, '_blank'); assert.equal(opened[0].features.includes('noopener'), true);
  assert.equal(doc.querySelector('#app').inert, true);
});

test('1985 O rereads changed source only after the user requests it', async t => {
  const win = fixture(3); const doc = win.document; mount(t, win, { initial: '1985' });
  const before = labels(doc);
  doc.querySelector('.note-item .title').textContent = '后台修订后的文稿';
  await settle(); assert.deepEqual(labels(doc), before);
  command(doc, 'O'); assert.equal(labels(doc)[0], '后台修订后的文稿');
  assert.equal(doc.querySelector('#app').inert, true);
});

for (const [code, route] of [['I', '/chat'], ['T', '/notification']]) test(`1985 ${code} navigates through the matching native directory link`, t => {
  const win = fixture(2); const doc = win.document; const source = doc.querySelector('#app');
  let clicks = 0;
  let link = source.querySelector(`a[href="${route}"]`);
  if (!link) { link = doc.createElement('a'); link.href = route; source.append(link); }
  link.addEventListener('click', event => { event.preventDefault(); clicks++; win.history.pushState(null, '', route); });
  mount(t, win, { initial: '1985' }); assert.equal(clicks, 0);
  command(doc, code); assert.equal(clicks, 1); assert.equal(win.location.pathname, route);
  assert.equal(source.inert, true);
});

test('1985 terminal keyboard focuses the command prompt without intercepting comment text or the era slider', async t => {
  const win = noteFixture(); const doc = win.document; const rewind = mount(t, win, { initial: '1985' });
  await Promise.resolve();
  let root = rootOf(doc); let prompt = rootOf(doc).querySelector('input[name="command"]');
  assert.equal(root.activeElement, prompt);
  const scene = rootOf(doc).querySelector('.terminal-scene[data-crt-scene]'); assert.ok(scene);
  assert.equal(reader(doc).parentElement.classList.contains('crt-glass'), true);
  prompt.blur();
  reader(doc).dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  assert.equal(root.activeElement, prompt); assert.equal(prompt.value, 'a');
  command(doc, 'R'); await Promise.resolve();
  root = rootOf(doc); prompt = rootOf(doc).querySelector('input[name="command"]');
  const draft = reader(doc).querySelector('[data-compose] textarea'); draft.value = '未发送的文字'; draft.focus();
  draft.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
  assert.equal(root.activeElement, draft); assert.equal(prompt.value, ''); assert.equal(draft.value, '未发送的文字');
  rewind.togglePanel();
  const panel = doc.querySelector('rednote-rewind-control').shadowRoot; const slider = panel.querySelector('input[type="range"]');
  slider.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true, cancelable: true }));
  assert.equal(panel.activeElement, slider); assert.equal(prompt.value, '');
});

test('1985 reuses its CRT chassis outside the reading scroller and restores that scroller on a later era', t => {
  const win = noteFixture(); const doc = win.document;
  t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  const rewind = mount(t, win, { initial: '1985' });
  const root = rootOf(doc); const main = reader(doc); const chassis = root.querySelector('[data-crt-scene]');
  assert.ok(chassis); assert.equal(main.parentElement.classList.contains('crt-glass'), true);
  assert.equal(chassis.parentNode, root); assert.equal(main.contains(chassis), false);
  assert.equal(root.querySelectorAll('[data-crt-scene]').length, 1);
  doc.querySelector('#detail-desc').textContent = Array.from({ length: 200 }, (_, i) => `长文第 ${i + 1} 行。`).join('\n');
  command(doc, 'O');
  assert.equal(root.querySelector('[data-crt-scene]'), chassis, 'Rereading long content must reuse the chassis');
  assert.equal(reader(doc), main); assert.equal(main.parentElement.classList.contains('crt-glass'), true);
  assert.equal(root.querySelectorAll('form.terminal-command').length, 1, 'Rereading must not leave an old fixed command prompt');
  command(doc, 'R'); assert.equal(root.querySelector('[data-crt-scene]'), chassis);
  command(doc, 'B'); assert.equal(root.querySelector('[data-crt-scene]'), chassis);
  rewind.setEra('2000'); assert.equal(reader(doc), main); assert.equal(main.parentNode, root);
  assert.equal(root.querySelector('[data-crt-scene]'), null);
  assert.equal(chassis.isConnected, false);
  assert.equal(root.querySelector('form.terminal-command'), null);
  noPageEraShortcuts(doc);
});

test('the historical font uses the extension asset resolver and disposal removes only its own declaration', t => {
  const win = fixture(2); const doc = win.document; const retained = doc.createElement('style');
  retained.textContent = 'body { color: black; }'; doc.head.append(retained);
  const paths = [];
  const rewind = mount(t, win, { initial: '1985', resolveAssetURL: path => {
    paths.push(path); return `chrome-extension://synthetic-extension${path}`;
  } });
  const face = doc.head.querySelector('style[data-rewind-font="fusion-pixel"]'); assert.ok(face);
  assert.equal(paths.length, 1); assert.match(paths[0], /^\/fonts\/.+\.woff2$/);
  assert.equal(face.textContent.includes(`chrome-extension://synthetic-extension${paths[0]}`), true);
  assert.equal(face.textContent.includes('SIL OPEN FONT LICENSE'), true);
  rewind.destroy(); assert.equal(face.isConnected, false); assert.equal(retained.isConnected, true);
  assert.equal(retained.textContent, 'body { color: black; }');
});

function noteFixture() {
  const win = makeWindow('/explore/article'); const doc = win.document;
  doc.body.innerHTML = '<main id="app"><section class="note-container"><div class="media-container"><div class="note-slider-img"><img src="https://example.test/picture.jpg" width="600" height="400"></div></div><div class="note-content"><h1 id="detail-title">文章题目</h1><div id="detail-desc">只属于文章的正文</div><div class="comments-el"></div></div></section></main>';
  for (let i = 1; i <= 12; i++) {
    const comment = doc.createElement('div'); comment.className = 'comment-item';
    comment.innerHTML = `<div class="author"><a class="name" href="/user/profile/reader">读者</a></div><div class="content">答复 ${i}</div><div class="date">昨日</div>`;
    doc.querySelector('.comments-el').append(comment);
  }
  return win;
}

test('1985 answers replace the article document and return to its original position', t => {
  const win = noteFixture(); const doc = win.document; mount(t, win, { initial: '1985' }); reader(doc).scrollTop = 175;
  command(doc, 'R'); assert.equal(reader(doc).textContent.includes('只属于文章的正文'), false);
  assert.equal(reader(doc).querySelectorAll('[data-discussion] [data-comment]').length, 10);
  assert.ok(reader(doc).querySelector('[data-compose] textarea'));
  assert.equal(reader(doc).querySelector('img,canvas,video'), null);
  command(doc, 'N'); assert.equal(reader(doc).querySelectorAll('[data-discussion] [data-comment]').length, 2);
  command(doc, 'B'); assert.equal(reader(doc).textContent.includes('只属于文章的正文'), true);
  assert.equal(reader(doc).querySelector('[data-discussion]'), null); assert.equal(reader(doc).scrollTop, 175);
});

test('1985 files remain a terminal directory and never request or inherit inline pictures', t => {
  const win = noteFixture(); const doc = win.document; const requests = [];
  t.mock.setter(win.HTMLImageElement.prototype, 'src', value => requests.push(value));
  const rewind = mount(t, win, { initial: '1985' });
  assert.equal(requests.length, 0); assert.equal(reader(doc).querySelector('img,canvas'), null);
  reader(doc).scrollTop = 99; command(doc, 'F');
  assert.equal(requests.length, 0); assert.equal(reader(doc).textContent.includes('只属于文章的正文'), false);
  assert.ok(reader(doc).querySelector('.terminal-files'));
  assert.equal(reader(doc).querySelector('img,canvas,video'), null);
  command(doc, 'B'); assert.equal(reader(doc).querySelector('img,canvas'), null); assert.equal(reader(doc).scrollTop, 99);
  rewind.setEra('1995'); action(doc, 'images'); assert.ok(reader(doc).querySelector('[data-period-image]'));
  rewind.setEra('1985'); assert.equal(reader(doc).querySelector('img,canvas'), null);
  rewind.setEra('1995'); assert.ok(reader(doc).querySelector('[data-period-image]'));
});

test('1985 mailbox text links keep conversation, pagination and source identity through era changes', async t => {
  const chat = chatFixture(); chat.addConversation('测试联系人', 1, () => chat.list.replaceChildren(...Array.from({ length: 12 }, (_, i) => chat.message(`记录 ${i + 1}`))));
  const rewind = mount(t, chat.win, { initial: '1985' }); await waitForMailbox();
  assert.equal(mailbox(chat.doc).querySelector('[data-mail-action="open"]').tagName, 'A');
  mailAction(chat.doc, 'open'); await waitForMailbox(); mailAction(chat.doc, 'next');
  const second = mailTexts(chat.doc); assert.deepEqual(second, ['记录 2', '记录 1']); const originalMailbox = mailbox(chat.doc);
  rewind.setEra('1995'); assert.equal(mailbox(chat.doc), originalMailbox); assert.deepEqual(mailTexts(chat.doc), second);
  assert.equal(mailbox(chat.doc).querySelector('[data-mail-action="back"]').tagName, 'BUTTON');
  rewind.setEra('1985'); assert.equal(mailbox(chat.doc), originalMailbox); assert.deepEqual(mailTexts(chat.doc), second);
  assert.ok(rootOf(chat.doc).querySelector('form.terminal-command')); assert.equal(chat.source.inert, true);
  mailAction(chat.doc, 'back'); await waitForMailbox(); assert.equal(chat.win.location.pathname, '/chat');
  assert.equal(mailRows(chat.doc).length, 1); assert.equal(chat.sends(), 0);
});

test('1985 notification category changes retain their pending identity fence across era switches', async t => {
  const notifications = notificationFixture(); notifications.list.append(notifications.record('旧分类内容'));
  const rewind = mount(t, notifications.win, { initial: '1985' }); await waitForMailbox();
  const category = [...mailbox(notifications.doc).querySelectorAll('[data-mail-action="category"]')].find(link => link.textContent === '赞和收藏');
  assert.equal(category.tagName, 'A'); category.click();
  rewind.setEra('1995'); rewind.setEra('1985'); await waitForMailbox();
  assert.equal(mailRows(notifications.doc).length, 0);
  notifications.list.replaceChildren(notifications.record('新分类内容')); await waitForMailbox();
  assert.equal(mailTexts(notifications.doc)[0].includes('新分类内容'), true);
  assert.ok(rootOf(notifications.doc).querySelector('form.terminal-command'));
  assert.equal(reader(notifications.doc).querySelector('img,canvas,video'), null); assert.equal(notifications.writes(), 0);
});

for (const era of ['1985', '2000']) test(`startup hands off to actual ${era} and restores the source after disposal`, t => {
  const win = fixture(3); const doc = win.document; const guard = createStartupGuard(doc); t.after(() => guard.release());
  const rewind = mount(t, win, { initial: normalizeEra(era) });
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, era);
  assert.ok(reader(doc)); guard.release();
  assert.equal(doc.querySelector('#app').inert, true); assert.equal(doc.querySelector('rednote-rewind-startup'), null);
  assert.equal(win.getComputedStyle(doc.querySelector('#app')).visibility, 'hidden', 'Removing the startup cover must leave the source hidden');
  if (era === '1985') assert.ok(rootOf(doc).querySelector('form.terminal-command'));
  else assert.ok(reader(doc).querySelector('.portal-content table.topic-table'));
  rewind.destroy(); assert.equal(doc.querySelector('#app').inert, false);
  assert.equal(doc.querySelector('rednote-rewind-document,style[data-rednote-rewind="document"]'), null);
});

test('an old era pagination request cannot advance the new era when source data arrives later', async t => {
  const win = fixture(3); const doc = win.document; const rewind = mount(t, win, { initial: '1985' });
  const first = labels(doc); action(doc, 'next'); assert.match(reader(doc).querySelector('.status').textContent, /正在读取下一页/);
  rewind.setEra('1995'); appendNotes(doc, 4, 10); await waitForMailbox();
  assert.deepEqual(labels(doc), first);
  action(doc, 'next'); assert.equal(labels(doc)[0], '条目 4');
  rewind.setEra('1985'); assert.deepEqual(labels(doc), first);
});

test('2000 portal shows fixed topic pages and never appends rows on scroll or source additions', async t => {
  const win = fixture(23); const doc = win.document; const rewind = mount(t, win, { initial: '2000' });
  assert.ok(reader(doc).querySelector('.portal-layout .portal-side'));
  assert.ok(reader(doc).querySelector('.portal-layout .portal-content table.topic-table'));
  assert.equal(labels(doc).length, 10); const first = labels(doc); reader(doc).scrollTop = 118;
  appendNotes(doc, 24, 4); reader(doc).dispatchEvent(new win.Event('scroll')); await settle();
  assert.deepEqual(labels(doc), first); assert.equal(reader(doc).scrollTop, 118);
  action(doc, 'next'); assert.deepEqual(labels(doc), Array.from({ length: 10 }, (_, i) => `条目 ${i + 11}`));
  action(doc, 'next'); assert.deepEqual(labels(doc), Array.from({ length: 7 }, (_, i) => `条目 ${i + 21}`));
  action(doc, 'previous'); action(doc, 'previous'); assert.deepEqual(labels(doc), first);
  assert.equal(reader(doc).scrollTop, 118); rewind.setEra('now'); assert.equal(doc.querySelector('#app').inert, false);
});

test('2000 search submits through the source while preserving its input draft and historical cover', async t => {
  const win = fixture(2); const doc = win.document; const source = doc.querySelector('#app');
  const input = source.querySelector('input'); input.value = '未提交的原站内容';
  const sourceSearch = doc.createElement('a'); sourceSearch.href = '/search_result?keyword=%E5%92%96%E5%95%A1&source=web_explore_feed'; source.append(sourceSearch);
  let searches = 0;
  sourceSearch.addEventListener('click', event => { event.preventDefault(); searches++; win.history.pushState(null, '', sourceSearch.href); });
  mount(t, win, { initial: '2000' });
  const form = reader(doc).querySelector('form[role="search"]'); assert.ok(form);
  form.querySelector('input[name="keyword"]').value = '咖啡'; form.dispatchEvent(new win.Event('submit', { cancelable: true }));
  assert.equal(searches, 1); assert.equal(input.value, '未提交的原站内容'); assert.equal(source.inert, true);
  await waitForMailbox();
  assert.ok(reader(doc).querySelector('table.topic-table'));
  assert.equal(doc.documentElement.dataset.rednoteRewindEra, '2000');
  assert.equal(reader(doc).querySelector('form input[name="keyword"]').value, '咖啡');
});

test('2000 category links activate the real source and fence old rows during a same-URL category transition', async t => {
  const win = fixture(12); const doc = win.document; const source = doc.querySelector('#app');
  const channels = doc.createElement('div'); channels.className = 'channel-container';
  channels.innerHTML = '<span class="channel active">推荐</span><span class="channel">美食</span>'; source.prepend(channels);
  let activations = 0;
  channels.querySelectorAll('.channel').forEach(channel => channel.addEventListener('click', () => {
    activations++; channels.querySelectorAll('.channel').forEach(node => node.classList.remove('active')); channel.classList.add('active');
  }));
  const rewind = mount(t, win, { initial: '1985' }); rewind.setEra('2000');
  const choices = [...reader(doc).querySelectorAll('[data-channel]')];
  assert.equal(choices.length, 2); assert.equal(choices[0].disabled, true); choices[1].click();
  assert.equal(activations, 1); assert.equal(win.location.pathname, '/explore'); assert.equal(labels(doc).length, 0);
  rewind.setEra('1985'); rewind.setEra('1995'); rewind.setEra('2000'); await waitForMailbox();
  assert.equal(labels(doc).length, 0, 'A selected category must not show rows from the previous category');
  appendNotes(doc, 13, 2); await waitForMailbox();
  assert.equal(labels(doc).length, 0, 'An old feed appending records must not complete a category transition');
  doc.querySelector('.feeds-container').replaceChildren(); appendNotes(doc, 90, 12); await waitForMailbox();
  assert.deepEqual(labels(doc), Array.from({ length: 10 }, (_, i) => `条目 ${i + 90}`));
  assert.equal(reader(doc).querySelector('.portal-content h2').textContent.includes('美食'), true);
  action(doc, 'next'); assert.deepEqual(labels(doc), ['条目 100', '条目 101']); assert.equal(source.inert, true);
  for (const era of ['1985', '1995', '2000']) {
    rewind.setEra(era); assert.deepEqual(labels(doc), ['条目 100', '条目 101'], 'Switching eras must retain the new category rather than restore an old same-URL cache');
  }
  rewind.setEra('now'); channels.children[0].click();
  doc.querySelector('.feeds-container').replaceChildren(); appendNotes(doc, 140, 2);
  rewind.setEra('2000'); assert.deepEqual(labels(doc), ['条目 140', '条目 141'], 'Returning from now must read its active category');
});

test('2000 category extraction excludes primary actions, tooltips and mobile-only channels', t => {
  const win = fixture(2); const doc = win.document;
  doc.querySelector('#app').insertAdjacentHTML('afterbegin', '<div class="channel-list"><div class="channel-item">发布</div><div class="channel">消息</div></div><div class="channel-container"><div class="channel"><div class="channel-content active">推荐</div><div class="tooltip-wrapper">为你推荐更多精彩</div></div><div class="channel"><div class="channel-content">美食</div></div><div class="channel channel--mobile-only"><div class="channel-content">视频</div></div></div>');
  mount(t, win, { initial: '2000' });
  const choices = [...reader(doc).querySelectorAll('[data-channel]')];
  assert.deepEqual(choices.map(node => node.textContent), ['推荐', '美食']);
  assert.equal(choices[0].disabled, true); assert.equal(choices[1].disabled, false);
  assert.equal(reader(doc).querySelector('.portal-content h2').textContent, '推荐栏目');
});

test('2000 category timeout cannot reinterpret the previous feed as the newly selected category', async t => {
  const win = fixture(12); const doc = win.document; const channels = doc.createElement('div'); channels.className = 'channel-container';
  channels.innerHTML = '<span class="channel active">推荐</span><span class="channel">美食</span>'; doc.querySelector('#app').prepend(channels);
  channels.querySelectorAll('.channel').forEach(channel => channel.addEventListener('click', () => {
    channels.querySelectorAll('.channel').forEach(node => node.classList.remove('active')); channel.classList.add('active');
  }));
  mount(t, win, { initial: '2000' }); [...reader(doc).querySelectorAll('[data-channel]')][1].click();
  assert.equal(labels(doc).length, 0); const future = Date.now() + 11000; t.mock.method(Date, 'now', () => future);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(labels(doc).length, 0, 'Old feed records must stay hidden when the new category times out');
  assert.equal(reader(doc).querySelector('.portal-content h2').textContent.includes('美食'), true);
  assert.equal(reader(doc).querySelector('.status').textContent.includes('未能取得'), true);
});

test('2000 ignores source attachment credentials before rendering or issuing an image request', t => {
  const win = noteFixture(); const doc = win.document; const image = doc.querySelector('.note-slider-img img');
  image.setAttribute('src', 'https://synthetic-user:synthetic-password@example.test/picture.jpg');
  const requests = []; t.mock.setter(win.HTMLImageElement.prototype, 'src', value => { if (!value.startsWith('/logos/eras/')) requests.push(value); });
  const adapter = createAdapter(doc); t.after(() => adapter.destroy()); assert.equal(adapter.read().images.length, 0);
  mount(t, win, { initial: '2000' }); assert.equal(requests.length, 0); assert.equal(reader(doc).querySelector('[data-period-image]'), null);
});

test('2000 note attachments open automatically while historical answer pages remain explicitly paginated', async t => {
  const win = noteFixture(); const doc = win.document; const requests = [];
  doc.querySelector('.note-slider-img img').setAttribute('src', 'https://ci.xhscdn.com/fixture-picture.jpg');
  const author = doc.createElement('div'); author.className = 'author';
  author.innerHTML = '<a class="name" href="/user/profile/writer">作者资料</a>'; doc.querySelector('.note-container').prepend(author);
  t.mock.setter(win.HTMLImageElement.prototype, 'src', value => requests.push(value));
  const rewind = mount(t, win, { initial: '2000' });
  const article = reader(doc).querySelector('article.portal-article');
  assert.ok(article);
  assert.ok(article.querySelector('a[href*="/user/profile/writer"]'));
  assert.equal(article.querySelector('.body').closest('td'), null, 'Portal body must not be squeezed beside an author cell');
  assert.ok(reader(doc).querySelector('[data-period-image]')); assert.equal(requests.length > 0, true);
  reader(doc).scrollTop = 77;
  doc.querySelector('rednote-rewind-control').shadowRoot.querySelector('.speed').click();
  assert.equal(reader(doc).scrollTop, 77);
  assert.equal(reader(doc).querySelector('.read-options,[data-action=slow-images]'), null);
  action(doc, 'comments');
  const answers = () => [...reader(doc).querySelectorAll('[data-discussion] [data-comment] .body')].map(node => node.textContent);
  assert.deepEqual(answers(), Array.from({ length: 10 }, (_, i) => `答复 ${i + 1}`));
  const first = answers(); reader(doc).dispatchEvent(new win.Event('scroll')); await settle(); assert.deepEqual(answers(), first);
  action(doc, 'comments-next'); assert.deepEqual(answers(), ['答复 11', '答复 12']);
  action(doc, 'comments-previous'); assert.deepEqual(answers(), first);
  rewind.setEra('1985'); assert.equal(reader(doc).querySelector('img,canvas,[data-period-image],article.portal-article'), null);
  rewind.setEra('1995'); assert.equal(reader(doc).querySelector('[data-period-image],article.portal-article'), null);
  rewind.setEra('2000'); assert.ok(reader(doc).querySelector('article.portal-article'));
});

test('2000 guide captions do not duplicate the paginated directory and its columns align explicitly', t => {
  const win = fixture(12); const doc = win.document;
  t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  doc.querySelectorAll('a.cover img').forEach((img, index) => {
    img.setAttribute('src', `https://example.test/thumbnail-${index}.jpg`);
    img.width = 400; img.height = 300;
  });
  mount(t, win, { initial: '2000' });
  assert.equal(labels(doc).length, 10);
  assert.ok(reader(doc).querySelector('.picture-guide a'));
  assert.equal(reader(doc).querySelector('.picture-guide [data-entry]'), null);
  const table = reader(doc).querySelector('table.topic-table');
  const columns = [...table.querySelectorAll('colgroup > col')];
  assert.equal(columns.length, table.querySelectorAll('thead th').length);
  assert.equal(columns.every(col => !!col.style.width), true);
  const widths = columns.map(col => Number.parseFloat(col.style.width));
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100);
  for (const row of table.querySelectorAll('tbody > tr')) assert.equal(row.children.length, columns.length);
  action(doc, 'next'); assert.deepEqual(labels(doc), ['条目 11', '条目 12']);
});

for (const era of ['1985', '1995', '2000', '2005', '2010', '2015']) test(`${era} exposes the official publishing entrance without implementing its editor`, t => {
  const win = fixture(2); const doc = win.document; const opened = [];
  if (era === '1985') t.mock.method(win, 'open', (url, target, features) => {
    opened.push({ url, target, features }); return null;
  });
  mount(t, win, { initial: era });
  const creator = [...reader(doc).querySelectorAll('a')].find(link => {
    try { return new URL(link.href).hostname === 'creator.xiaohongshu.com'; } catch { return false; }
  });
  if (era === '1985') {
    // The separate W test verifies the command itself. Here its role is the
    // terminal's sole publishing entrance, instead of a modern clickable link.
    assert.equal(creator, undefined); assert.equal(opened.length, 0);
    command(doc, 'W'); assert.equal(opened.length, 1);
    assert.equal(opened[0].url, 'https://creator.xiaohongshu.com/');
    assert.equal(opened[0].target, '_blank'); assert.equal(opened[0].features.includes('noopener'), true);
  } else {
    assert.ok(creator); assert.equal(creator.target, '_blank');
    assert.equal(creator.rel.includes('noopener'), true);
  }
  assert.equal(reader(doc).querySelector('[contenteditable]'), null);
});

test('all historical eras keep the same source shield and independent directory position before now restoration', async t => {
  const win = fixture(23); const doc = win.document; const source = doc.querySelector('#app');
  const draft = source.querySelector('input'); draft.value = '原有输入'; let clicks = 0;
  source.querySelector('#original').addEventListener('click', () => clicks++);
  const rewind = mount(t, win, { initial: '1985' }); const host = doc.querySelector('rednote-rewind-document');
  action(doc, 'next'); const second = labels(doc); reader(doc).scrollTop = 97;
  const sourceStates = []; const observer = new win.MutationObserver(records => records.forEach(record => sourceStates.push(record.oldValue)));
  observer.observe(source, { attributes: true, attributeFilter: ['aria-hidden'], attributeOldValue: true });
  for (const era of ['1995', '2000', '1985', '2000']) {
    rewind.setEra(era); assert.equal(doc.querySelector('rednote-rewind-document'), host);
    assert.equal(source.inert, true); assert.equal(source.getAttribute('aria-hidden'), 'true');
    assert.deepEqual(labels(doc), second); assert.equal(reader(doc).scrollTop, 97);
    assert.equal(Boolean(reader(doc).querySelector('table.topic-table')), era === '2000');
  }
  await settle(); observer.disconnect(); assert.deepEqual(sourceStates, [], 'Historical switches must never release the original site');
  rewind.setEra('now'); assert.equal(source.inert, false); assert.equal(source.hasAttribute('aria-hidden'), false);
  assert.equal(draft.value, '原有输入'); source.querySelector('#original').click(); assert.equal(clicks, 1);
  assert.equal(doc.querySelector('rednote-rewind-document'), null);
});

test('2000 mailbox tables retain a conversation and its page through all historical era changes', async t => {
  const chat = chatFixture(); chat.addConversation('测试联系人', 1, () => chat.list.replaceChildren(...Array.from({ length: 12 }, (_, i) => chat.message(`记录 ${i + 1}`))));
  const rewind = mount(t, chat.win, { initial: '2000' }); await waitForMailbox();
  assert.ok(mailbox(chat.doc).querySelector('table.mail-table [data-mail-item] .body'));
  mailAction(chat.doc, 'open'); await waitForMailbox(); mailAction(chat.doc, 'next');
  const second = mailTexts(chat.doc); assert.deepEqual(second, ['记录 2', '记录 1']); const originalMailbox = mailbox(chat.doc);
  for (const era of ['1985', '1995', '2000']) {
    rewind.setEra(era); assert.equal(mailbox(chat.doc), originalMailbox); assert.deepEqual(mailTexts(chat.doc), second);
    assert.equal(chat.win.location.pathname, '/chat/conversation1'); assert.equal(chat.source.inert, true);
    assert.equal(Boolean(mailbox(chat.doc).querySelector('table.mail-table')), era === '2000');
  }
  mailAction(chat.doc, 'back'); await waitForMailbox(); assert.equal(chat.win.location.pathname, '/chat'); assert.equal(mailRows(chat.doc).length, 1);
  assert.equal(chat.sends(), 0); assert.equal(mailbox(chat.doc).textContent.includes('TEST_UNSENT_DRAFT'), false);
});

test('2000 pending correspondent and notification identities survive era changes without showing old records', async t => {
  const chat = chatFixture(); const firstContact = chat.addConversation('甲', 1);
  firstContact.classList.add('active'); chat.doc.querySelector('.xhs-im-chat-window__header-name').textContent = '甲';
  chat.list.replaceChildren(chat.message('旧联系人记录')); chat.addConversation('乙', 2);
  const rewind = mount(t, chat.win, { initial: '2000' }); await waitForMailbox();
  const target = [...mailbox(chat.doc).querySelectorAll('[data-mail-action="open"]')].find(node => node.textContent.startsWith('乙')); assert.ok(target); target.click();
  rewind.setEra('1985'); rewind.setEra('1995'); rewind.setEra('2000'); await waitForMailbox();
  assert.equal(mailRows(chat.doc).length, 0); assert.equal(mailbox(chat.doc).textContent.includes('旧联系人记录'), false);
  chat.list.replaceChildren(chat.message('新联系人记录')); await waitForMailbox(); assert.deepEqual(mailTexts(chat.doc), ['新联系人记录']);
  assert.equal(chat.sends(), 0);

  const notifications = notificationFixture(); notifications.list.append(notifications.record('旧分类记录'));
  const notificationRewind = mount(t, notifications.win, { initial: '2000' }); await waitForMailbox();
  const category = [...mailbox(notifications.doc).querySelectorAll('[data-mail-action="category"]')].find(node => node.textContent === '赞和收藏'); assert.ok(category); category.click();
  notificationRewind.setEra('1985'); notificationRewind.setEra('1995'); notificationRewind.setEra('2000'); await waitForMailbox();
  assert.equal(mailRows(notifications.doc).length, 0); assert.equal(mailbox(notifications.doc).textContent.includes('旧分类记录'), false);
  notifications.list.replaceChildren(notifications.record('新分类记录')); await waitForMailbox();
  assert.equal(mailTexts(notifications.doc)[0].includes('新分类记录'), true); assert.equal(notifications.writes(), 0);
});


test('1985 help replaces the visible reading screen and returns to the same draft and position', t => {
  const win = noteFixture(); const doc = win.document; mount(t, win, { initial: '1985' });
  command(doc, 'R'); const main = reader(doc), screen = main.querySelector('.terminal-screen');
  const draft = main.querySelector('[data-compose] textarea'); draft.value = '未发送的答复';
  draft.dispatchEvent(new win.Event('input', { bubbles: true })); main.scrollTop = 241;
  command(doc, '?'); assert.equal(main.scrollTop, 0); assert.equal(screen.hidden, true);
  assert.equal(main.querySelector('.terminal-help').hidden, false);
  command(doc, 'B'); assert.equal(main.scrollTop, 241); assert.equal(screen.hidden, false);
  assert.equal(main.querySelector('[data-compose] textarea'), draft); assert.equal(draft.value, '未发送的答复');
});

test('1985 prose commands and page keys move only the reading pane and clamp at document boundaries', t => {
  const win = noteFixture(); const doc = win.document; mount(t, win, { initial: '1985' });
  const main = reader(doc); Object.defineProperty(main, 'clientHeight', { value: 400 });
  Object.defineProperty(main, 'scrollHeight', { value: 1000 });
  command(doc, 'N'); assert.equal(main.scrollTop, 364);
  command(doc, 'N'); assert.equal(main.scrollTop, 600);
  command(doc, 'N'); assert.equal(main.scrollTop, 600);
  assert.match(rootOf(doc).querySelector('.terminal-command-status').textContent, /末尾/);
  command(doc, 'P'); assert.equal(main.scrollTop, 236);
  const prompt = rootOf(doc).querySelector('input[name=command]'); prompt.value = 'S 未写完';
  prompt.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }));
  assert.equal(main.scrollTop, 0); assert.equal(prompt.value, 'S 未写完'); assert.equal(win.scrollY, 0);
  prompt.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
  assert.equal(main.scrollTop, 364); assert.equal(prompt.value, 'S 未写完');
});

test('1985 command history retains an unfinished query across recall without taking IME keys', t => {
  const win = fixture(3); const doc = win.document; mount(t, win, { initial: '1985' });
  command(doc, '?'); command(doc, 'B'); command(doc, 'O');
  const prompt = rootOf(doc).querySelector('input[name=command]'); prompt.value = 'S 未完成';
  const key = (value, composing = false) => prompt.dispatchEvent(new win.KeyboardEvent('keydown', { key: value, isComposing: composing, bubbles: true, cancelable: true }));
  key('ArrowUp', true); assert.equal(prompt.value, 'S 未完成');
  key('ArrowUp'); assert.equal(prompt.value, 'O'); key('ArrowUp'); assert.equal(prompt.value, 'B');
  key('ArrowDown'); assert.equal(prompt.value, 'O'); key('ArrowDown'); assert.equal(prompt.value, 'S 未完成');
});

test('1985 removes decorative keys and arbitrary tutorial topics while retaining real input', t => {
  const win = fixture(2); const doc = win.document; mount(t, win, { initial: '1985' }); const root = rootOf(doc);
  assert.equal(root.querySelector('.terminal-keyboard'), null); assert.ok(root.querySelector('input[name=command]'));
  assert.equal(root.querySelector('.terminal-notes').textContent.includes('咖啡'), false);
  assert.equal(root.querySelector('.terminal-help').textContent.includes('咖啡'), false);
  assert.equal(root.querySelector('.terminal-notes').parentElement.className, 'terminal-hardware');
});

test('1985 notification category commands use displayed ordering and do not invoke writing actions', async t => {
  const fixture = notificationFixture(); mount(t, fixture.win, { initial: '1985' }); await waitForMailbox();
  command(fixture.doc, 'C 2'); assert.equal(fixture.tabs[1].classList.contains('active'), true);
  assert.equal(fixture.writes(), 0); command(fixture.doc, 'C 99'); assert.equal(fixture.writes(), 0);
  assert.match(rootOf(fixture.doc).querySelector('.terminal-command-status').textContent, /分类序号/);
});

test('1985 A navigates to the current note author through the normal source link', t => {
  const win = noteFixture(); const doc = win.document; const author = doc.createElement('div'); author.className = 'author';
  author.innerHTML = '<a class="name" href="/user/profile/current-author">本文作者</a>';
  doc.querySelector('.note-container').prepend(author); let clicks = 0;
  author.querySelector('a').addEventListener('click', event => { event.preventDefault(); clicks++; win.history.pushState(null, '', '/user/profile/current-author'); });
  mount(t, win, { initial: '1985' }); command(doc, 'A');
  assert.equal(clicks, 1); assert.equal(win.location.pathname, '/user/profile/current-author'); assert.equal(doc.querySelector('#app').inert, true);
});

test('1985 V activates only the selected notification reading link', async t => {
  const fixture = notificationFixture(), record = fixture.record('阅读目标');
  record.querySelector('.extra a').href = '/explore/notification-target'; fixture.list.append(record);
  mount(t, fixture.win, { initial: '1985' }); await waitForMailbox(); command(fixture.doc, '1');
  const target = reader(fixture.doc).querySelector('[data-mail-target]'); assert.ok(target);
  assert.equal(new URL(target.href).pathname, '/explore/notification-target'); let clicks = 0;
  target.addEventListener('click', event => { event.preventDefault(); clicks++; });
  command(fixture.doc, 'V'); assert.equal(clicks, 1); assert.equal(fixture.writes(), 0);
});

for (const era of ['2010', '2015']) test(`${era} appends stream batches without replacing read rows or moving scroll`, t => {
  const win = fixture(23), doc = win.document; mount(t, win, { initial: era });
  const first = reader(doc).querySelector('[data-social-entry]'); reader(doc).scrollTop = 210;
  action(doc, 'next'); assert.equal(labels(doc).length, 20); assert.equal(reader(doc).scrollTop, 210);
  assert.equal(reader(doc).querySelector('[data-social-entry]'), first);
  action(doc, 'next'); assert.equal(labels(doc).length, 23);
  assert.equal(reader(doc).querySelector('[data-social-entry]'), first);
  assert.equal(new Set(labels(doc)).size, 23);
});

test('2005 remains explicitly paginated while 2010 and 2015 append on a downward near-bottom scroll', t => {
  const win = fixture(23), doc = win.document; const rewind = mount(t, win, { initial: '2005' });
  Object.defineProperty(reader(doc), 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(reader(doc), 'clientHeight', { configurable: true, value: 600 });
  reader(doc).scrollTop = 1200; reader(doc).dispatchEvent(new win.Event('scroll')); assert.equal(labels(doc).length, 10);
  for (const era of ['2010', '2015']) {
    rewind.setEra(era); const before = labels(doc).length;
    reader(doc).scrollTop += 50; reader(doc).dispatchEvent(new win.Event('scroll'));
    assert.equal(labels(doc).length, Math.min(before + 10, 23));
    const now = labels(doc).length; reader(doc).dispatchEvent(new win.Event('scroll')); assert.equal(labels(doc).length, now);
  }
});

for (const era of ['2010', '2015']) test(`${era} pending stream appends asynchronously and keeps its existing rows`, async t => {
  const win = fixture(10), doc = win.document; mount(t, win, { initial: era });
  const first = reader(doc).querySelector('[data-social-entry]');
  action(doc, 'next'); appendNotes(doc, 11, 3);
  await new Promise(resolve => setTimeout(resolve, 260));
  assert.equal(labels(doc).length, 13); assert.equal(reader(doc).querySelector('[data-social-entry]'), first);
  doc.querySelector('.feeds-container').insertAdjacentHTML('beforeend', '<div class="no-more">没有更多了</div>');
  action(doc, 'next'); assert.equal(reader(doc).querySelector('[data-action="next"]').disabled, true);
});

for (const era of ['2005', '2010', '2015']) test(`${era} details keep comments, drafts, native source and media isolated through era switches`, t => {
  const win = noteFixture(), doc = win.document; t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  const original = doc.querySelector('.note-container').innerHTML;
  const rewind = mount(t, win, { initial: era });
  assert.ok(reader(doc).querySelector('.social-note')); assert.ok(reader(doc).querySelector('[data-period-image]'));
  const compose = reader(doc).querySelector('[data-compose] textarea'); compose.value = '我的未提交评论😀'; compose.dispatchEvent(new win.Event('input'));
  assert.equal(reader(doc).querySelector('[data-action=comments]'), null);
  assert.equal(reader(doc).querySelectorAll('[data-comment]').length, 10);
  const media = reader(doc).querySelector('[data-period-image]');
  reader(doc).scrollTop = 280;
  action(doc, 'comments-next'); assert.equal(reader(doc).querySelectorAll('[data-comment]').length, era === '2005' ? 2 : 12);
  assert.equal(reader(doc).querySelector('[data-period-image]'), media);
  assert.equal(reader(doc).querySelector('[data-compose] textarea'), compose);
  assert.equal(reader(doc).scrollTop, 280);
  rewind.setEra('1985'); rewind.setEra(era);
  assert.equal(reader(doc).querySelector('[data-compose] textarea').value, '我的未提交评论😀');
  assert.ok(doc.querySelector('[data-rednote-rewind="document"]').textContent.includes(`[data-rednote-rewind-era="${era}"]`));
  rewind.setEra('now'); assert.equal(doc.querySelector('.note-container').innerHTML, original);
});

for (const era of ['2005', '2010', '2015']) test(`${era} inbox and notifications preserve pending identity without triggering any writes`, async t => {
  const f = chatFixture(); const { doc } = f;
  f.addConversation('甲', 1, () => f.list.replaceChildren(f.message('甲的记录')));
  f.addConversation('乙', 2, () => f.list.replaceChildren(f.message('乙的记录', true)));
  const rewind = mount(t, f.win, { initial: era }); await waitForMailbox();
  mailbox(doc).querySelector('[data-conversation]').click(); await waitForMailbox();
  assert.deepEqual(mailTexts(doc), ['甲的记录']);
  rewind.setEra('2015'); rewind.setEra(era); assert.deepEqual(mailTexts(doc), ['甲的记录']); assert.equal(f.sends(), 0);
  const n = notificationFixture(); n.list.append(n.record('当前通知')); mount(t, n.win, { initial: era }); await waitForMailbox();
  assert.deepEqual(mailTexts(n.doc), ['通知\n当前通知\n引用 1']); assert.equal(n.writes(), 0);
});

for (const era of ['2005', '2010', '2015']) test(`${era} photo navigation preserves decoded slides and comment drafts`, t => {
  const win = noteFixture(), doc = win.document; t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  doc.querySelector('.note-slider-img').insertAdjacentHTML('beforeend', '<img src="https://example.test/second.jpg" width="900" height="1200">');
  mount(t, win, { initial: era });
  const first = reader(doc).querySelector('.photo-slide [data-period-image]');
  const compose = reader(doc).querySelector('[data-compose] textarea');
  const slides = reader(doc).querySelectorAll('.photo-slide');
  assert.equal(slides.length, 2); assert.equal(slides[1].hidden, true);
  action(doc, 'picture-next'); assert.equal(slides[0].hidden, true); assert.equal(slides[1].hidden, false);
  action(doc, 'picture-previous'); assert.equal(slides[0].hidden, false);
  assert.equal(slides[0].querySelector('[data-period-image]'), first);
  assert.equal(reader(doc).querySelector('[data-compose] textarea'), compose);
});

for (const era of ['2005', '2010', '2015']) test(`${era} user results are profiles and never text-note placeholders`, t => {
  const win = makeWindow('/search_result?keyword=test&type=user'), doc = win.document;
  t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  doc.body.innerHTML = '<main id="app"><div class="user-list-item"><a href="/user/profile/demo"><img class="avatar" src="https://example.test/avatar.jpg"><span class="user-name">示例作者</span></a><p class="user-desc">城市摄影</p></div></main>';
  const snapshot = createAdapter(doc).read(); assert.equal(snapshot.entries[0].kind, 'user'); assert.ok(snapshot.entries[0].avatar);
  mount(t, win, { initial: era });
  assert.equal(reader(doc).querySelectorAll('.user-result').length, 1);
  assert.equal(reader(doc).querySelector('.text-tile'), null); assert.ok(reader(doc).textContent.includes('城市摄影'));
});

test('2015 homepage uses a photo feed while profiles and search have galleries', t => {
  for (const path of ['/explore', '/search_result?keyword=test', '/user/profile/demo']) {
    const win = makeWindow(path), doc = win.document;
    doc.body.innerHTML = '<main id="app"><section class="user-page"><div class="user-info"><span class="user-name">作者</span></div><section class="note-item"><a class="title" href="/explore/a">作品</a></section></section></main>';
    if (!path.includes('profile')) doc.querySelector('.user-page').className = 'feeds-container';
    mount(t, win, { initial: '2015' });
    assert.ok(reader(doc).querySelector(path === '/explore' ? '.photo-feed' : '.photo-grid'));
  }
});

test('2010 timeline opens entries directly without duplicated preview or default selection', t => {
  const win = fixture(12), doc = win.document; mount(t, win, { initial: '2010' });
  const row = reader(doc).querySelector('[data-social-entry]');
  assert.equal(row.dataset.selected, undefined);
  assert.equal(reader(doc).querySelector('.timeline-preview'), null);
  assert.equal(reader(doc).querySelector('[data-action="preview"]'), null);
  assert.ok([...row.querySelectorAll('a')].some(a => a.textContent === '阅读与评论'));
});

for (const era of ['2005', '2010', '2015']) test(`${era} late comments appear without recreating the image or composer`, async t => {
  const win = noteFixture(), doc = win.document; t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  doc.querySelectorAll('.comment-item').forEach(node => node.remove());
  mount(t, win, { initial: era });
  const media = reader(doc).querySelector('[data-period-image]'), compose = reader(doc).querySelector('[data-compose] textarea');
  doc.querySelector('.comments-el').insertAdjacentHTML('beforeend', '<div class="comment-item" id="late"><div class="content">后到的评论</div></div>');
  await new Promise(resolve => setTimeout(resolve, 1550));
  assert.equal(reader(doc).querySelectorAll('[data-comment]').length, 1);
  assert.equal(reader(doc).querySelector('[data-period-image]'), media); assert.equal(reader(doc).querySelector('[data-compose] textarea'), compose);
});

test('search reads the native note/user tabs and changing type keeps the historical document', async t => {
  const win = makeWindow('/search_result?keyword=test'), doc = win.document;
  doc.body.innerHTML = '<main id="app"><div class="search-layout__top"><div class="channel"><span class="channel-content active">笔记</span></div><div class="channel"><span class="channel-content">用户</span></div><div class="channel"><span class="channel-content">问点点 ai</span></div></div><div class="feeds-container"><div class="note-item"><a class="title" href="/explore/a">文章</a></div></div></main>';
  doc.querySelectorAll('.channel')[1].addEventListener('click', () => {
    doc.querySelectorAll('.channel-content').forEach(n => n.classList.remove('active'));
    doc.querySelectorAll('.channel-content')[1].classList.add('active');
    doc.querySelector('.feeds-container').innerHTML = '<div class="user-list-item"><a href="/user/profile/demo"><span class="user-name">作者</span></a></div>';
  });
  mount(t, win, { initial: '2015' });
  assert.deepEqual([...reader(doc).querySelectorAll('[data-channel]')].map(n=>n.textContent), ['笔记','用户']);
  reader(doc).querySelectorAll('[data-channel]')[1].click();
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(reader(doc).querySelectorAll('.user-result').length, 1);
  assert.equal(doc.querySelector('#app').inert, true);
});

for (const era of ['2005', '2010', '2015']) test(`${era} comment pagination preserves the same video player`, t => {
  const win = noteFixture(), doc = win.document;
  t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  doc.querySelector('.media-container').append(doc.createElement('video'));
  mount(t, win, { initial: era }); const video = reader(doc).querySelector('[data-period-video]');
  assert.ok(video); action(doc, 'comments-next'); assert.equal(reader(doc).querySelector('[data-period-video]'), video);
});

for (const era of ['2010', '2015']) test(`${era} private messages read chronologically within the latest batch`, async t => {
  const f = chatFixture();
  f.addConversation('甲', 1, () => f.list.replaceChildren(f.message('较早的消息'), f.message('较新的消息', true)));
  mount(t, f.win, { initial: era }); await waitForMailbox();
  mailbox(f.doc).querySelector('[data-conversation]').click(); await waitForMailbox();
  assert.deepEqual(mailTexts(f.doc), ['较早的消息', '较新的消息']); assert.equal(f.sends(), 0);
});

for (const era of ['1985','1995','2000','2005','2010','2015']) test(`${era} keeps network simulation exclusively in the era panel`, t => {
  const win = noteFixture(), doc = win.document; t.mock.setter(win.HTMLImageElement.prototype, 'src', () => {});
  const control = mount(t, win, {initial:era,open:true});
  const panel = doc.querySelector('rednote-rewind-control').shadowRoot;
  assert.equal(reader(doc).querySelector('.read-options,[data-action=slow-images]'), null);
  const speed = panel.querySelector('.speed'); assert.ok(speed);
  if (era !== '1985') {
    const original = reader(doc).firstElementChild;
    speed.click(); assert.equal(speed.getAttribute('aria-pressed'),'true');
    assert.equal(reader(doc).firstElementChild, original);
    control.setEra('2000'); assert.equal(speed.getAttribute('aria-pressed'),'true');
    assert.equal(reader(doc).querySelector('.read-options,[data-action=slow-images]'), null);
    speed.click(); assert.equal(speed.getAttribute('aria-pressed'),'false');
  }
});
