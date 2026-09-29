import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Decode/play/timing are local doubles. No remote media or native playback is used.
const bundle = await build({ entryPoints: ['src/media/period-video.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { mountPeriodVideo } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, { video = true, deferred = false, rejectPlay = false, duration = 100 } = {}) {
  const win = new Window({ url: 'https://www.xiaohongshu.com/explore/example', settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  const doc = win.document;
  const timers = new Map(); const cleared = []; const drawings = []; const allows = []; const promises = [];
  let timerId = 0, playCount = 0, pauseCount = 0, owner = null;
  const state = { paused: true, ended: false, currentTime: 20, duration, readyState: 3, videoWidth: 1280, videoHeight: 720 };
  win.setInterval = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  win.clearInterval = id => { cleared.push(id); timers.delete(id); };
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: '', fillRect() {}, drawImage(source, x, y, width, height) { drawings.push({ source, x, y, width, height }); } });
  const source = doc.createElement('video');
  for (const key of Object.keys(state)) Object.defineProperty(source, key, { configurable: true, get: () => state[key], set: value => { state[key] = value; } });
  Object.defineProperties(source, {
    src: { get() { throw new Error('Player must not copy a source address'); } },
    currentSrc: { get() { throw new Error('Player must not inspect a media address'); } },
  });
  source.play = () => {
    ++playCount; state.paused = false; state.ended = false;
    if (deferred) return new Promise((resolve, reject) => promises.push({ resolve, reject }));
    if (rejectPlay) { state.paused = true; return Promise.reject(new Error('Synthetic playback rejection')); }
    return Promise.resolve();
  };
  source.pause = () => { ++pauseCount; state.paused = true; };
  const native = doc.createElement('div'); native.id = 'noteContainer'; if (video) native.append(source); doc.body.append(native);
  const controllers = [];
  function mount(era = '2000') {
    const parent = doc.createElement('div'); doc.body.append(parent);
    const controller = mountPeriodVideo(doc, parent, next => { allows.push(next); owner = next; }, era); controllers.push(controller);
    const frame = parent.querySelector('[data-period-video]');
    return { parent, controller, frame, play: frame.querySelector('button'), seek: frame.querySelector('input'), status: frame.querySelector('[role=status]'), canvas: frame.querySelector('canvas') };
  }
  t.after(async () => { controllers.forEach(controller => controller.destroy()); await win.happyDOM.close(); });
  return { win, doc, state, source, timers, cleared, drawings, allows, promises, mount,
    playCount: () => playCount, pauseCount: () => pauseCount, owner: () => owner };
}

test('period video mounts a dormant canvas without autoplay or copying the source address', t => {
  const f = fixture(t); const view = f.mount();
  assert.equal(f.playCount(), 0); assert.equal(f.pauseCount(), 0); assert.deepEqual(f.allows, []);
  assert.equal(f.timers.size, 0); assert.equal(f.drawings.length, 0); assert.equal(view.seek.disabled, true);
  assert.equal(view.canvas.width, 320); assert.equal(view.canvas.height, 240);
  assert.equal(view.parent.querySelector('video'), null); assert.equal(view.parent.querySelector('[src]'), null);
  assert.match(view.status.textContent, /按播放键/);
});

test('later playback and audio controls remain in separate groups with their related controls together', t => {
  const f = fixture(t);
  const view = f.mount('2015');
  const groups = [...view.frame.querySelector('.video-controls').children];
  assert.deepEqual(groups.map(group => group.className), ['video-transport', 'video-audio']);
  assert.deepEqual([...groups[0].children].map(control => control.getAttribute('aria-label') || control.className || control.textContent), ['播放', '播放位置', 'video-clock']);
  assert.deepEqual([...groups[1].children].map(control => control.getAttribute('aria-label') || control.textContent), ['静音', '音量', '全屏']);
  assert.equal(f.mount('2000').frame.querySelector('.video-audio'), null);
});

test('later video volume and mute controls affect only its source and restore its original audio settings', async t => {
  const f=fixture(t); f.source.volume=.65; f.source.muted=true;
  const view=f.mount('2015'); view.play.click(); await settle();
  const volume=view.frame.querySelector('[aria-label="音量"]'); assert.equal(Number(volume.value),.65);
  volume.value='.3'; volume.dispatchEvent(new f.win.Event('input')); assert.equal(f.source.volume,.3);
  const mute=[...view.frame.querySelectorAll('button')].find(b=>b.textContent==='取消静音'); mute.click(); assert.equal(f.source.muted,false);
  assert.equal(view.frame.querySelector('.video-clock').textContent,'00:20 / 01:40');
  view.controller.destroy(); assert.equal(f.source.volume,.65); assert.equal(f.source.muted,true);
});
test('live player binds the room video and never exposes seeking', async t => {
  const f=fixture(t); f.win.history.pushState(null,'','/livestream/room'); f.source.parentElement.id='app';
  const view=f.mount('2015'); view.play.click(); await settle();
  assert.equal(f.playCount(),1); assert.equal(view.seek.hidden,true); assert.equal(view.seek.disabled,true);
  assert.equal(view.frame.querySelector('.video-clock').textContent,'直播');
});

test('an explicit play owns only the source video and draws a proportional frame at 12 fps', async t => {
  const f = fixture(t); const view = f.mount(); view.play.click(); await settle();
  assert.equal(f.playCount(), 1); assert.deepEqual(f.allows, [f.source]); assert.equal(f.owner(), f.source);
  assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].delay, 1000 / 12);
  assert.deepEqual(f.drawings[0], { source: f.source, x: 0, y: 30, width: 320, height: 180 });
  assert.equal(view.play.textContent, '暂停'); assert.equal(view.seek.disabled, false); assert.equal(view.seek.value, '20');
});

test('pause cancels the sampling interval and resume creates one replacement interval', async t => {
  const f = fixture(t); const view = f.mount(); view.play.click(); await settle();
  const first = [...f.timers.keys()][0]; view.play.click(); await settle();
  assert.equal(f.pauseCount(), 1); assert.equal(f.state.paused, true); assert.equal(f.timers.size, 0); assert.ok(f.cleared.includes(first));
  assert.equal(view.play.textContent, '播放'); assert.equal(view.status.textContent, '暂停。');
  view.play.click(); await settle(); assert.equal(f.playCount(), 2); assert.equal(f.timers.size, 1);
});

test('seeking follows the source duration, while unknown durations stay disabled', async t => {
  const f = fixture(t); const view = f.mount(); view.play.click(); await settle();
  view.seek.value = '55'; view.seek.dispatchEvent(new f.win.Event('input'));
  assert.ok(Math.abs(f.state.currentTime - 55) < 1e-8); assert.ok(Math.abs(Number(view.seek.value) - 55) < 1e-8);
  const position = f.state.currentTime;
  const tick = [...f.timers.values()][0].callback;
  for (const duration of [NaN, Infinity, 0]) {
    f.state.duration = duration; tick(); assert.equal(view.seek.disabled, true);
    view.seek.value = '75'; view.seek.dispatchEvent(new f.win.Event('input')); assert.equal(f.state.currentTime, position);
  }
});

test('natural completion stops sampling and restores the play control', async t => {
  const f = fixture(t); const view = f.mount(); view.play.click(); await settle();
  const tick = [...f.timers.values()][0].callback; f.state.ended = true; tick();
  assert.equal(f.timers.size, 0); assert.equal(view.play.textContent, '播放'); assert.equal(view.status.textContent, '影片结束。');
});

test('an external pause releases playback immediately without waiting for the next frame', async t => {
  const f = fixture(t); const view = f.mount('2015'); view.play.click(); await settle();
  f.state.paused = true;
  f.source.dispatchEvent(new f.win.Event('pause'));
  assert.equal(f.timers.size, 0);
  assert.equal(f.owner(), null);
  assert.equal(view.play.textContent, '播放');
  assert.equal(view.status.textContent, '暂停。');
});

test('external ended and emptied events stop sampling and release the source', async t => {
  const f = fixture(t); const view = f.mount('2015'); view.play.click(); await settle();
  f.source.dispatchEvent(new f.win.Event('emptied'));
  assert.equal(f.timers.size, 0);
  assert.equal(f.owner(), null);
  assert.equal(view.seek.disabled, true);
  assert.match(view.status.textContent, /片源已更新/);
  view.play.click(); await settle();
  f.source.dispatchEvent(new f.win.Event('ended'));
  assert.equal(f.timers.size, 0);
  assert.equal(f.owner(), null);
  assert.equal(view.status.textContent, '影片结束。');
});

test('emptied media restores audio and stops the player it owns', async t => {
  const f = fixture(t); f.source.muted = true; f.source.volume = .7;
  const view = f.mount('2015'); view.play.click(); await settle();
  const volume = view.frame.querySelector('[aria-label="音量"]');
  volume.value = '.2'; volume.dispatchEvent(new f.win.Event('input'));
  view.frame.querySelector('button[aria-pressed]').click();
  assert.equal(f.source.volume, .2); assert.equal(f.source.muted, false);
  f.source.dispatchEvent(new f.win.Event('emptied'));
  assert.equal(f.owner(), null); assert.equal(f.timers.size, 0);
  assert.equal(f.source.volume, .7); assert.equal(f.source.muted, true);
  assert.equal(f.pauseCount(), 1);
});

test('a frame drawing failure pauses only its owned media and leaves no timer', async t => {
  const f = fixture(t); f.source.muted = true; f.source.volume = .7;
  const view = f.mount('2015');
  view.canvas.getContext = () => ({ fillRect() {}, set fillStyle(_) {}, drawImage() { throw new Error('Synthetic canvas failure'); } });
  view.play.click();
  const volume = view.frame.querySelector('[aria-label="音量"]');
  volume.value = '.2'; volume.dispatchEvent(new f.win.Event('input'));
  await settle();
  assert.equal(f.owner(), null); assert.equal(f.timers.size, 0);
  assert.equal(f.pauseCount(), 1); assert.equal(f.source.volume, .7); assert.equal(f.source.muted, true);
  assert.match(view.status.textContent, /不能在此窗口放映/);
});

test('a stale player drawing failure cannot pause or alter a replacement owner', async t => {
  const f = fixture(t); const old = f.mount('2015'); old.play.click(); await settle();
  old.canvas.getContext = () => ({ fillRect() {}, set fillStyle(_) {}, drawImage() { throw new Error('Stale canvas failure'); } });
  const oldTick = [...f.timers.values()][0].callback;
  const current = f.mount('2015'); current.play.click(); await settle();
  const beforePause = f.pauseCount(), beforeAudio = { muted: f.source.muted, volume: f.source.volume };
  oldTick();
  assert.equal(f.owner(), f.source); assert.equal(f.pauseCount(), beforePause);
  assert.equal(f.source.muted, beforeAudio.muted); assert.equal(f.source.volume, beforeAudio.volume);
  assert.equal(current.play.textContent, '暂停'); assert.equal(f.timers.size, 1);
});

test('replacement of the native video releases the obsolete player and restores its audio', async t => {
  const f = fixture(t); f.source.muted = true; f.source.volume = .6;
  const view = f.mount('2015'); view.play.click(); await settle();
  view.frame.querySelector('[aria-label="音量"]').value = '.3';
  view.frame.querySelector('[aria-label="音量"]').dispatchEvent(new f.win.Event('input'));
  const tick = [...f.timers.values()][0].callback;
  const replacement = f.doc.createElement('video');
  f.source.parentElement.replaceChildren(replacement);
  tick();
  assert.equal(f.timers.size, 0);
  assert.equal(f.owner(), null);
  assert.equal(f.source.volume, .6);
  assert.equal(f.source.muted, true);
  assert.equal(view.play.textContent, '播放');
  assert.match(view.status.textContent, /片源已更新/);
});

test('destroy pauses its video, clears sampling, releases ownership and detaches the frame', async t => {
  const f = fixture(t); const view = f.mount(); view.play.click(); await settle();
  const staleTick = [...f.timers.values()][0].callback; const before = f.drawings.length;
  view.controller.destroy();
  assert.equal(f.pauseCount(), 1); assert.equal(f.timers.size, 0); assert.equal(f.owner(), null); assert.equal(view.parent.childElementCount, 0);
  staleTick(); view.play.click(); await settle();
  assert.equal(f.drawings.length, before); assert.equal(f.playCount(), 1);
});

test('missing source media reports a plain failure without owning or starting playback', async t => {
  const f = fixture(t, { video: false }); const view = f.mount(); view.play.click(); await settle();
  assert.equal(f.playCount(), 0); assert.deepEqual(f.allows, []); assert.equal(f.timers.size, 0);
  assert.match(view.status.textContent, /尚未取得影片/);
});

test('a rejected explicit play releases the source and never creates a sampling interval', async t => {
  const f = fixture(t, { rejectPlay: true }); const view = f.mount(); view.play.click(); await settle();
  assert.equal(f.playCount(), 1); assert.deepEqual(f.allows, [f.source, null]); assert.equal(f.timers.size, 0);
  assert.equal(f.drawings.length, 0); assert.match(view.status.textContent, /暂不能播放/);
});

test('destroying a pending play leaves no continuation, new drawing or later owner release', async t => {
  const f = fixture(t, { deferred: true }); const view = f.mount(); view.play.click();
  assert.equal(f.promises.length, 1); view.controller.destroy();
  const afterDestroy = { pause: f.pauseCount(), allow: f.allows.length };
  f.promises[0].resolve(); await settle();
  assert.equal(f.pauseCount(), afterDestroy.pause); assert.equal(f.allows.length, afterDestroy.allow);
  assert.equal(f.timers.size, 0); assert.equal(f.drawings.length, 0); assert.equal(view.parent.childElementCount, 0);
});

test('pausing before play resolves cannot restart sampling or report an active playback', async t => {
  const f = fixture(t, { deferred: true }); const view = f.mount(); view.play.click(); view.play.click();
  assert.equal(f.state.paused, true); f.promises[0].resolve(); await settle();
  assert.equal(f.timers.size, 0); assert.equal(f.drawings.length, 0); assert.equal(view.play.textContent, '播放');
  assert.equal(view.status.textContent, '暂停。');
});

test('an old resolved promise cannot pause a replacement player or clear its ownership', async t => {
  const f = fixture(t, { deferred: true }); const old = f.mount(); old.play.click(); old.controller.destroy();
  const current = f.mount(); current.play.click(); f.promises[1].resolve(); await settle();
  assert.equal(f.owner(), f.source); assert.equal(f.state.paused, false); const pauses = f.pauseCount();
  f.promises[0].resolve(); await settle();
  assert.equal(f.pauseCount(), pauses); assert.equal(f.owner(), f.source); assert.equal(f.state.paused, false);
  assert.equal(f.timers.size, 1); assert.equal(current.play.textContent, '暂停');
});

test('an old rejected promise cannot clear a replacement player ownership or status', async t => {
  const f = fixture(t, { deferred: true }); const old = f.mount(); old.play.click(); old.controller.destroy();
  const current = f.mount(); current.play.click(); f.promises[1].resolve(); await settle();
  f.promises[0].reject(new Error('Synthetic stale rejection')); await settle();
  assert.equal(f.owner(), f.source); assert.equal(f.timers.size, 1); assert.equal(current.status.textContent, '正在放映。');
});

for (const [era, width, height, fps] of [['2005',400,300,15],['2010',640,360,24],['2015',960,540,30]]) test(`${era} video uses its own resolution and cadence and stops on destroy`, async t => {
  const f = fixture(t), view = f.mount(era);
  assert.equal(view.canvas.width, width); assert.equal(view.canvas.height, height); assert.equal(f.playCount(), 0);
  view.play.click(); await settle(); assert.equal([...f.timers.values()][0].delay, 1000/fps);
  view.controller.destroy(); assert.equal(f.timers.size, 0); assert.equal(f.owner(), null);
});

for (const event of ['pause', 'ended']) test(`external ${event} restores audio when releasing ownership`, async t => {
  const f = fixture(t); f.source.volume = .7; const view = f.mount('2015'); view.play.click(); await settle();
  const volume = view.frame.querySelector('[aria-label="音量"]'); volume.value = '.2'; volume.dispatchEvent(new f.win.Event('input'));
  f.state.paused = true; f.source.dispatchEvent(new f.win.Event(event));
  assert.equal(f.source.volume, .7); assert.equal(f.owner(), null); assert.equal(f.timers.size, 0);
});
test('unavailable canvas stops owned playback instead of leaving hidden audio running', async t => {
  const f = fixture(t), view = f.mount('2015'); view.canvas.getContext = () => null;
  view.play.click(); await settle();
  assert.equal(f.pauseCount(), 1); assert.equal(f.owner(), null); assert.equal(f.timers.size, 0);
  assert.match(view.status.textContent, /不能在此窗口放映/);
});
