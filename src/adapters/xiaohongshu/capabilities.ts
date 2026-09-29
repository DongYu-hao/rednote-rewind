import { hasNativeDraft } from './native-draft';

/** Native controls are discovered from the current DOM, never from private APIs. */
export type NativeControl = {
  id: string; label: string; kind: 'like' | 'collect' | 'follow' | 'tab' | 'filter' | 'filter-open' | 'reply' | 'replies';
  subject: string; group: string; active: boolean | null; count: string; disabled: boolean; targetLabel?: string;
};
const value = (node: Element | null) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
export function sourceSubject(root: Element) {
  if (root.matches('.comment-item')) return root.id || [value(root.querySelector('.content')), value(root.querySelector('.author-wrapper .name, .author .name'))].join('|');
  if (root.matches('.note-item')) return root.querySelector('a.cover, a.title')?.getAttribute('href') || '';
  if (root.matches('#noteContainer,.note-container')) return [root.getAttribute('data-note-id'), value(root.querySelector('#detail-title')), value(root.querySelector('#detail-desc')), root.querySelector('.author a[href], .author-wrapper a.name')?.getAttribute('href')].join('|');
  return value(root.querySelector('.user-name')) || root.getAttribute('class') || '';
}
export function sourceVisible(node: Element) {
  for (let n: Element | null = node; n && n.tagName !== 'BODY'; n = n.parentElement) {
    if (n.hasAttribute('hidden') || (n.getAttribute('aria-hidden') === 'true' && !n.hasAttribute('data-rewind-source'))) return false;
    const s = (n as HTMLElement).style;
    if (s?.display === 'none' || s?.visibility === 'hidden') return false;
  }
  return true;
}
function state(node: HTMLElement, kind: NativeControl['kind']): boolean | null {
  const explicit = node.getAttribute('aria-pressed') ?? node.getAttribute('aria-selected');
  if (explicit === 'true' || explicit === 'false') return explicit === 'true';
  if (kind === 'follow') return /已关注|互相关注|取消关注/.test(value(node));
  if (kind === 'tab' || kind === 'filter') return node.classList.contains('active') || node.classList.contains('selected');
  const use = node.querySelector('use');
  const icon = use?.getAttribute('href') || use?.getAttribute('xlink:href') || '';
  if (/#(?:liked|collected|like-filled|collect-filled)$/.test(icon)) return true;
  if (/#(?:like_b|collect_b|like|collect)$/.test(icon)) return false;
  return null;
}
export function createNativeCapabilities(doc: Document) {
  let serial = 0;
  const ids = new WeakMap<Element, number>();
  const bindings = new Map<string, { node: HTMLElement; root: Element; subject: string; key: string; kind: NativeControl['kind']; label: string }>();
  let selection: { id: string; binding: NonNullable<ReturnType<typeof bindings.get>> } | null = null;
  function add(out: NativeControl[], node: HTMLElement | null, root: Element, kind: NativeControl['kind'], label: string, group = '') {
    if (!node || !sourceVisible(node)) return;
    let n = ids.get(node); if (!n) { n = ++serial; ids.set(node, n); }
    const id = `native-${n}`, subject = sourceSubject(root);
    bindings.set(id, { node, root, subject, key: doc.location.href, kind, label });
    const raw = value(node.querySelector('.count'));
    out.push({ id, subject, kind, label, group, active: state(node, kind), count: /^[\d.,]+[万千kKwW+]*$/.test(raw) ? raw : '', disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true' });
  }
  function read() {
    bindings.clear(); const out: NativeControl[] = [];
    const noteRoute = /^\/(?:explore|search_result)\/[^/]+\/?$/.test(doc.location.pathname) || /^\/user\/profile\/[^/]+\/[^/]+/.test(doc.location.pathname);
    const note = noteRoute ? [...doc.querySelectorAll('#noteContainer,.note-container')].find(sourceVisible) : null;
    if (note) {
      const own = (selector: string) => [...note.querySelectorAll<HTMLElement>(selector)].find(n => !n.closest('.comment-item')) ?? null;
      add(out, own('.like-wrapper'), note, 'like', '赞');
      add(out, own('.collect-wrapper'), note, 'collect', '收藏');
      add(out, own('.note-detail-follow-btn button'), note, 'follow', '关注');
      for (const comment of note.querySelectorAll('.comment-item')) {
        add(out, comment.querySelector('.reply'), comment, 'reply', '回复');
        const reply = out.at(-1);
        if (reply?.kind === 'reply' && reply.subject === sourceSubject(comment)) reply.targetLabel = value(comment.querySelector('.author-wrapper .name, .author .name'));
        add(out, comment.querySelector('.like-wrapper'), comment, 'like', '赞', 'comment');
      }
      for (const more of note.querySelectorAll<HTMLElement>('.show-more, .show-more-reply, .more-reply')) {
        add(out, more, more.closest('.parent-comment') ?? note, 'replies', '展开回复');
      }
    } else if (/^\/user\/profile\//.test(doc.location.pathname)) {
      const profile = doc.querySelector('#userPageContainer,.user-page');
      if (profile) {
        add(out, profile.querySelector('.xhs-user-follow-area button.follow-button, .follow-button'), profile, 'follow', '关注');
        for (const tab of profile.querySelectorAll<HTMLElement>('.xhs-user-page-primary-tabs .reds-tab-item')) add(out, tab, profile, 'tab', value(tab), '作品');
      }
    }
    if (doc.location.pathname === '/search_result') {
      const root = doc.querySelector('.search-layout') ?? doc.querySelector('#app') ?? doc.body;
      const open = [...root.querySelectorAll<HTMLElement>('.filter')].find(n => !n.closest('.ai-chat-filter')) ?? null;
      add(out, open, root as Element, 'filter-open', '筛选');
      for (const group of doc.querySelectorAll('.filter-panel .filters, .filter-container .filters')) {
        for (const tag of group.querySelectorAll<HTMLElement>('.tags')) add(out, tag, group, 'filter', value(tag), value(group.querySelector(':scope > span')) || '筛选');
      }
    }
    if (!noteRoute && /^\/(?:explore|search_result|red_video|user\/profile\/[^/]+)\/?$/.test(doc.location.pathname)) {
      for (const item of doc.querySelectorAll('.note-item')) add(out, item.querySelector('.like-wrapper'), item, 'like', '赞', 'feed');
    }
    return out;
  }
  function activate(control: NativeControl) {
    const binding = bindings.get(control.id);
    if (!binding || binding.key !== doc.location.href || binding.subject !== control.subject || sourceSubject(binding.root) !== control.subject || !binding.node.isConnected || !sourceVisible(binding.node)) return '页面内容已变化，请刷新后再试。';
    if (doc.querySelector('a[href="#reference"][data-reference-path]')) return '静态参考页面不执行操作。';
    if (binding.node.hasAttribute('disabled') || binding.node.getAttribute('aria-disabled') === 'true') return '原站暂未允许此操作。';
    if (binding.kind === 'reply' && [...doc.querySelectorAll<HTMLElement>('.interaction-container .content-input')].some(hasNativeDraft)) return '原站有未发送的评论，请先处理原有草稿。';
    if ((binding.kind === 'tab' || binding.kind === 'filter') && value(binding.node) !== binding.label) return '选项已变化，请刷新后再试。';
    if (binding.kind === 'tab' || binding.kind === 'filter') selection = { id: control.id, binding };
    binding.node.click(); return null;
  }
  function selected(control: NativeControl) {
    const current = selection?.id === control.id ? selection.binding : null;
    // A filter may close its panel after selection. Observe only the exact
    // originally clicked node, without making hidden controls actionable.
    return !!current && current.key === doc.location.href && current.node.isConnected && current.root.contains(current.node)
      && current.subject === control.subject && sourceSubject(current.root) === current.subject
      && value(current.node) === current.label && state(current.node, current.kind) === true;
  }
  return { read, activate, selected, destroy() { bindings.clear(); selection = null; } };
}
