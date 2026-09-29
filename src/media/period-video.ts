const mediaOwners = new WeakMap<HTMLMediaElement, object>();

/** A small, deliberate player reuses the site's decoded video without copying its URL. */
export function mountPeriodVideo(doc: Document, parent: HTMLElement, allow: (source: HTMLMediaElement | null) => void, era = '2000') {
  const win = doc.defaultView!;
  const frame = doc.createElement('section'); frame.className = 'period-video'; frame.dataset.periodVideo = '';
  const live = /^\/livestream\//.test(doc.location.pathname);
  const later = ['2005','2010','2015'].includes(era);
  const title = doc.createElement('h3'); title.textContent = live ? '现场直播' : later ? '视频' : '影片放映';
  const [screenWidth, screenHeight, fps] = era === '2015' ? [960, 540, 30] : era === '2010' ? [640, 360, 24] : era === '2005' ? [400, 300, 15] : [320, 240, 12];
  const canvas = doc.createElement('canvas'); canvas.width = screenWidth; canvas.height = screenHeight;
  canvas.setAttribute('aria-label', '影片画面'); canvas.setAttribute('role', 'img');
  const controls = doc.createElement('div'); controls.className = 'video-controls';
  const transport = doc.createElement('div'); transport.className = 'video-transport'; transport.setAttribute('role', 'group'); transport.setAttribute('aria-label', '播放控制');
  const audio = doc.createElement('div'); audio.className = 'video-audio'; audio.setAttribute('role', 'group'); audio.setAttribute('aria-label', '声音与画面控制');
  const play = doc.createElement('button'); play.type = 'button'; play.textContent = '播放';
  const seek = doc.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '100'; seek.value = '0'; seek.setAttribute('aria-label', '播放位置'); seek.disabled = true;
  const status = doc.createElement('p'); status.textContent = '按播放键开始读取影片。'; status.setAttribute('role', 'status');
  transport.append(play, seek); controls.append(transport); frame.append(title, canvas, controls, status); parent.append(frame);
  let source: HTMLVideoElement | null = null;
  let timer: number | undefined;
  let destroyed = false;
  let attempt = 0;
  let starting = false;
  let originalAudio: { muted: boolean; volume: number } | null = null;
  let owned = false;
  const ownerToken = {};
  let userPausing = false;
  const clock = doc.createElement('span'); clock.className = 'video-clock'; clock.textContent = live ? '直播' : '00:00 / --:--';
  const mute = doc.createElement('button'); mute.type = 'button'; mute.textContent = '静音'; mute.setAttribute('aria-pressed','false');
  const volume = doc.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.05'; volume.value = '1'; volume.className = 'video-volume'; volume.setAttribute('aria-label','音量');
  const full = doc.createElement('button'); full.type = 'button'; full.textContent = '全屏';
  if (later) { transport.append(clock); audio.append(mute, volume, full); controls.append(audio); }
  if (live) { seek.hidden = true; seek.disabled = true; }
  const time = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}` : '--:--';
  mute.addEventListener('click', () => { if (!source || destroyed || findSource() !== source) return; source.muted = !source.muted; mute.textContent = source.muted ? '取消静音' : '静音'; mute.setAttribute('aria-pressed',String(source.muted)); });
  volume.addEventListener('input', () => { if (source && !destroyed && findSource() === source) source.volume = Math.min(1, Math.max(0, Number(volume.value))); });
  full.addEventListener('click', async () => { if (destroyed) return; try { if (doc.fullscreenElement) await doc.exitFullscreen(); else await frame.requestFullscreen(); } catch { if (!destroyed) status.textContent = '当前浏览器未允许全屏播放。'; } });
  function stop() { if (timer !== undefined) win.clearInterval(timer); timer = undefined; }
  const holdsSource = () => !!source && owned && mediaOwners.get(source) === ownerToken;
  function release() {
    if (!owned) return;
    const held = holdsSource();
    owned = false;
    if (held && source) { mediaOwners.delete(source); allow(null); }
  }
  function restoreAudio() {
    if (source && originalAudio && !mediaOwners.has(source)) { source.muted = originalAudio.muted; source.volume = originalAudio.volume; }
    originalAudio = null;
  }
  function onPause() {
    if (destroyed || userPausing || !source || !source.paused || source.ended) return;
    ++attempt; starting = false; stop(); release(); restoreAudio();
    play.textContent = '播放'; status.textContent = '暂停。';
  }
  function onEnded() {
    if (destroyed) return;
    ++attempt; starting = false; stop(); release(); restoreAudio();
    play.textContent = '播放'; status.textContent = '影片结束。';
  }
  function onEmptied() {
    if (destroyed) return;
    failPlayback('片源已更新，请重新播放。');
  }
  function detachSource() {
    if (!source) return;
    source.removeEventListener('pause', onPause);
    source.removeEventListener('ended', onEnded);
    source.removeEventListener('emptied', onEmptied);
    restoreAudio();
    source = null;
  }
  const findSource = () => doc.querySelector<HTMLVideoElement>(live ? '#app video' : '#noteContainer video, .note-container video');
  function failPlayback(message: string) {
    ++attempt; starting = false; stop();
    const previous = source;
    const played = holdsSource();
    release();
    // An old completion or failed draw must never pause a video now owned by
    // another player. Only stop the current instance's active source.
    if (played && previous?.isConnected && findSource() === previous && !previous.paused) {
      userPausing = true;
      try { previous.pause(); } catch { /* Continue releasing this player. */ }
      finally { userPausing = false; }
    }
    detachSource();
    play.textContent = '播放'; seek.disabled = true; status.textContent = message;
  }
  function sourceChanged() {
    ++attempt; starting = false; stop();
    const previous = source;
    const played = holdsSource();
    release(); detachSource();
    if (played) previous?.pause();
    play.textContent = '播放'; seek.disabled = true;
    status.textContent = '片源已更新，请重新播放。';
  }
  function paint() {
    if (!source || destroyed) return;
    if (!source.isConnected || findSource() !== source) {
      sourceChanged();
      return;
    }
    if (source.ended) { onEnded(); return; }
    if (source.paused && !starting) { onPause(); return; }
    if (source.readyState >= 2 && source.videoWidth > 0 && source.videoHeight > 0) {
      const scale = Math.min(screenWidth / source.videoWidth, screenHeight / source.videoHeight);
      const width = Math.round(source.videoWidth * scale), height = Math.round(source.videoHeight * scale);
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        { context.fillStyle = '#000'; context.fillRect(0, 0, screenWidth, screenHeight); context.drawImage(source, (screenWidth - width) / 2, (screenHeight - height) / 2, width, height); }
      } catch {
        failPlayback('当前影片不能在此窗口放映，请切换至 now。');
        return;
      }
    }
    const duration = source.duration;
    seek.disabled = live || !Number.isFinite(duration) || duration <= 0;
    clock.textContent = live ? '直播' : `${time(source.currentTime)} / ${time(duration)}`;
    if (!seek.disabled) seek.value = String(source.currentTime / duration * 100);
  }
  play.addEventListener('click', async () => {
    if (destroyed) return;
    if (source && (starting || !source.paused)) {
      ++attempt; starting = false; stop(); release(); userPausing = true;
      try { source.pause(); } finally { userPausing = false; }
      play.textContent = '播放'; status.textContent = '暂停。'; return;
    }
    if (source && (!source.isConnected || findSource() !== source)) sourceChanged();
    source ??= findSource();
    if (!source) { status.textContent = '尚未取得影片，请重新读取或切换至 now。'; return; }
    if (!originalAudio) {
      originalAudio = { muted: source.muted, volume: source.volume };
      source.addEventListener('pause', onPause);
      source.addEventListener('ended', onEnded);
      source.addEventListener('emptied', onEmptied);
      volume.value = String(source.volume); mute.textContent = source.muted ? '取消静音' : '静音'; mute.setAttribute('aria-pressed', String(source.muted));
    }
    const currentAttempt = ++attempt; starting = true; play.textContent = '暂停';
    mediaOwners.set(source, ownerToken); allow(source); owned = true;
    try {
      await source.play();
      if (destroyed || currentAttempt !== attempt) return;
      if (!source.isConnected || findSource() !== source) { sourceChanged(); return; }
      if (source.paused || source.ended) { onEmptied(); return; }
      starting = false;
      play.textContent = '暂停'; status.textContent = '正在放映。'; paint();
      if (destroyed || currentAttempt !== attempt || !holdsSource()) return;
      stop(); timer = win.setInterval(paint, 1000 / fps);
    } catch {
      if (destroyed || currentAttempt !== attempt) return;
      failPlayback('暂不能播放，请切换至 now 查看。');
    }
  });
  seek.addEventListener('input', () => { if (source && findSource() === source && !seek.disabled) { source.currentTime = Number(seek.value) / 100 * source.duration; paint(); } });
  return { destroy() {
    if (destroyed) return;
    destroyed = true; ++attempt; starting = false; stop();
    const played = holdsSource(); release();
    if (played) source?.pause();
    detachSource(); frame.remove();
  } };
}
