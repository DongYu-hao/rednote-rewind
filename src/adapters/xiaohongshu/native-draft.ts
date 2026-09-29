/** A contenteditable can contain images, emoji nodes or embeds with no textContent. */
export function hasNativeDraft(editor: HTMLElement) {
  if (editor.textContent) return true;
  const placeholder = (node: Node): boolean => {
    if (node.nodeType !== 1) return false;
    const element = node as Element;
    if (element.tagName === 'BR') return true;
    if (!['P', 'DIV'].includes(element.tagName) || element.attributes.length) return false;
    return [...element.childNodes].every(placeholder);
  };
  return [...editor.childNodes].some(node => !placeholder(node));
}

/** Undo only text this bridge inserted, never a later native or user edit. */
export function rollbackInsertedDraft(doc: Document, editor: HTMLElement, inserted: string, before: Node[]) {
  if (!editor.isConnected || editor.childNodes.length !== 1 || editor.firstChild?.nodeType !== 3 || editor.firstChild.textContent !== inserted) return;
  editor.replaceChildren(...before);
  const Input = doc.defaultView?.InputEvent;
  if (Input) editor.dispatchEvent(new Input('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
}
