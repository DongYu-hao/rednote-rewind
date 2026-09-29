import { hasNativeDraft, rollbackInsertedDraft } from './native-draft';
import { sourceSubject, sourceVisible } from './capabilities';

/** Forward only a user's explicit submission to the current native comment form. */
export async function submitNativeComment(doc: Document, expectedURL: string, draft: string, expectedReply = '', isCurrent = () => true): Promise<string | null> {
  if (!draft.trim()) return '请先填写留言。';
  if (doc.defaultView?.location.href !== expectedURL || !isCurrent()) return '文章已经变化，请重新打开留言页。';
  if (doc.querySelector('a[href="#reference"][data-reference-path]')) return '静态参考页面不执行操作。';
  const notes = [...doc.querySelectorAll('#noteContainer, .note-container')].filter(sourceVisible);
  const note = notes.length === 1 ? notes[0] : null;
  const areas = [...(note?.querySelectorAll('.interaction-container') || [])].filter(sourceVisible);
  const area = areas.length === 1 ? areas[0] : null;
  const editors = [...(area?.querySelectorAll<HTMLElement>('.content-input[contenteditable="true"]') || [])].filter(sourceVisible);
  const submits = [...(area?.querySelectorAll<HTMLButtonElement>('.right-btn-area button.submit') || [])].filter(sourceVisible);
  const editor = editors.length === 1 ? editors[0] : null;
  const submit = submits.length === 1 ? submits[0] : null;
  if (!note || !area || !editor || !submit || !editor.isConnected || !submit.isConnected) return '尚未取得唯一的原站留言表单。请切换至 now 留言。';
  const noteSubject = sourceSubject(note);
  const replyContext = () => {
    const placeholder = editor.getAttribute('data-placeholder') || editor.getAttribute('placeholder') || '';
    return placeholder.includes('回复') ? placeholder : '';
  };
  if (replyContext() !== expectedReply) return '回复对象已经变化，请重新选择回复或在原站结束回复。';
  // Never replace a draft typed in the original application, including whitespace.
  if (hasNativeDraft(editor)) return '原站已有未发送的内容，请切换至 now 处理后再留言。';
  const before = [...editor.childNodes].map(node => node.cloneNode(true));
  editor.textContent = draft;
  const Input = doc.defaultView!.InputEvent;
  editor.dispatchEvent(new Input('input', { bubbles: true, inputType: 'insertText', data: draft }));
  // Vue may update the disabled state on the next microtask.
  await Promise.resolve();
  const sameForm = () => notes.length === 1 && note.isConnected && sourceVisible(note) && sourceSubject(note) === noteSubject
    && doc.querySelectorAll('#noteContainer, .note-container').length === 1
    && note.querySelectorAll('.interaction-container').length === 1
    && area.querySelectorAll('.content-input[contenteditable="true"]').length === 1
    && area.querySelectorAll('.right-btn-area button.submit').length === 1
    && editor.isConnected && submit.isConnected && sourceVisible(editor) && sourceVisible(submit);
  if (doc.defaultView?.location.href !== expectedURL || !isCurrent() || replyContext() !== expectedReply || !sameForm()) {
    rollbackInsertedDraft(doc, editor, draft, before);
    return '文章或回复对象已经变化，文字未发送。';
  }
  if (submit.disabled || submit.getAttribute('aria-disabled') === 'true') return '原站尚未允许发送。文字已留在原站，请切换至 now 检查。';
  submit.click();
  // A click is a request, not evidence that the server accepted it.
  return null;
}
