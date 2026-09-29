import type { HistoricalEra } from './eras';

type DocumentAction = (HTMLAnchorElement | HTMLButtonElement) & { disabled: boolean };

/** Browser tools may have buttons; the 1985 terminal uses text commands. */
export function documentAction(doc: Document, era: HistoricalEra, label: string, run: () => void): DocumentAction {
  const node = doc.createElement(era === '1985' ? 'a' : 'button') as DocumentAction;
  node.textContent = label;
  if (node.tagName === 'BUTTON') (node as HTMLButtonElement).type = 'button';
  else {
    let disabled = false;
    Object.defineProperty(node, 'disabled', {
      get: () => disabled,
      set(value: boolean) {
        disabled = value;
        node.setAttribute('aria-disabled', String(value));
        if (value) { node.removeAttribute('href'); node.tabIndex = -1; }
        else { node.setAttribute('href', '#'); node.removeAttribute('tabindex'); }
      },
    });
    node.disabled = false;
  }
  node.addEventListener('click', event => {
    event.preventDefault();
    if (!node.disabled) run();
  });
  return node;
}
