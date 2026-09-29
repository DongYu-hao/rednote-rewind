export function rasterSize(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Drawing a loaded cross-origin image is allowed. We never read/export pixels,
// fetch credentials, change its URL, or require additional host permissions.
export function createImageTreatment(doc: Document) {
  const win = doc.defaultView!;
  const images = new Map<HTMLImageElement, HTMLCanvasElement>();
  const selector = '#app .cover img, #app .note-slider-img img, #app .img-container img';
  let active = false;
  let timer = 0;
  function scan() {
    if (!active) return;
    images.forEach((canvas, img) => {
      if (!img.isConnected || !canvas.isConnected) {
        canvas.remove(); img.removeAttribute('data-rewind-raster'); images.delete(img);
      }
    });
    doc.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
      if (!img.complete || !img.naturalWidth || !img.parentElement) return;
      let canvas = images.get(img);
      if (canvas && sources.get(canvas) === img.currentSrc) return;
      const size = rasterSize(img.naturalWidth, img.naturalHeight, img.closest('.cover') ? 80 : 240);
      canvas ??= doc.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      try { context.drawImage(img, 0, 0, size.width, size.height); }
      catch { return; }
      canvas.className = 'rewind-raster';
      canvas.setAttribute('aria-hidden', 'true');
      // Keep source comparison in memory, not DOM attributes containing signed URLs.
      sources.set(canvas, img.currentSrc);
      canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${win.getComputedStyle(img).objectFit || 'cover'};pointer-events:none;image-rendering:pixelated;z-index:1;`;
      img.setAttribute('data-rewind-raster', '');
      if (!canvas.isConnected) img.parentElement.append(canvas);
      images.set(img, canvas);
    });
  }
  const sources = new WeakMap<HTMLCanvasElement, string>();
  function schedule() {
    if (active && !timer) timer = win.setTimeout(() => { timer = 0; scan(); }, 100);
  }
  const observer = new win.MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' || [...record.addedNodes].some(node => !(node instanceof win.HTMLCanvasElement)))) schedule();
  });
  const load = (event: Event) => {
    if (event.target instanceof win.HTMLImageElement && event.target.matches(selector)) {
      const canvas = images.get(event.target); if (canvas) sources.delete(canvas);
      schedule();
    }
  };
  function disable() {
    active = false; observer.disconnect(); doc.removeEventListener('load', load, true);
    win.clearTimeout(timer); timer = 0;
    images.forEach((canvas, img) => { canvas.remove(); img.removeAttribute('data-rewind-raster'); }); images.clear();
  }
  return {
    enable() {
      if (active) return;
      active = true; scan();
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
      doc.addEventListener('load', load, true);
    },
    disable,
  };
}
