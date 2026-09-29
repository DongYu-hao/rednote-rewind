/** Isolate the original light DOM without rescanning the document on every mutation. */
export function createSourceIsolation(doc: Document, allowedMedia: () => HTMLMediaElement | null) {
  const win = doc.defaultView!;
  const originals = new Map<HTMLElement, { inert: boolean; aria: string | null; marker: string | null }>();
  const owned = (node: Element) => node.matches('rednote-rewind-document,rednote-rewind-control');
  function restore(node: HTMLElement) {
    const original = originals.get(node);
    if (!original) return;
    node.inert = original.inert;
    for (const [name, value] of [['aria-hidden', original.aria], ['data-rewind-source', original.marker]]) {
      if (value === null) node.removeAttribute(name!); else node.setAttribute(name!, value!);
    }
    originals.delete(node);
  }
  function isolate(node: Element) {
    if (!(node instanceof win.HTMLElement) || owned(node)) return;
    if (!originals.has(node)) originals.set(node, { inert: node.inert, aria: node.getAttribute('aria-hidden'), marker: node.getAttribute('data-rewind-source') });
    if (!node.inert) node.inert = true;
    if (node.getAttribute('aria-hidden') !== 'true') node.setAttribute('aria-hidden', 'true');
    if (!node.hasAttribute('data-rewind-source')) node.setAttribute('data-rewind-source', '');
  }
  function pause(node: Element) {
    if (node instanceof win.HTMLMediaElement && node !== allowedMedia() && !node.paused) node.pause();
  }
  function inspect(node: Element) {
    if (owned(node)) return;
    pause(node);
    for (const media of node.querySelectorAll('video,audio')) pause(media);
  }
  const observer = new win.MutationObserver(records => {
    const added = new Set<Element>();
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof win.Element && record.target.parentElement === doc.body) isolate(record.target);
      for (const node of record.removedNodes) if (node instanceof win.HTMLElement && node.parentElement !== doc.body) restore(node);
      for (const node of record.addedNodes) if (node instanceof win.Element && node.isConnected) added.add(node);
    }
    for (const node of added) {
      if (node.parentElement === doc.body) isolate(node);
      // Ancestor scans include nested additions in this same observer batch.
      let parent = node.parentElement;
      while (parent && !added.has(parent)) parent = parent.parentElement;
      if (!parent) inspect(node);
    }
  });
  return {
    enable() {
      for (const child of doc.body.children) { isolate(child); inspect(child); }
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'data-rewind-source'] });
    },
    disable() { observer.disconnect(); for (const node of originals.keys()) restore(node); },
  };
}
