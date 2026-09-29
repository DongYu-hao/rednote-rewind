const attribute = 'data-rednote-rewind-starting';
const DEFAULT_TIMEOUT = 12_000;

export interface StartupGuardOptions {
  timeoutMs?: number;
  onTimeout?(): void;
}

/** Hide the first modern paint while the extension reads its own preference.
 * This must be called synchronously at document_start, before any await.
 */
export function createStartupGuard(doc: Document, options: StartupGuardOptions = {}) {
  const win = doc.defaultView!;
  const style = doc.createElement('style');
  style.dataset.rednoteRewind = 'startup';
  // Opacity hides the whole source subtree, including descendants that explicitly
  // set visibility. Its layout remains intact for the site's normal startup.
  style.textContent = `html[${attribute}]{background:#c0c0c0!important}html[${attribute}]>body{opacity:0!important;pointer-events:none!important}`;
  const host = doc.createElement('rednote-rewind-startup');
  host.style.cssText = 'all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;background:#c0c0c0!important;color:#000!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const message = doc.createElement('p');
  message.style.cssText = 'margin:16px;font:16px/1.5 "Times New Roman","Songti SC",SimSun,serif;color:#000;';
  message.setAttribute('role', 'status');
  message.textContent = '正在读取网页，请稍候。';
  shadow.append(message);
  let root: HTMLElement | null = null;
  let previous: string | null = null;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new win.MutationObserver(install);

  function install() {
    if (!active || root || !doc.documentElement) return;
    root = doc.documentElement;
    previous = root.getAttribute(attribute);
    root.setAttribute(attribute, '');
    // document_start can run before head or body exists. Attaching to the root
    // avoids waiting for either and does not alter existing page inline styles.
    root.append(style, host);
    observer.disconnect();
  }

  function release() {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    observer.disconnect();
    style.remove();
    host.remove();
    if (root) {
      if (previous === null) root.removeAttribute(attribute);
      else root.setAttribute(attribute, previous);
    }
  }

  install();
  if (!root) observer.observe(doc, { childList: true, subtree: true });
  timer = setTimeout(() => {
    release();
    options.onTimeout?.();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT);

  return { release, get active() { return active; } };
}

/** Wait only for the DOM containers required by mountRewind, not document_idle.
 * Cancellation and timeout always settle the promise and remove the observer.
 */
export function waitForDocumentBody(
  doc: Document,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<boolean> {
  if (options.signal?.aborted) return Promise.resolve(false);
  if (doc.head && doc.body) return Promise.resolve(true);
  return new Promise(resolve => {
    const win = doc.defaultView!;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new win.MutationObserver(check);
    function finish(ready: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      options.signal?.removeEventListener('abort', cancel);
      resolve(ready);
    }
    function cancel() { finish(false); }
    function check() { if (doc.head && doc.body) finish(true); }
    observer.observe(doc, { childList: true, subtree: true });
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(cancel, options.timeoutMs ?? DEFAULT_TIMEOUT);
    check();
  });
}
