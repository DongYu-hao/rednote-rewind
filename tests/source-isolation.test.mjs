import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
const bundle = await build({ entryPoints: ['src/source-isolation.ts'], bundle: true, write: false, format: 'esm' });
const { createSourceIsolation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const mutations = () => new Promise(resolve => setTimeout(resolve, 10));
function fixture(t) {
  const win = new Window(); t.after(() => win.happyDOM.close());
  const doc = win.document; doc.body.innerHTML = '<main aria-hidden="false"><p>正文</p></main><rednote-rewind-control></rednote-rewind-control>';
  const isolation = createSourceIsolation(doc, () => null); t.after(() => isolation.disable());
  return { win, doc, isolation };
}
test('new portals are isolated and detached/reinserted roots restore their original attributes', async t => {
  const { doc, isolation } = fixture(t), source = doc.querySelector('main');
  isolation.enable(); assert.equal(source.inert, true);
  const portal = doc.createElement('aside'); portal.inert = true; portal.setAttribute('aria-hidden', 'false');
  doc.body.append(portal); await mutations(); assert.equal(portal.getAttribute('aria-hidden'), 'true');
  source.remove(); await mutations(); assert.equal(source.getAttribute('aria-hidden'), 'false'); assert.equal(source.inert, false);
  doc.body.append(source); await mutations(); assert.equal(source.inert, true);
  isolation.disable(); assert.equal(source.getAttribute('aria-hidden'), 'false'); assert.equal(source.hasAttribute('data-rewind-source'), false);
  assert.equal(portal.inert, true); assert.equal(portal.getAttribute('aria-hidden'), 'false');
  assert.equal(doc.querySelector('rednote-rewind-control').inert, false);
});
test('unrelated mutations do not rescan existing media and new media is paused once', async t => {
  const { doc, isolation } = fixture(t), source = doc.querySelector('main');
  const old = doc.createElement('video'); source.append(old); let checks = 0;
  Object.defineProperty(old, 'paused', { get() { checks++; return true; } });
  isolation.enable(); const initial = checks;
  source.querySelector('p').textContent = '新文字'; source.append(doc.createElement('span')); await mutations();
  assert.equal(checks, initial);
  const added = doc.createElement('div'), media = doc.createElement('audio'); let pauses = 0;
  Object.defineProperty(media, 'paused', { get: () => false }); media.pause = () => pauses++;
  added.append(media); source.append(added); await mutations(); assert.equal(pauses, 1);
});
test('allowed source media continues playing and extension shadow contents are not inspected', async t => {
  const { doc, isolation: unused } = fixture(t); unused.disable();
  const video = doc.createElement('video'); doc.querySelector('main').append(video);
  Object.defineProperty(video, 'paused', { get: () => false }); let pauses = 0; video.pause = () => pauses++;
  const isolation = createSourceIsolation(doc, () => video); t.after(() => isolation.disable()); isolation.enable();
  const shadow = doc.querySelector('rednote-rewind-control').attachShadow({ mode: 'open' }); shadow.append(doc.createElement('video'));
  await mutations(); assert.equal(pauses, 0);
});

test('source scripts cannot remove isolation attributes from an existing source root', async t => {
  const { doc, isolation } = fixture(t), source = doc.querySelector('main'); isolation.enable();
  source.inert = false; source.removeAttribute('aria-hidden'); source.removeAttribute('data-rewind-source');
  await mutations(); assert.equal(source.inert, true); assert.equal(source.getAttribute('aria-hidden'), 'true'); assert.equal(source.hasAttribute('data-rewind-source'), true);
  isolation.disable(); assert.equal(source.inert, false); assert.equal(source.getAttribute('aria-hidden'), 'false');
});
