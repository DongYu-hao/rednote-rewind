import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.txt': 'text' } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const { mountRewind } = await load('src/rewind.ts');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t, pathname, html) {
  const win = new Window({ url: `https://www.xiaohongshu.com${pathname}`, settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => win.happyDOM.close());
  win.document.body.innerHTML = `<main id="app">${html}</main>`;
  return win.document;
}

test('closing the panel in now returns focus to the source page', t => {
  const doc = fixture(t, '/explore', '<button id="source-focus">原站按钮</button>');
  const source = doc.querySelector('#source-focus');
  source.focus();
  const rewind = mountRewind(doc, { initial: 'now', open: true, save() {} });
  t.after(() => rewind.destroy());
  rewind.togglePanel();
  assert.equal(doc.activeElement, source);
});

test('2005 live route explains the period boundary without mounting a player', t => {
  const doc = fixture(t, '/livestream/room', '<span class="anchor-name">主播</span><video></video><div class="live-chat"><h2 class="intro-title">播出中</h2></div>');
  const rewind = mountRewind(doc, { initial: '2005', save() {} });
  t.after(() => rewind.destroy());
  const root = doc.querySelector('rednote-rewind-document').shadowRoot;
  assert.match(root.querySelector('.live-unavailable')?.textContent ?? '', /暂不提供直播阅读/);
  assert.equal(root.querySelector('.period-video'), null);
  assert.equal(root.querySelector('.social-header h1')?.textContent, '小红书');
});

for (const era of ['1995', '2000']) test(`${era} live route explains the period boundary`, t => {
  const doc = fixture(t, '/livestream/room', '<span class="anchor-name">主播</span><video></video><div class="live-chat"><h2 class="intro-title">播出中</h2></div>');
  const rewind = mountRewind(doc, { initial: era, save() {} });
  t.after(() => rewind.destroy());
  const root = doc.querySelector('rednote-rewind-document').shadowRoot;
  assert.match(root.textContent, /此年代不提供直播阅读/);
  assert.equal(root.querySelector('.period-video'), null);
});

test('1985 keeps its terminal commands when a live route cannot be read', t => {
  const doc = fixture(t, '/livestream/room', '<span class="anchor-name">主播</span><video></video>');
  const rewind = mountRewind(doc, { initial: '1985', save() {} });
  t.after(() => rewind.destroy());
  const root = doc.querySelector('rednote-rewind-document').shadowRoot;
  assert.match(root.textContent, /此记录暂不能在终端内阅读/);
  assert.ok(root.querySelector('.terminal-command input'));
  assert.equal(root.querySelector('.period-video'), null);
});

test('an empty live room has a visible chat status from the first render', t => {
  const doc = fixture(t, '/livestream/room', '<span class="anchor-name">主播</span><video></video><div class="live-chat"><h2 class="intro-title">播出中</h2></div>');
  const rewind = mountRewind(doc, { initial: '2015', save() {} });
  t.after(() => rewind.destroy());
  const log = doc.querySelector('rednote-rewind-document').shadowRoot.querySelector('.live-messages');
  assert.match(log.textContent, /暂无已读取的聊天记录/);
  assert.equal(log.children.length, 1);
});

test('live updates keep old message nodes and append only new received messages', async t => {
  const doc = fixture(t, '/livestream/room', '<span class="anchor-name">主播</span><video></video><div class="live-chat"><h2 class="intro-title">播出中</h2><p class="msg-content"><span class="nickname">甲</span><span>第一条</span></p><p class="msg-content"><span class="nickname">乙</span><span>第二条</span></p></div>');
  const rewind = mountRewind(doc, { initial: '2015', save() {} });
  t.after(() => rewind.destroy());
  const root = doc.querySelector('rednote-rewind-document').shadowRoot;
  const log = root.querySelector('.live-messages');
  const first = log.firstElementChild;
  assert.equal(log.getAttribute('aria-relevant'), 'additions');
  doc.querySelector('.live-chat').insertAdjacentHTML('beforeend', '<p class="msg-content"><span class="nickname">丙</span><span>第三条</span></p>');
  await pause(850);
  assert.equal(root.querySelector('.live-messages'), log);
  assert.equal(log.firstElementChild, first);
  assert.equal(log.children.length, 3);
  assert.match(log.lastElementChild.textContent, /第三条/);
  const second = log.children[1];
  doc.querySelector('.live-chat .msg-content').remove();
  await pause(850);
  assert.equal(log.children.length, 2);
  assert.equal(log.firstElementChild, second);
});
