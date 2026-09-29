type Picture = { src: string; width: number; height: number };
type Options = {
  label: string;
  quality?: number;
  maxWidth: number;
  maxHeight?: number;
  slow?: boolean;
  delay?: number;
};

/** Display a reduced colour picture without persistent image storage. */
export function mountPeriodImage(doc: Document, parent: HTMLElement, picture: Picture, options: Options) {
  const win = doc.defaultView;
  const figure = doc.createElement('figure');
  figure.className = 'picture';
  figure.dataset.periodImage = '';
  const frame = doc.createElement('div');
  frame.className = 'period-image-frame';
  const caption = doc.createElement('figcaption');
  caption.textContent = `${options.label} 正在读取。`;
  figure.append(frame, caption);
  parent.append(figure);

  const bounded = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? Math.min(2048, value) : fallback;
  const maxWidth = bounded(options.maxWidth, 480);
  const maxHeight = bounded(options.maxHeight ?? maxWidth, maxWidth);
  function dimensions(width: number, height: number, widthLimit = maxWidth, heightLimit = maxHeight) {
    const ratio = Math.min(1, widthLimit / width, heightLimit / height);
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }
  const knownSize = picture.width > 0 && picture.height > 0 && Number.isFinite(picture.width) && Number.isFinite(picture.height);
  // The initial bounded frame stays fixed even if decoded dimensions differ.
  // Its caption and surrounding table rows therefore do not jump on arrival.
  const initial = knownSize
    ? dimensions(picture.width, picture.height)
    : dimensions(Math.min(maxWidth, 160), Math.min(maxHeight, 120));
  function reserve(width: number, height: number) {
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  }
  reserve(initial.width, initial.height);
  let destroyed = false;
  let image: HTMLImageElement | null = null;
  let delayTimer: number | undefined;
  let timeoutTimer: number | undefined;
  let attempt = 0;
  function clearTimeoutTimer() {
    if (timeoutTimer !== undefined) win?.clearTimeout(timeoutTimer);
    timeoutTimer = undefined;
  }
  function detachImage() {
    if (!image) return;
    const request = image;
    request.onload = null;
    request.onerror = null;
    image = null;
    // Only this Image is ours. Clearing its address aborts a pending fetch;
    // the site's own <img> is never touched.
    request.removeAttribute('src');
  }
  function fail() {
    if (destroyed) return;
    clearTimeoutTimer();
    detachImage();
    frame.replaceChildren();
    delete figure.dataset.imageTreatment;
    figure.dataset.imageState = 'failed';
    caption.textContent = `${options.label} 暂不能读取。`;
  }

  let source: string | null = null;
  try {
    const url = new URL(picture.src, doc.baseURI);
    if (picture.src.trim() && /^https?:$/.test(url.protocol) && !url.username && !url.password) source = url.href;
  } catch { /* Invalid image addresses remain a local failure. */ }

  function decodedSource(): HTMLImageElement | null {
    if (!source) return null;
    for (const candidate of doc.querySelectorAll<HTMLImageElement>('img')) {
      if (candidate.closest('[data-period-image]') || !candidate.complete || candidate.naturalWidth <= 0 || candidate.naturalHeight <= 0) continue;
      const raw = candidate.currentSrc || candidate.getAttribute('src');
      if (!raw) continue;
      try { if (new URL(raw, doc.baseURI).href === source) return candidate; } catch { /* Ignore invalid native addresses. */ }
    }
    return null;
  }

  function mayRequest(): boolean {
    if (!source) return false;
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' && doc.location.protocol === 'https:') return false;
    return url.origin === doc.location.origin ||
      ['xiaohongshu.com', 'xhscdn.com', 'xhscdn.net'].some(domain => host === domain || host.endsWith(`.${domain}`));
  }

  function display(decoded: HTMLImageElement, drawFailure: () => void, retryExport = false, encode = true) {
    if (destroyed) return;
    const width = decoded.naturalWidth;
    const height = decoded.naturalHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) { fail(); return; }
    // Sampling quality is independent of the reserved display box. Unknown
    // source dimensions must not permanently reduce a large image to 160×120.
    const size = dimensions(width, height);
    const shown = dimensions(width, height, initial.width, initial.height);
    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    let context: CanvasRenderingContext2D | null;
    try { context = canvas.getContext('2d'); } catch { fail(); return; }
    if (!context) { fail(); return; }
    try {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(decoded, 0, 0, size.width, size.height);
    } catch { drawFailure(); return; }
    let output: HTMLImageElement | HTMLCanvasElement = canvas;
    try {
      if (!encode) throw new Error('Canvas fallback');
      const encoded = canvas.toDataURL('image/jpeg', options.quality ?? 0.45);
      if (!encoded.startsWith('data:image/jpeg;base64,') || encoded.length <= 23) throw new Error('JPEG unavailable');
      const reduced = doc.createElement('img');
      reduced.alt = options.label;
      reduced.width = size.width;
      reduced.height = size.height;
      reduced.src = encoded;
      output = reduced;
      figure.dataset.imageTreatment = 'jpeg';
    } catch {
      // The already decoded native image can be tainted. Its canvas is still
      // displayable, and we need not fetch the same full picture again.
      if (retryExport) { drawFailure(); return; }
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', options.label);
      figure.dataset.imageTreatment = 'resized';
    }
    output.style.width = `${shown.width}px`;
    output.style.height = `${shown.height}px`;
    frame.replaceChildren(output);
    figure.dataset.imageState = 'ready';
    caption.textContent = options.label;
    clearTimeoutTimer();
    detachImage();
  }

  function load(anonymous: boolean) {
    if (destroyed || !win || !source) { fail(); return; }
    clearTimeoutTimer();
    detachImage();
    if (anonymous) {
      const native = decodedSource();
      if (native) { display(native, fail); return; }
    }
    if (!mayRequest()) { fail(); return; }
    const request = new win.Image();
    image = request;
    const currentAttempt = ++attempt;
    if (anonymous) request.crossOrigin = 'anonymous';
    figure.dataset.imageState = 'loading';
    caption.textContent = `${options.label} 正在读取。`;
    const current = () => !destroyed && image === request && attempt === currentAttempt;
    function retryOrFail() {
      if (!current()) return;
      if (anonymous) load(false);
      else fail();
    }
    request.onload = () => {
      if (!current()) return;
      clearTimeoutTimer();
      display(request, retryOrFail, anonymous, anonymous);
    };
    request.onerror = retryOrFail;
    timeoutTimer = win.setTimeout(retryOrFail, 12000);
    request.src = source;
  }
  if (!win || !source) fail();
  else if (options.slow) {
    const delay = Number.isFinite(options.delay) ? Math.max(0, Math.min(5000, options.delay!)) : 600;
    figure.dataset.imageState = 'waiting';
    caption.textContent = `${options.label} 等待读取。`;
    delayTimer = win.setTimeout(() => { delayTimer = undefined; load(true); }, delay);
  } else load(true);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (delayTimer !== undefined) win?.clearTimeout(delayTimer);
      clearTimeoutTimer();
      ++attempt;
      detachImage();
      frame.replaceChildren();
      source = null;
      figure.remove();
    },
  };
}
