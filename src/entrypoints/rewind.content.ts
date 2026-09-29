import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { mountRewind } from '../rewind';
import { createStartupGuard, waitForDocumentBody } from '../startup-guard';
import { normalizeEra } from '../eras';

export default defineContentScript({
  matches: ['https://www.xiaohongshu.com/*'],
  runAt: 'document_start',
  async main(ctx) {
    const cancellation = new AbortController();
    // Install before storage or DOM waits: a full navigation must not expose a
    // modern frame while restoring the historical preference.
    const guard = createStartupGuard(document, { onTimeout: () => cancellation.abort() });
    let rewind: ReturnType<typeof mountRewind> | undefined;
    let toggleQueued = false;
    const onMessage = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'rewind:toggle') {
        if (rewind) rewind.togglePanel();
        else toggleQueued = !toggleQueued;
        return Promise.resolve({ ok: true });
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);
    function cleanup() {
      cancellation.abort();
      guard.release();
      browser.runtime.onMessage.removeListener(onMessage);
      rewind?.destroy();
      rewind = undefined;
    }
    ctx.onInvalidated(cleanup);
    if (ctx.isInvalid) { cleanup(); return; }
    const cancelled = new Promise<null>(resolve => {
      cancellation.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    try {
      const saved = await Promise.race([
        browser.storage.local.get(['era', 'panelOpen']),
        cancelled,
      ]);
      if (!saved || cancellation.signal.aborted || ctx.isInvalid) { cleanup(); return; }
      const initial = normalizeEra(saved.era);
      // A normal page need not wait for body before shedding the startup guard.
      if (initial === 'now') guard.release();
      const ready = await waitForDocumentBody(document, { signal: cancellation.signal });
      if (!ready || cancellation.signal.aborted || ctx.isInvalid) { cleanup(); return; }

      // Keep enough state to roll back a synchronous partial mount failure.
      // No source content, credentials or account data are copied or persisted.
      const originalEra = document.documentElement.getAttribute('data-rednote-rewind-era');
      const originalNodes = new Set(document.querySelectorAll('rednote-rewind-control, rednote-rewind-document, style[data-rednote-rewind="document"], style[data-rewind-font]'));
      const sourceState = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement).map(node => ({
        node, inert: node.inert, aria: node.getAttribute('aria-hidden'), marker: node.getAttribute('data-rewind-source'),
      }));
      try {
        rewind = mountRewind(document, {
          initial,
          resolveAssetURL: path => new URL(path, browser.runtime.getURL('/')).href,
          open: saved.panelOpen === true,
          save: era => { void browser.storage.local.set({ era }).catch(() => {}); },
          onPanelChange: panelOpen => { void browser.storage.local.set({ panelOpen }).catch(() => {}); },
        });
      } catch (error) {
        for (const node of document.querySelectorAll('rednote-rewind-control, rednote-rewind-document, style[data-rednote-rewind="document"], style[data-rewind-font]')) {
          if (!originalNodes.has(node)) node.remove();
        }
        if (originalEra === null) document.documentElement.removeAttribute('data-rednote-rewind-era');
        else document.documentElement.setAttribute('data-rednote-rewind-era', originalEra);
        for (const state of sourceState) {
          state.node.inert = state.inert;
          for (const [name, value] of [['aria-hidden', state.aria], ['data-rewind-source', state.marker]] as const) {
            if (value === null) state.node.removeAttribute(name); else state.node.setAttribute(name, value);
          }
        }
        throw error;
      }
      // mountRewind installs the historical isolation synchronously. Only now is
      // it safe to expose the page, without an intervening modern paint.
      guard.release();
      if (toggleQueued) rewind.togglePanel();
    } catch {
      // Storage failure, invalid extension context or mounting failure must not
      // leave a blank page. No potentially private exception payload is logged.
      cleanup();
    }
  },
});
