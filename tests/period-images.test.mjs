import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Compile in memory; fixture images never perform network requests.
const bundle = await build({ entryPoints: ['src/media/period-images.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { mountPeriodImage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function fixture(t, { naturalWidth = 1000, naturalHeight = 500, encodeFailure = false, contextUnavailable = false } = {}) {
  const win = new Window({ url: 'https://www.xiaohongshu.com/explore', settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  const doc = win.document;
  const requests = []; const encodings = []; const drawings = []; const mounts = [];
  win.Image = function () {
    const image = doc.createElement('img'); let source = '';
    Object.defineProperties(image, {
      naturalWidth: { value: naturalWidth }, naturalHeight: { value: naturalHeight },
      src: { get: () => source, set: value => { source = value; image.setAttribute('src', value); } },
    });
    requests.push(image); return image;
  };
  win.HTMLCanvasElement.prototype.getContext = function () {
    return contextUnavailable ? null : { fillRect() {}, drawImage(image, x, y, width, height) { drawings.push({ image, x, y, width, height }); } };
  };
  win.HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
    encodings.push({ type, quality, width: this.width, height: this.height });
    if (encodeFailure) throw new Error('Synthetic encoding failure');
    return `data:${type};base64,AAAA`;
  };
  function mount(options = {}, picture = { src: 'https://sns-img.xhscdn.com/picture.jpg', width: 1000, height: 500 }) {
    const parent = doc.createElement('div'); doc.body.append(parent);
    const controller = mountPeriodImage(doc, parent, picture, { label: '图像一', maxWidth: 480, ...options });
    mounts.push(controller);
    return { parent, controller, figure: parent.querySelector('[data-period-image]'), frame: parent.querySelector('.period-image-frame') };
  }
  t.after(async () => { mounts.forEach(controller => controller.destroy()); await win.happyDOM.close(); });
  const load = () => { const request = requests.at(-1); assert.ok(request?.onload); request.onload(new win.Event('load')); };
  const error = () => { const request = requests.at(-1); assert.ok(request?.onerror); request.onerror(new win.Event('error')); };
  return { win, doc, requests, encodings, drawings, mount, load, error };
}

test('period image makes a proportional colour JPEG through toDataURL at quality 0.45', t => {
  const f = fixture(t); const view = f.mount();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].crossOrigin, 'anonymous');
  assert.equal(view.frame.style.width, '480px'); assert.equal(view.frame.style.height, '240px');
  f.load();
  assert.deepEqual(f.encodings, [{ type: 'image/jpeg', quality: 0.45, width: 480, height: 240 }]);
  assert.equal(f.drawings.length, 1); assert.equal(f.drawings[0].width, 480); assert.equal(f.drawings[0].height, 240);
  assert.equal(view.figure.dataset.imageTreatment, 'jpeg'); assert.equal(view.figure.dataset.imageState, 'ready');
  const image = view.frame.querySelector('img'); assert.ok(image);
  assert.equal(image.width, 480); assert.equal(image.height, 240); assert.equal(image.alt, '图像一');
  assert.match(image.src, /^data:image\/jpeg;base64,/);
  assert.equal(view.frame.style.filter, '', 'Colour output should not be a CSS blur or grayscale imitation');
});

test('a CORS failure retries a normal image and labels only the resized canvas treatment', t => {
  const f = fixture(t); const view = f.mount(); const first = f.requests[0];
  f.error();
  assert.equal(f.requests.length, 2); assert.equal(first.onload, null); assert.equal(first.onerror, null);
  assert.equal(f.requests[1].crossOrigin, null); f.load();
  assert.equal(f.encodings.length, 0); assert.equal(view.figure.dataset.imageTreatment, 'resized');
  const canvas = view.frame.querySelector('canvas'); assert.ok(canvas);
  assert.equal(canvas.width, 480); assert.equal(canvas.height, 240); assert.equal(canvas.getAttribute('aria-label'), '图像一');
  assert.equal(view.figure.querySelector('figcaption').textContent, '图像一');
});

test('JPEG export failure falls back once and keeps other picture requests independent', t => {
  const f = fixture(t, { encodeFailure: true }); const view = f.mount();
  f.load(); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].crossOrigin, null);
  f.load();
  assert.equal(f.encodings.length, 1); assert.equal(view.figure.dataset.imageTreatment, 'resized');
  const other = f.mount();
  assert.equal(f.requests.length, 3); assert.equal(other.figure.dataset.imageState, 'loading');
  f.error(); f.error();
  assert.equal(other.figure.dataset.imageState, 'failed');
  assert.equal(view.figure.dataset.imageState, 'ready', 'Failure of another image must not clear an existing picture');
});

test('destroy detaches request handlers and a captured old callback cannot insert an image', t => {
  const f = fixture(t); const view = f.mount(); const request = f.requests[0];
  const oldLoad = request.onload; const oldError = request.onerror;
  view.controller.destroy(); view.controller.destroy();
  assert.equal(request.onload, null); assert.equal(request.onerror, null);
  assert.equal(request.hasAttribute('src'), false, 'The owned request is cancelled on destroy');
  oldLoad(new f.win.Event('load')); oldError(new f.win.Event('error'));
  assert.equal(view.parent.childElementCount, 0); assert.equal(f.encodings.length, 0); assert.equal(f.requests.length, 1);
});

test('slow loading allocates its frame first and cancelling it prevents the delayed request', async t => {
  const f = fixture(t); const view = f.mount({ slow: true, delay: 20 });
  assert.equal(f.requests.length, 0); assert.equal(view.figure.dataset.imageState, 'waiting');
  assert.equal(view.frame.style.width, '480px'); assert.equal(view.frame.style.height, '240px');
  view.controller.destroy(); await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(f.requests.length, 0); assert.equal(view.parent.childElementCount, 0);
});

test('credential addresses and non-web image sources fail without initiating a request', t => {
  const f = fixture(t);
  for (const src of ['https://user:password@example.test/picture.jpg', 'data:image/jpeg;base64,AAAA', 'javascript:void(0)', '']) {
    const view = f.mount({}, { src, width: 100, height: 100 });
    assert.equal(view.figure.dataset.imageState, 'failed'); assert.equal(view.figure.hasAttribute('data-image-treatment'), false);
    assert.equal(view.frame.childElementCount, 0);
  }
  assert.equal(f.requests.length, 0);
});

test('a matching decoded source picture is sampled without another image request or source mutation', t => {
  const f = fixture(t);
  const native = f.doc.createElement('img');
  native.setAttribute('src', 'https://sns-img.xhscdn.com/picture.jpg');
  Object.defineProperties(native, {
    complete: { value: true }, naturalWidth: { value: 1000 }, naturalHeight: { value: 500 },
    currentSrc: { value: 'https://sns-img.xhscdn.com/picture.jpg' },
  });
  f.doc.body.append(native);
  const view = f.mount();
  assert.equal(f.requests.length, 0);
  assert.equal(f.drawings[0].image, native);
  assert.equal(view.figure.dataset.imageTreatment, 'jpeg');
  view.controller.destroy();
  assert.equal(native.getAttribute('src'), 'https://sns-img.xhscdn.com/picture.jpg');
  assert.equal(native.isConnected, true);
});

test('a tainted decoded source stays as a resized canvas without requesting a duplicate', t => {
  const f = fixture(t, { encodeFailure: true });
  const native = f.doc.createElement('img');
  native.setAttribute('src', 'https://sns-img.xhscdn.com/picture.jpg');
  Object.defineProperties(native, {
    complete: { value: true }, naturalWidth: { value: 1000 }, naturalHeight: { value: 500 },
    currentSrc: { value: 'https://sns-img.xhscdn.com/picture.jpg' },
  });
  f.doc.body.append(native);
  const view = f.mount();
  assert.equal(f.requests.length, 0);
  assert.equal(view.figure.dataset.imageTreatment, 'resized');
  assert.ok(view.frame.querySelector('canvas'));
});

test('unmatched external addresses do not start a fresh third-party image request', t => {
  const f = fixture(t);
  for (const src of ['https://other.example/picture.jpg', 'https://sns-img.xhscdn.com.evil.example/picture.jpg', 'http://sns-img.xhscdn.com/picture.jpg']) {
    const view = f.mount({}, { src, width: 100, height: 100 });
    assert.equal(view.figure.dataset.imageState, 'failed');
  }
  assert.equal(f.requests.length, 0);
  const native = f.doc.createElement('img');
  native.setAttribute('src', 'https://other.example/picture.jpg');
  Object.defineProperties(native, {
    complete: { value: true }, naturalWidth: { value: 100 }, naturalHeight: { value: 100 },
    currentSrc: { value: 'https://other.example/picture.jpg' },
  });
  f.doc.body.append(native);
  const reused = f.mount({}, { src: 'https://other.example/picture.jpg', width: 100, height: 100 });
  assert.equal(reused.figure.dataset.imageState, 'ready');
  assert.equal(f.requests.length, 0);
});

test('unknown source dimensions retain a bounded placeholder after decoding without shifting following content', t => {
  const f = fixture(t, { naturalWidth: 1000, naturalHeight: 2000 });
  const view = f.mount({ maxWidth: 480, maxHeight: 360 }, { src: 'https://sns-img.xhscdn.com/portrait.jpg', width: 0, height: 0 });
  const before = { width: view.frame.style.width, height: view.frame.style.height };
  assert.deepEqual(before, { width: '160px', height: '120px' });
  f.load();
  assert.deepEqual({ width: view.frame.style.width, height: view.frame.style.height }, before);
  const image = view.frame.querySelector('img'); assert.ok(image);
  assert.equal(image.width, 180); assert.equal(image.height, 360);
  assert.equal(image.style.width, '60px'); assert.equal(image.style.height, '120px');
  assert.equal(view.figure.dataset.imageState, 'ready');
});

test('a decoded ratio differing from the reserved source ratio fits the original frame without expanding it', t => {
  const f = fixture(t, { naturalWidth: 500, naturalHeight: 1000 });
  const view = f.mount({}, { src: 'https://sns-img.xhscdn.com/picture.jpg', width: 1000, height: 500 });
  const before = { width: view.frame.style.width, height: view.frame.style.height }; f.load();
  assert.deepEqual({ width: view.frame.style.width, height: view.frame.style.height }, before);
  assert.deepEqual(before, { width: '480px', height: '240px' });
  const image = view.frame.querySelector('img'); assert.ok(image);
  assert.equal(image.width, 240); assert.equal(image.height, 480);
  assert.equal(image.style.width, '120px'); assert.equal(image.style.height, '240px');
});

test('missing decoded dimensions or a canvas context leave a plain failure instead of claiming JPEG success', t => {
  const unknown = fixture(t, { naturalWidth: 0, naturalHeight: 0 }); const unknownView = unknown.mount(); unknown.load();
  assert.equal(unknownView.figure.dataset.imageState, 'failed'); assert.equal(unknown.encodings.length, 0);
  assert.equal(unknownView.figure.hasAttribute('data-image-treatment'), false);
  const unavailable = fixture(t, { contextUnavailable: true }); const canvasView = unavailable.mount(); unavailable.load();
  assert.equal(canvasView.figure.dataset.imageState, 'failed'); assert.equal(canvasView.frame.childElementCount, 0);
  assert.equal(unavailable.encodings.length, 0); assert.equal(canvasView.figure.hasAttribute('data-image-treatment'), false);
});

for (const maxWidth of [180, 260, 360, 1080]) test(`unknown dimensions encode portrait at the requested ${maxWidth} resolution`, t => {
  const f = fixture(t, { naturalWidth: 900, naturalHeight: 1200 });
  const view = f.mount({ maxWidth }, { src: 'https://sns-img.xhscdn.com/portrait.jpg', width: 0, height: 0 });
  f.load(); const image = view.frame.querySelector('img');
  assert.equal(image.width, Math.round(maxWidth * .75)); assert.equal(image.height, maxWidth);
});
