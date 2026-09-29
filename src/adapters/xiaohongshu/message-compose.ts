import { hasNativeDraft, rollbackInsertedDraft } from './native-draft';
import { sourceVisible } from './capabilities';

/** Send only explicit user input, against a validated current conversation. */
export function nativeMessageForm(doc: Document) {
  const pages = [...doc.querySelectorAll('.xhs-im-page')].filter(sourceVisible);
  const page = pages.length === 1 ? pages[0] : null;
  const editors = [...(page?.querySelectorAll<HTMLElement>('.xhs-im-editor[contenteditable="true"]') || [])].filter(sourceVisible);
  const editor = editors.length === 1 ? editors[0] : null;
  const buttons = [...(page?.querySelectorAll<HTMLButtonElement>('button') || [])].filter(button => sourceVisible(button) && button.textContent?.trim() === '发送');
  const submit = buttons.length === 1 ? buttons[0] : null;
  if (editor?.closest('.xhs-im-chat-window') && (!submit || !editor.closest('.xhs-im-chat-window')?.contains(submit))) return null;
  return page && editor && submit && editor.isConnected && submit.isConnected ? { page, editor, submit } : null;
}
export async function submitNativeMessage(doc: Document, draft: string, isCurrent: () => boolean) {
  if (!draft.trim()) return '请先填写消息。';
  if (!isCurrent()) return '会话已经变化，请重新选择收件人。';
  if (doc.querySelector('a[href="#reference"][data-reference-path]')) return '静态参考页面不执行操作。';
  const form = nativeMessageForm(doc);
  if (!form) return '尚未取得原站发送控件。';
  const { editor, submit } = form;
  if (hasNativeDraft(editor)) return '原站有未发送的内容，请先处理原有草稿。';
  const before = [...editor.childNodes].map(node => node.cloneNode(true));
  editor.textContent = draft;
  editor.dispatchEvent(new doc.defaultView!.InputEvent('input', { bubbles: true, inputType: 'insertText', data: draft }));
  await Promise.resolve();
  const currentForm = nativeMessageForm(doc);
  if (!isCurrent() || currentForm?.page !== form.page || currentForm.editor !== editor || currentForm.submit !== submit) {
    rollbackInsertedDraft(doc, editor, draft, before);
    return '会话或发送控件已经变化，文字未发送。';
  }
  if (submit.disabled || submit.getAttribute('aria-disabled') === 'true') return '原站暂未允许发送，文字已留在原站。';
  submit.click(); return null;
}
