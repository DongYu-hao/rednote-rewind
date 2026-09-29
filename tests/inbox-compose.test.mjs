import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const bundle = await build({ entryPoints: ['src/inbox-reader.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.txt': 'text' } });
const { mountInbox } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const inboxBundle = await build({ entryPoints: ['src/adapters/xiaohongshu/inbox.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { createInboxAdapter } = await import(`data:text/javascript;base64,${Buffer.from(inboxBundle.outputFiles[0].text).toString('base64')}`);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, { sameNames = false, noActive = false } = {}) {
  const win = new Window({ url: 'https://www.xiaohongshu.com/chat/one', settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => win.happyDOM.close());
  const doc = win.document;
  doc.body.innerHTML = '<main id="app"><section class="xhs-im-page"><div class="xhs-im-conv-list"><div class="xhs-im-conv-item active" data-conversation-id="one"><span class="xhs-im-conv-item__name">甲</span><span class="xhs-im-conv-item__summary-text">摘要</span></div></div><div class="xhs-im-chat-window"><span class="xhs-im-chat-window__header-name">甲</span><div class="xhs-im-msg-list"><article class="chat-item"><span class="xhs-im-bubble__text">旧消息</span></article></div><div class="xhs-im-editor" contenteditable="true"></div><button class="send">发送</button></div></section></main><div id="historical"></div>';
  if (sameNames) doc.querySelector('.xhs-im-conv-list').insertAdjacentHTML('beforeend', '<div class="xhs-im-conv-item" data-conversation-id="two"><span class="xhs-im-conv-item__name">甲</span></div>');
  if (noActive) doc.querySelector('.xhs-im-conv-item.active').classList.remove('active');
  const editor = doc.querySelector('.xhs-im-editor'); const native = doc.querySelector('button.send'); let clicks = 0;
  editor.addEventListener('input', () => { native.disabled = false; });
  native.onclick = () => clicks++;
  const view = mountInbox(doc, doc.querySelector('#historical'), '2015');
  t.after(() => view.destroy());
  await pause(500);
  const historical = () => doc.querySelector('[data-inbox]');
  return { win, doc, view, editor, native, clicks: () => clicks, historical };
}

test('historical message form sends an explicit request only to the selected native conversation', async t => {
  const f = await fixture(t);
  const form = f.historical().querySelector('.mail-compose'); assert.ok(form);
  const input = form.querySelector('textarea'); input.value = '新消息😀';
  form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.clicks(), 1); assert.equal(f.editor.textContent, '新消息😀');
  assert.equal(input.disabled, true);
  form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); assert.equal(f.clicks(), 1);
});

test('rich native message drafts are never replaced by the historical composer', async t => {
  const f = await fixture(t);
  f.editor.innerHTML = '<span data-emoji="smile"></span>';
  const form = f.historical().querySelector('.mail-compose');
  form.querySelector('textarea').value = '不要覆盖';
  form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.editor.innerHTML, '<span data-emoji="smile"></span>'); assert.equal(f.clicks(), 0);
});

test('switching recipients during native input cannot send to the next conversation, even with the same display name', async t => {
  const f = await fixture(t, { sameNames: true });
  const form = f.historical().querySelector('.mail-compose'); assert.ok(form);
  form.querySelector('textarea').value = '原收件人内容';
  f.editor.addEventListener('input', () => {
    f.doc.querySelector('.xhs-im-conv-item.active').classList.remove('active');
    f.doc.querySelectorAll('.xhs-im-conv-item')[1].classList.add('active');
    f.win.history.pushState(null, '', '/chat/two');
  });
  form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.clicks(), 0);
  assert.equal(f.editor.textContent, '', 'The bridge removes only its own text after recipient change');
});

test('a later native draft in a changed conversation survives rollback', async t => {
  const f = await fixture(t);
  const form = f.historical().querySelector('.mail-compose'); form.querySelector('textarea').value = '旧会话内容';
  f.editor.addEventListener('input', () => { f.win.history.pushState(null, '', '/chat/two'); f.editor.textContent = '新会话自己的草稿'; });
  form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.clicks(), 0); assert.equal(f.editor.textContent, '新会话自己的草稿');
});

test('changing era or destroying the mailbox during native input cancels the send', async t => {
  for (const action of ['era', 'destroy']) {
    const f = await fixture(t);
    const form = f.historical().querySelector('.mail-compose'); assert.ok(form);
    form.querySelector('textarea').value = '延迟内容';
    f.editor.addEventListener('input', () => action === 'era' ? f.view.setEra('1995') : f.view.destroy());
    form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(f.clicks(), 0, action);
  }
});

test('ambiguous same-name source rows without a selected recipient expose no send form', async t => {
  const f = await fixture(t, { sameNames: true, noActive: true });
  assert.equal(f.historical().querySelector('.mail-compose'), null);
  assert.equal(f.clicks(), 0);
});

test('changing only /chat route keeps stale DOM unreadable until the selected conversation hydrates', async t => {
  const f = await fixture(t, { sameNames: true });
  assert.ok(f.historical().querySelector('.mail-compose'));
  const adapter = createInboxAdapter(f.doc);
  assert.equal(adapter.read().ready, true);
  f.win.history.pushState(null, '', '/chat/two');
  // The old selected row, header and message list are still present.
  const fresh = adapter.read();
  assert.equal(fresh.recipientKey, '');
  assert.equal(fresh.ready, false, 'The old content must not be accepted for /chat/two');
  f.doc.querySelector('.xhs-im-conv-item.active').classList.remove('active');
  f.doc.querySelectorAll('.xhs-im-conv-item')[1].classList.add('active');
  f.doc.querySelector('.xhs-im-msg-list .xhs-im-bubble__text').textContent = '新会话消息';
  const loaded = adapter.read();
  assert.equal(loaded.ready, true); assert.match(loaded.recipientKey, /^\/chat\/two:/);
  adapter.destroy();
});

test('a pending recipient click abandoned by a second route can recover on the loaded destination', async t => {
  const f = await fixture(t);
  f.doc.querySelector('.xhs-im-conv-list').insertAdjacentHTML('beforeend', '<div class="xhs-im-conv-item" data-conversation-id="two"><span class="xhs-im-conv-item__name">乙</span></div><div class="xhs-im-conv-item" data-conversation-id="three"><span class="xhs-im-conv-item__name">丙</span></div>');
  const adapter = createInboxAdapter(f.doc);
  const initial = adapter.read(); assert.equal(initial.ready, true);
  const second = initial.conversations.find(item => item.author === '乙');
  f.doc.querySelectorAll('.xhs-im-conv-item')[1].onclick = () => f.win.history.pushState(null, '', '/chat/two');
  assert.equal(adapter.activate(second.action), true);
  assert.equal(adapter.read().ready, false, 'Old content must stay hidden during a selected transition');
  f.win.history.pushState(null, '', '/chat/three');
  f.doc.querySelector('.xhs-im-conv-item.active').classList.remove('active');
  f.doc.querySelectorAll('.xhs-im-conv-item')[2].classList.add('active');
  f.doc.querySelector('.xhs-im-chat-window__header-name').textContent = '丙';
  f.doc.querySelector('.xhs-im-msg-list .xhs-im-bubble__text').textContent = '丙的新记录';
  const recovered = adapter.read();
  assert.equal(recovered.ready, true); assert.match(recovered.recipientKey, /^\/chat\/three:/);
  adapter.destroy();
});

test('back navigation can use the shared historical navigator', async t => {
  const f = await fixture(t);
  f.view.destroy();
  const calls = [];
  const view = mountInbox(f.doc, f.doc.querySelector('#historical'), '2015', url => calls.push(url));
  t.after(() => view.destroy());
  await pause(500);
  const back = f.doc.querySelector('[data-inbox] [data-mail-action="back"]'); assert.ok(back);
  back.click();
  assert.deepEqual(calls, ['/chat']);
});
