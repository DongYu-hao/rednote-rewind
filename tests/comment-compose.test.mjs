import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const bridgeBundle = await build({ entryPoints: ['src/adapters/xiaohongshu/comment-compose.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { submitNativeComment } = await import(`data:text/javascript;base64,${Buffer.from(bridgeBundle.outputFiles[0].text).toString('base64')}`);
const readerBundle = await build({ entryPoints: ['src/rewind.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.woff2': 'dataurl', '.txt': 'text' } });
const { mountRewind } = await import(`data:text/javascript;base64,${Buffer.from(readerBundle.outputFiles[0].text).toString('base64')}`);

// Synthetic, offline source elements only. A click increments a local counter.
function fixture(t, { enableOnInput = true } = {}) {
  const win = new Window({ url: 'https://www.xiaohongshu.com/explore/article', settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => win.happyDOM.close());
  const doc = win.document;
  doc.body.innerHTML = '<main id="app"><nav><a href="/user/profile/me">我</a></nav><section id="noteContainer" class="note-container"><div class="note-content"><h1 id="detail-title">测试文稿</h1><div id="detail-desc">正文。</div></div><div class="interaction-container"><div class="content-edit"><p class="content-input" contenteditable="true"></p></div><div class="right-btn-area"><button class="submit" disabled>发送</button></div></div></section></main>';
  const editor = doc.querySelector('.content-input'); const native = doc.querySelector('button.submit');
  let submissions = 0; const inputEvents = [];
  editor.addEventListener('input', event => {
    inputEvents.push(event);
    if (enableOnInput) native.disabled = false;
  });
  native.addEventListener('click', () => submissions++);
  return { win, doc, editor, native, expectedURL: win.location.href, inputEvents, submissions: () => submissions };
}

test('empty and whitespace-only drafts cannot alter or submit the native form', async t => {
  const f = fixture(t);
  for (const value of ['', '  \n\t']) assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, value), 'string');
  assert.equal(f.editor.textContent, ''); assert.equal(f.inputEvents.length, 0); assert.equal(f.submissions(), 0);
});

test('existing native drafts, including whitespace, are never overwritten', async t => {
  const f = fixture(t);
  for (const value of ['原站未发送😀', '   \n']) {
    f.editor.textContent = value;
    assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '替换文字'), 'string');
    assert.equal(f.editor.textContent, value);
  }
  assert.equal(f.inputEvents.length, 0); assert.equal(f.submissions(), 0);
});

test('a non-text native image or emoji draft is protected, while an empty placeholder br is allowed', async t => {
  const f = fixture(t);
  for (const markup of ['<img src="about:blank">', '<span data-emoji="smile"></span>', '<svg></svg>']) {
    f.editor.innerHTML = markup;
    assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '新留言'), 'string');
    assert.equal(f.editor.innerHTML, markup);
    assert.equal(f.submissions(), 0);
  }
  f.editor.innerHTML = '<br>';
  assert.equal(await submitNativeComment(f.doc, f.expectedURL, '允许发送'), null);
  assert.equal(f.submissions(), 1);
});

test('a second visible native comment form makes the target ambiguous and sends nothing', async t => {
  const f = fixture(t);
  f.doc.querySelector('.interaction-container').after(f.doc.querySelector('.interaction-container').cloneNode(true));
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '不可猜测表单'), 'string');
  assert.equal(f.editor.textContent, ''); assert.equal(f.submissions(), 0);
});

test('replacing the native comment editor during input prevents clicking the old form', async t => {
  const f = fixture(t);
  f.editor.addEventListener('input', () => f.editor.replaceWith(f.editor.cloneNode(true)));
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '待发送'), 'string');
  assert.equal(f.submissions(), 0);
});

test('a route changed before submission rejects the old article draft without touching its form', async t => {
  const f = fixture(t); f.win.history.pushState(null, '', '/explore/other');
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '旧文章留言'), 'string');
  assert.equal(f.editor.textContent, ''); assert.equal(f.inputEvents.length, 0); assert.equal(f.submissions(), 0);
});

test('an explicit valid submission forwards raw emoji and literal markup through InputEvent once', async t => {
  const f = fixture(t); const draft = '原始😀👍🏽\n<img src=x> & 文字';
  assert.equal(f.submissions(), 0, 'Fixture creation never submits');
  assert.equal(await submitNativeComment(f.doc, f.expectedURL, draft), null);
  assert.equal(f.editor.textContent, draft); assert.equal(f.editor.querySelector('img'), null);
  assert.equal(f.inputEvents.length, 1); assert.ok(f.inputEvents[0] instanceof f.win.InputEvent);
  assert.equal(f.inputEvents[0].data, draft); assert.equal(f.inputEvents[0].inputType, 'insertText');
  assert.equal(f.inputEvents[0].bubbles, true); assert.equal(f.submissions(), 1);
});

test('a disabled native button is never force-enabled and its forwarded draft is preserved', async t => {
  const f = fixture(t, { enableOnInput: false });
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '保留😀'), 'string');
  assert.equal(f.native.disabled, true); assert.equal(f.editor.textContent, '保留😀'); assert.equal(f.submissions(), 0);
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '不能覆盖'), 'string');
  assert.equal(f.editor.textContent, '保留😀'); assert.equal(f.inputEvents.length, 1); assert.equal(f.submissions(), 0);
});

test('aria-disabled prevents submission even when the native disabled property is false', async t => {
  const f = fixture(t); f.native.setAttribute('aria-disabled', 'true');
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '不能发送'), 'string');
  assert.equal(f.submissions(), 0); assert.equal(f.editor.textContent, '不能发送');
});

test('a route changed during input handling cannot submit under a new article', async t => {
  const f = fixture(t);
  f.editor.addEventListener('input', () => f.win.history.pushState(null, '', '/explore/other'));
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '待发送'), 'string');
  assert.equal(f.submissions(), 0); assert.equal(f.editor.textContent, '');
});

test('a new native edit made during a route change is never removed by rollback', async t => {
  const f = fixture(t);
  f.editor.addEventListener('input', () => {
    f.win.history.pushState(null, '', '/explore/other');
    f.editor.textContent = '原站随后写入的新草稿';
  });
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '本次插入'), 'string');
  assert.equal(f.editor.textContent, '原站随后写入的新草稿'); assert.equal(f.submissions(), 0);
});

test('source elements removed while the native app updates cannot be submitted', async t => {
  const f = fixture(t); f.editor.addEventListener('input', () => f.doc.querySelector('#noteContainer').remove());
  assert.equal(typeof await submitNativeComment(f.doc, f.expectedURL, '待发送'), 'string');
  assert.equal(f.submissions(), 0);
});

test('the note-scoped bridge cannot overwrite an unrelated private-message editor or click its button', async t => {
  const f = fixture(t); let unrelatedSends = 0;
  const unrelated = f.doc.createElement('section');
  unrelated.innerHTML = '<p class="content-input" contenteditable="true">私信草稿</p><div class="right-btn-area"><button class="submit">发送</button></div>';
  f.doc.querySelector('#app').prepend(unrelated); unrelated.querySelector('button').addEventListener('click', () => unrelatedSends++);
  assert.equal(await submitNativeComment(f.doc, f.expectedURL, '文章留言'), null);
  assert.equal(unrelated.querySelector('p').textContent, '私信草稿'); assert.equal(unrelatedSends, 0); assert.equal(f.submissions(), 1);
});

test('historical compose creates no native side effects and retains the raw draft across era switches until user submission', async t => {
  const f = fixture(t); const rewind = mountRewind(f.doc, { initial: '1995', save() {} }); t.after(() => rewind.destroy());
  const historical = () => f.doc.querySelector('rednote-rewind-document').shadowRoot.querySelector('[data-compose]');
  const raw = '原始😀👨‍👩‍👧‍👦'; const input = historical().querySelector('textarea');
  assert.equal(f.editor.textContent, ''); assert.equal(f.submissions(), 0);
  input.value = raw; input.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  rewind.setEra('2000'); assert.equal(historical().querySelector('textarea').value, raw);
  rewind.setEra('1995'); assert.equal(historical().querySelector('textarea').value, raw);
  assert.equal(f.editor.textContent, ''); assert.equal(f.inputEvents.length, 0); assert.equal(f.submissions(), 0);
  historical().dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.editor.textContent, raw); assert.equal(f.submissions(), 1);
  assert.equal(historical().querySelector('textarea').disabled, true);
  historical().dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true }));
  await Promise.resolve(); assert.equal(f.submissions(), 1, 'Repeated submission cannot create a second request');
  rewind.setEra('now'); assert.equal(f.editor.textContent, raw);
});

test('a top-level comment cannot be sent into an existing native reply thread', async t => {
  const f = fixture(t); f.editor.setAttribute('data-placeholder','回复 读者甲');
  assert.equal(typeof await submitNativeComment(f.doc,f.expectedURL,'普通评论'),'string');
  assert.equal(f.editor.textContent,''); assert.equal(f.submissions(),0);
});
test('reply identity is checked before and after native input processing', async t => {
  const f = fixture(t); f.editor.setAttribute('data-placeholder','回复 读者甲');
  f.editor.oninput = () => f.editor.setAttribute('data-placeholder','回复 读者乙');
  assert.equal(typeof await submitNativeComment(f.doc,f.expectedURL,'回复甲','回复 读者甲'),'string');
  assert.equal(f.submissions(),0);
});
test('same-URL article replacement during native input cannot submit', async t => {
  const f=fixture(t); let current=true; f.editor.oninput=()=>{current=false;};
  assert.equal(typeof await submitNativeComment(f.doc,f.expectedURL,'评论','',()=>current),'string'); assert.equal(f.submissions(),0);
});
test('manual continuation is available only after the native editor clears', async t => {
  const f=fixture(t); const rewind=mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const form=f.doc.querySelector('rednote-rewind-document').shadowRoot.querySelector('[data-compose]');
  const input=form.querySelector('textarea'); input.value='第一条'; input.dispatchEvent(new f.win.Event('input'));
  form.dispatchEvent(new f.win.Event('submit',{cancelable:true})); await Promise.resolve(); await Promise.resolve();
  const again=[...form.querySelectorAll('button')].find(b=>b.textContent==='确认结果后继续'); again.click(); assert.equal(input.disabled,true);
  f.editor.textContent=''; again.click(); assert.equal(input.disabled,false); assert.equal(input.value,''); assert.equal(f.submissions(),1);
});

test('rich content left by the native app prevents manual continuation', async t => {
  const f=fixture(t); const rewind=mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const form=f.doc.querySelector('rednote-rewind-document').shadowRoot.querySelector('[data-compose]');
  form.querySelector('textarea').value='待确认评论';
  form.dispatchEvent(new f.win.Event('submit',{cancelable:true})); await Promise.resolve(); await Promise.resolve();
  f.editor.innerHTML='<span data-emoji="smile"></span>';
  [...form.querySelectorAll('button')].find(b=>b.textContent==='确认结果后继续').click();
  assert.equal(form.querySelector('textarea').disabled,true); assert.equal(f.submissions(),1);
  assert.equal(f.editor.innerHTML,'<span data-emoji="smile"></span>');
});

test('a same-text comment by another user cannot confirm the historical submission', async t => {
  const f=fixture(t); const rewind=mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const form=f.doc.querySelector('rednote-rewind-document').shadowRoot.querySelector('[data-compose]');
  form.querySelector('textarea').value='相同文字'; form.dispatchEvent(new f.win.Event('submit',{cancelable:true}));
  await Promise.resolve(); await Promise.resolve(); f.editor.textContent='';
  const add = (id,profile) => { const row=f.doc.createElement('article'); row.className='comment-item'; row.id=id; row.innerHTML=`<div class="author"><a class="name" href="/user/profile/${profile}">作者</a></div><div class="content">相同文字</div>`; f.doc.querySelector('#noteContainer').append(row); };
  add('someone-else','other'); await new Promise(r=>setTimeout(r,1500));
  assert.equal(form.querySelector('button[type="button"]').textContent,'确认结果后继续');
  add('my-comment','me'); await new Promise(r=>setTimeout(r,1500));
  assert.equal(form.querySelector('button[type="button"]').textContent,'写下一条');
});

test('reply action targets the source reply context and a mid-input era switch cancels sending', async t => {
  const f=fixture(t); const row=f.doc.createElement('article'); row.className='comment-item'; row.id='reader-one';
  row.innerHTML='<div class="author"><a class="name" href="/user/profile/reader">读者甲</a></div><div class="content">问题</div><button class="reply">回复</button>';
  f.doc.querySelector('#noteContainer').append(row);
  row.querySelector('.reply').onclick=()=>f.editor.setAttribute('data-placeholder','回复 读者甲');
  const rewind=mountRewind(f.doc,{initial:'2015',save(){}}); t.after(()=>rewind.destroy());
  const root=f.doc.querySelector('rednote-rewind-document').shadowRoot;
  const historicalReply=root.querySelector('[data-comment="reader-one"] .native-actions button'); assert.ok(historicalReply); historicalReply.click();
  const form=root.querySelector('[data-compose]'); assert.equal(form.querySelector('[data-reply-status]').hidden,false);
  assert.equal(f.editor.getAttribute('data-placeholder'),'回复 读者甲');
  form.querySelector('textarea').value='回复内容';
  f.editor.addEventListener('input',()=>rewind.setEra('2005'));
  form.dispatchEvent(new f.win.Event('submit',{cancelable:true})); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.submissions(),0);
});
