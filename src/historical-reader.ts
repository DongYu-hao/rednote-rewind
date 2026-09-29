import type { NativeControl } from './adapters/xiaohongshu/capabilities';
import { createAdapter, type Snapshot, type Entry, type Comment } from './adapters/xiaohongshu';
import { document1995 } from './eras/document-1995';
import { document1985 } from './eras/document-1985';
import { renderBBS1985 } from './renderers/bbs1985';
import { renderWebPage } from './renderers/web-pages';
import { renderSocialPage } from './renderers/social-pages';
import { documentSocial } from './eras/document-social';
import { periodText } from './presentation/period-text';
import { submitNativeComment } from './adapters/xiaohongshu/comment-compose';
import { hasNativeDraft } from './adapters/xiaohongshu/native-draft';
import { mountPeriodVideo } from './media/period-video';
import type { PeriodPageContext } from './renderers/types';
import { document2000 } from './eras/document-2000';
import { mountPeriodImage } from './media/period-images';
import { eras, eraLabels, isSocialEra, isStreamEra, type HistoricalEra } from './eras';
import { documentAction } from './document-action';
import { mountInbox } from './inbox-reader';
import { createSourceIsolation } from './source-isolation';
import { createEraLogo } from './presentation/era-logo';

const PAGE_SIZE = 10;
type View = { data: Snapshot; page: number; commentPage: number; scroll: number; discussion: boolean; picturesOpen: boolean; pages: number[]; commentPages: number[]; positions: Map<string, number> };
type Pending = { kind: 'route' | 'entries' | 'comments'; start: number; previousKey: string; count: number; previousEntries?: string; channel?: string; selection?: NativeControl };

/** Keeps source data in memory and gives it a separate, explicit document navigation. */
export function createHistoricalReader(doc: Document, resolveAssetURL?: (path: string) => string) {
  const win = doc.defaultView!;
  const adapter = createAdapter(doc);
  let era: HistoricalEra = '1995';
  const host = doc.createElement('rednote-rewind-document');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483645!important;visibility:visible!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style'); style.textContent = document1995;
  const reader = doc.createElement('main'); reader.dataset.reader = ''; reader.tabIndex = -1;
  reader.setAttribute('aria-label', '小红书一九九五年阅读界面');
  shadow.append(style, reader);
  // Historical controls must not trigger the hidden application's shortcuts.
  shadow.addEventListener('keydown', event => event.stopPropagation());
  shadow.addEventListener('click', event => event.stopPropagation());
  // Preserve the application's geometry for its normal loading mechanism, but keep
  // all original surfaces (including portals added later) outside the reading UI.
  const isolation = doc.createElement('style');
  isolation.dataset.rednoteRewind = 'document';
  const historicalSelector = `html:is(${eras.filter(value => value !== 'now').map(value => `[data-rednote-rewind-era="${value}"]`).join(',')})`;
  isolation.textContent = `${historicalSelector} body > :not(rednote-rewind-document):not(rednote-rewind-control),${historicalSelector} body > :not(rednote-rewind-document):not(rednote-rewind-control) *{visibility:hidden!important;pointer-events:none!important}${historicalSelector}{overflow:hidden!important}`;
  const cache = new Map<string, View>();
  let active = false;
  let view: View | null = null;
  let pending: Pending | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let sourceScroll = { x: 0, y: 0 };
  let sourceFocus: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let navigationKey = '';
  let lastFingerprint = '';
  let stableSince = 0;
  let unreadCheckedAt = 0;
  let commentsCheckedAt = 0;
  let mailbox: ReturnType<typeof mountInbox> | null = null;
  let slowImages = false;
  let streamView: ReturnType<typeof renderSocialPage> | null = null;
  let lastReaderScroll = 0;
  let autoLoadBlocked = false;
  let nativeCheckedAt = 0;
  let controlRequest: { control: NativeControl; start: number } | null = null;
  let replyTo: NativeControl | null = null;
  const actionWidgets: { parent: HTMLElement; kinds: NativeControl['kind'][]; subject?: string }[] = [];
  let composeRefresh: (() => void) | null = null;
  const periodImages: ReturnType<typeof mountPeriodImage>[] = [];
  let allowedVideo: HTMLMediaElement | null = null;
  let player: ReturnType<typeof mountPeriodVideo> | null = null;
  const drafts = new Map<string, { text: string; forwarded: boolean; before?: Set<string>; submittedText?: string; selfUrl?: string; confirmed?: boolean }>();
  function clearImages() { periodImages.splice(0).forEach(image => image.destroy()); player?.destroy(); player = null; }
  function periodImage(parent: HTMLElement, picture: Snapshot['images'][number], label: string, maxWidth: number, index = 0) {
    const quality = era === '1995' ? .25 : era === '2005' ? .62 : era === '2010' ? .76 : era === '2015' ? .9 : .45;
    const delay = era === '2005' ? 220 : era === '2010' ? 90 : era === '2015' ? 30 : 600;
    periodImages.push(mountPeriodImage(doc, parent, picture, { label, maxWidth, maxHeight: maxWidth === 120 ? 80 : maxWidth, quality, slow: slowImages, delay: delay + index * delay }));
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
    const node = doc.createElement(tag); node.textContent = periodText(text, era); return node;
  }
  function action(text: string, name: string, run: () => void) {
    const control = documentAction(doc, era, periodText(text, era), run); control.dataset.action = name;
    return control;
  }
  function link(text: string, url: string) {
    const anchor = el('a', text); anchor.href = url;
    anchor.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); navigate(url);
    });
    return anchor;
  }
  function remember() {
    if (!view) return;
    if (pending?.previousEntries !== undefined) return;
    view.scroll = reader.scrollTop; cache.set(cacheKey(view.data), view);
    // Do not retain an entire browsing session of account content indefinitely.
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  function cacheKey(data: Snapshot) {
    // Native feed channels share /explore. Their reading positions belong to
    // separate directories even when the address bar does not change.
    const channel = data.kind === 'list' ? data.channels?.find(item => item.active)?.label ?? '' : '';
    return `${era}|${data.key}|${channel}|${data.sectionKey || ''}`;
  }
  function cachedView(data: Snapshot) {
    const saved = cache.get(cacheKey(data));
    if (!saved || saved.data.kind !== data.kind) return undefined;
    if ((data.kind === 'list' || data.kind === 'profile') && !saved.data.entries.length && data.entries.length) return undefined;
    if (data.kind === 'note' && !saved.data.text && !saved.data.images.length && (data.text || data.images.length)) return undefined;
    return saved;
  }
  function freeze(data: Snapshot): View {
    return { data, page: 0, commentPage: 0, scroll: 0, discussion: isSocialEra(era), picturesOpen: false, pages: [0], commentPages: [0], positions: new Map() };
  }
  const sourceIsolation = createSourceIsolation(doc, () => allowedVideo);
  const pauseSource = (event: Event) => {
    if (active && event.target instanceof win.HTMLMediaElement && event.target !== allowedVideo) event.target.pause();
  };

  function setStatus(text: string) { if (status) status.textContent = text; }
  function navigate(url: string) {
    if (!active || pending) return;
    let destination: URL;
    try { destination = new URL(url, win.location.href); } catch { return; }
    if (destination.href === win.location.href) return;
    remember(); pending = { kind: 'route', start: Date.now(), previousKey: navigationKey, count: 0 };
    setStatus('正在读取文档，请稍候。');
    lastFingerprint = ''; stableSince = Date.now();
    try { adapter.navigate(url); } catch { pending = null; setStatus('未能打开文档。请重试，或切换至 now 查看。'); }
  }
  function merge<T extends { id: string }>(previous: T[], incoming: T[]) {
    const ids = new Set(previous.map(item => item.id));
    return [...previous, ...incoming.filter(item => { if (ids.has(item.id)) return false; ids.add(item.id); return true; })];
  }
  function pageNext(kind: 'entries' | 'comments') {
    if (!view || pending) return;
    const comments = kind === 'comments';
    const index = comments ? view.commentPage : view.page;
    const offsets = comments ? view.commentPages : view.pages;
    const originalCount = comments ? view.data.comments.length : view.data.entries.length;
    const boundary = offsets[index + 1] ?? Math.min((offsets[index] ?? 0) + PAGE_SIZE, originalCount);
    view.positions.set(`${kind}:${index}`, reader.scrollTop);
    const fresh = adapter.read();
    if (fresh.key !== view.data.key) return;
    view.data.hasMore = fresh.hasMore;
    const field = kind === 'entries' ? 'entries' : 'comments';
    if (field === 'entries') view.data.entries = merge<Entry>(view.data.entries, fresh.entries);
    else view.data.comments = merge<Comment>(view.data.comments, fresh.comments);
    if (view.data[field].length > boundary) {
      offsets[index + 1] = boundary;
      if (kind === 'entries') view.page++; else view.commentPage++;
      view.scroll = view.positions.get(`${kind}:${index + 1}`) ?? 0;
      if (comments && isSocialEra(era)) refreshDiscussion();
      else if (!comments && isStreamEra(era)) appendStream(); else render(true); return;
    }
    if (!fresh.hasMore) { if (comments && isSocialEra(era)) refreshDiscussion(); if (!comments && isStreamEra(era)) appendStream(); setStatus('已到当前目录末页。'); return; }
    pending = { kind, start: Date.now(), previousKey: fresh.key, count: boundary };
    setStatus('正在读取下一页，请稍候。');
    adapter.loadMore(kind);
  }
  function pagination(parent: HTMLElement, comments = false) {
    if (!view) return;
    const paging = el('div'); paging.className = 'paging';
    if (isStreamEra(era)) {
      const more = action(comments ? '读取更多评论' : '加载更多', comments ? 'comments-next' : 'next', () => { autoLoadBlocked = false; pageNext(comments ? 'comments' : 'entries'); });
      const items = comments ? view.data.comments : view.data.entries;
      const offsets = comments ? view.commentPages : view.pages;
      const index = comments ? view.commentPage : view.page;
      more.disabled = !view.data.hasMore && items.length <= (offsets[index] ?? 0) + PAGE_SIZE;
      if (more.disabled) more.textContent = '已显示全部内容';
      paging.append(more); parent.append(paging); return;
    }
    const index = comments ? view.commentPage : view.page;
    const previous = action('上一页', comments ? 'comments-previous' : 'previous', () => {
      if (!view || pending) return;
      const kind = comments ? 'comments' : 'entries';
      view.positions.set(`${kind}:${index}`, reader.scrollTop);
      if (comments) view.commentPage = Math.max(0, view.commentPage - 1); else view.page = Math.max(0, view.page - 1);
      view.scroll = view.positions.get(`${kind}:${Math.max(0, index - 1)}`) ?? 0;
      if (comments && isSocialEra(era)) refreshDiscussion(); else render(true);
    }); previous.disabled = index === 0;
    const next = action('下一页', comments ? 'comments-next' : 'next', () => pageNext(comments ? 'comments' : 'entries'));
    const count = comments ? view.data.comments.length : view.data.entries.length;
    const start = (comments ? view.commentPages : view.pages)[index] ?? 0;
    next.disabled = !view.data.hasMore && count <= start + PAGE_SIZE;
    paging.append(previous, next, el('span', `第 ${index + 1} 页`)); parent.append(paging);
  }
  function refreshDiscussion() {
    if (!view || !streamView) return;
    const start = view.commentPages[view.commentPage] ?? 0;
    const end = view.commentPages[view.commentPage + 1] ?? start + PAGE_SIZE;
    streamView.updateDiscussion(view.data.comments.slice(isStreamEra(era) ? 0 : start, end)); updateActions();
    setStatus('');
  }
  function appendStream() {
    if (!view || !streamView) return;
    const end = view.pages[view.page + 1] ?? (view.pages[view.page] ?? 0) + PAGE_SIZE;
    const shown = reader.querySelectorAll('[data-social-entry]').length;
    streamView.appendEntries(view.data.entries.slice(shown, end)); updateActions();
    const more = reader.querySelector<HTMLButtonElement>('[data-action="next"]');
    if (more) {
      more.disabled = !view.data.hasMore && view.data.entries.length <= end;
      more.textContent = more.disabled ? '已显示全部内容' : '加载更多';
    }
    setStatus('');
  }
  reader.addEventListener('scroll', () => {
    const down = reader.scrollTop > lastReaderScroll; lastReaderScroll = reader.scrollTop;
    if (!down || !active || !isStreamEra(era) || autoLoadBlocked || pending || !view || !['list', 'profile'].includes(view.data.kind)) return;
    const more = reader.querySelector<HTMLButtonElement>('[data-action="next"]');
    if (more && !more.disabled && reader.scrollHeight - reader.scrollTop - reader.clientHeight < 380) pageNext('entries');
  }, { passive: true });
  function selectChannel(id: string, label: string) {
    if (pending || !view) return;
    remember();
    const previousEntries = JSON.stringify(view.data.entries.map(item => item.id));
    if (!adapter.activateChannel(id, label)) { setStatus('栏目已经变化，请重新读取。'); return; }
    pending = { kind: 'route', start: Date.now(), previousKey: '', count: 0, previousEntries, channel: label };
    view = freeze({ ...view.data, entries: [], title: `${label}栏目`, empty: false,
      channels: (view.data.channels ?? []).map(item => ({ ...item, active: item.id === id })) });
    lastFingerprint = ''; stableSince = Date.now(); render(); setStatus('正在读取栏目，请稍候。');
  }
  function closeDiscussion() {
    if (!view) return;
    view.discussion = false; view.scroll = view.positions.get('article') ?? 0; render(true);
  }
  function showDiscussion() {
    if (!view) return;
    view.positions.set('article', reader.scrollTop); view.discussion = true;
    const fresh = adapter.read();
    if (fresh.key === view.data.key) view.data.comments = merge(view.data.comments, fresh.comments);
    const previous = reader.scrollTop; render();
    if (era !== '1985') {
      reader.scrollTop = previous; reader.querySelector<HTMLElement>('[data-discussion]')?.scrollIntoView({ block: 'start' });
    }
  }
  function labelControl(control: NativeControl) {
    const label = control.kind === 'like' ? (control.active ? '取消赞' : '赞')
      : control.kind === 'collect' ? (control.active ? '取消收藏' : '收藏')
      : control.kind === 'follow' ? (control.active ? '取消关注' : '关注') : control.label;
    return label + (control.count ? ` ${control.count}` : '');
  }
  function updateActions() {
    if (!view) return;
    for (let i = actionWidgets.length - 1; i >= 0; i--) {
      const widget = actionWidgets[i]!;
      if (!widget.parent.isConnected) { actionWidgets.splice(i, 1); continue; }
      const controls = (view.data.controls || []).filter(c => widget.kinds.includes(c.kind) && (widget.subject ? c.subject === widget.subject : c.group !== 'comment' && c.kind !== 'reply'));
      const keys = controls.map(c => c.id).join('|');
      if (widget.parent.dataset.controls !== keys) {
        widget.parent.replaceChildren(); widget.parent.dataset.controls = keys;
        const groups = new Map<string, HTMLElement>();
        for (const control of controls) {
          const button = action(labelControl(control), 'native', () => { const current = view?.data.controls?.find(c => c.id === control.id); activateNative({ ...control, active: current?.active ?? control.active, count: current?.count ?? control.count }); });
          button.dataset.nativeId = control.id;
          if (control.group && control.kind === 'filter') button.title = control.group;
          if (control.kind === 'filter') {
            let group = groups.get(control.group);
            if (!group) { group = el('fieldset'); group.append(el('legend', control.group)); groups.set(control.group, group); widget.parent.append(group); }
            group.append(button);
          } else widget.parent.append(button);
        }
      }
      for (const control of controls) {
        const button = widget.parent.querySelector<HTMLButtonElement>(`[data-native-id="${control.id}"]`);
        if (!button) continue;
        button.textContent = labelControl(control);
        button.disabled = control.disabled || ((control.kind === 'tab' || control.kind === 'filter') && control.active === true) || controlRequest?.control.id === control.id;
        if (control.active !== null) button.setAttribute('aria-pressed', String(control.active));
        else button.removeAttribute('aria-pressed');
      }
    }
  }
  function mountActions(parent: HTMLElement, kinds: NativeControl['kind'][], subject?: string) {
    const bar = el('nav'); bar.className = 'native-actions';
    bar.setAttribute('aria-label', kinds.includes('tab') ? '作品分类' : kinds.includes('filter') ? '搜索筛选' : '互动操作');
    parent.append(bar); actionWidgets.push({ parent: bar, kinds, ...(subject ? { subject } : {}) });
  }
  function activateNative(control: NativeControl) {
    if (!view || pending || controlRequest || win.location.href !== view.data.key) return;
    adapter.read();
    const failure = adapter.activateControl(control);
    if (failure) { setStatus(failure); return; }
    if (control.kind === 'reply') {
      replyTo = control;
      const form = reader.querySelector<HTMLElement>('[data-compose]');
      const reply = form?.querySelector<HTMLElement>('[data-reply-status]');
      if (reply) { reply.hidden = false; reply.textContent = control.targetLabel ? `回复 ${control.targetLabel}` : '正在回复所选评论。'; }
      form?.scrollIntoView({ block: 'nearest' }); form?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); return;
    }
    if (control.kind === 'tab' || control.kind === 'filter') {
      remember();
      const previousEntries = JSON.stringify(view.data.entries.map(item => item.id));
      pending = { kind: 'route', start: Date.now(), previousKey: '', count: 0, previousEntries, selection: control };
      lastFingerprint = ''; stableSince = Date.now(); setStatus('正在读取所选内容。'); return;
    }
    controlRequest = { control, start: Date.now() }; updateActions(); setStatus('正在等候原站更新。');
  }
  async function copyLink() {
    if (!view) return;
    const key = view.data.key;
    const url = new URL(key);
    try {
      await win.navigator.clipboard.writeText(`${url.origin}${url.pathname}`);
      if (view?.data.key === key) setStatus('已复制页面链接。');
    } catch { if (view?.data.key === key) setStatus('未能复制，请从浏览器地址栏复制链接。'); }
  }
  function mountCompose(parent: HTMLElement) {
    if (!view) return;
    const key = view.data.key;
    if (!drafts.has(key)) drafts.set(key, { text: '', forwarded: false });
    if (drafts.size > 10) { const old = drafts.keys().next().value; if (old && old !== key) drafts.delete(old); }
    const draft = drafts.get(key)!;
    const mountedEra = era;
    const form = el('form'); form.className = 'period-compose'; form.dataset.compose = '';
    const label = el('label', isSocialEra(era) ? '发表评论' : era === '2000' ? '发表意见' : '写留言');
    const input = el('textarea'); input.rows = isSocialEra(era) ? 3 : 5; input.setAttribute('aria-label', label.textContent!); input.value = draft.text;
    input.disabled = draft.forwarded; label.append(input);
    const submit = el('button', '发送'); submit.type = 'submit'; submit.disabled = draft.forwarded;
    const replyStatus = el('p', replyTo ? '正在回复所选评论。' : ''); replyStatus.dataset.replyStatus = ''; replyStatus.hidden = !replyTo;
    const again = el('button', draft.confirmed ? '写下一条' : '确认结果后继续'); again.type = 'button'; again.hidden = !draft.forwarded;
    const report = el('p', draft.forwarded ? (draft.confirmed ? '页面已显示来自你的这条评论。' : '已交给原站处理，尚未确认发布。请在原站确认结果后继续。') : '填写后按发送键。'); report.setAttribute('role', 'status');
    input.addEventListener('input', () => { draft.text = input.value; });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (draft.forwarded || submit.disabled || !active || !form.isConnected || era !== mountedEra || win.location.href !== key) return;
      const fresh = adapter.read();
      if (pending || fresh.kind !== 'note' || fresh.key !== key || fresh.title !== view?.data.title || fresh.authorUrl !== view?.data.authorUrl) {
        report.textContent = '正在等候当前文章。请稍候重新读取。'; return;
      }
      submit.disabled = true;
      const before = new Set(fresh.comments.map(c => c.id));
      const submittedText = input.value;
      const editor = doc.querySelector('.interaction-container .content-input');
      const placeholder = editor?.getAttribute('data-placeholder') || editor?.getAttribute('placeholder') || '';
      if (replyTo && (!replyTo.targetLabel || !placeholder.includes('回复') || !placeholder.includes(replyTo.targetLabel))) {
        report.textContent = '原站尚未选定回复对象，请重新选择回复。'; submit.disabled = false; return;
      }
      const target = replyTo;
      const isCurrent = () => {
        const current = adapter.read();
        return active && !pending && form.isConnected && era === mountedEra && current.kind === 'note' && current.key === key && current.title === fresh.title && current.authorUrl === fresh.authorUrl && current.text === fresh.text
          && (!target || !!current.controls?.some(c => c.id === target.id && c.subject === target.subject));
      };
      const failure = await submitNativeComment(doc, key, submittedText, target ? placeholder : '', isCurrent);
      if (!form.isConnected || era !== mountedEra || !active) return;
      if (failure) { report.textContent = failure; submit.disabled = false; }
      else {
        draft.forwarded = true; draft.before = before; draft.submittedText = submittedText; draft.selfUrl = fresh.selfUrl || ''; draft.confirmed = false;
        input.disabled = true; again.hidden = false; again.textContent = '确认结果后继续';
        report.textContent = '已交给原站处理，尚未确认发布。请在原站确认结果后继续。';
      }
    });
    again.addEventListener('click', () => {
      if (!active || !form.isConnected || era !== mountedEra || win.location.href !== key || !draft.forwarded) return;
      const editors = [...doc.querySelectorAll<HTMLElement>('#noteContainer .interaction-container .content-input[contenteditable="true"], .note-container .interaction-container .content-input[contenteditable="true"]')];
      const nativeEditor = editors[0];
      if (editors.length !== 1 || !nativeEditor?.isConnected) { report.textContent = '尚未取得当前文章的原站留言框，请重新读取。'; return; }
      if (hasNativeDraft(nativeEditor)) { report.textContent = '原站仍保留上一条内容，请先确认发送结果。'; return; }
      draft.forwarded = false; draft.text = ''; delete draft.before; delete draft.submittedText; delete draft.selfUrl; draft.confirmed = false;
      input.value = ''; input.disabled = false; submit.disabled = false; again.hidden = true;
      const placeholder = doc.querySelector('.interaction-container .content-input')?.getAttribute('data-placeholder') || '';
      if (!placeholder.includes('回复')) { replyTo = null; replyStatus.hidden = true; }
      report.textContent = '可以填写下一条评论。'; input.focus();
    });
    composeRefresh = () => {
      if (!draft.forwarded || !draft.before || !draft.submittedText || !draft.selfUrl || draft.confirmed || !form.isConnected || view?.data.key !== key) return;
      const own = (url: string) => {
        try { const a = new URL(url), b = new URL(draft.selfUrl!); return a.origin === b.origin && a.pathname === b.pathname; }
        catch { return false; }
      };
      const confirmed = view.data.comments.some(c => !draft.before!.has(c.id) && c.text.trim() === draft.submittedText!.trim() && own(c.authorUrl));
      if (confirmed) { draft.confirmed = true; again.textContent = '写下一条'; report.textContent = '页面已显示来自你的这条评论。可以继续写下一条。'; }
    };
    form.append(replyStatus, label, submit, again, report); parent.append(form);
  }
  function render(restore = false, preserveMailbox = false) {
    if (!view) return;
    const position = restore ? view.scroll : 0;
    const retainedMailbox = preserveMailbox && view.data.kind === 'messages' ? mailbox : null;
    clearImages(); actionWidgets.length = 0; composeRefresh = null; controlRequest = null; replyTo = null;
    if (!retainedMailbox) { mailbox?.destroy(); mailbox = null; }
    if (era !== '1985') {
      shadow.append(reader); shadow.querySelector('[data-crt-scene]')?.remove();
    }
    reader.replaceChildren();
    streamView = null;
    const page = el('div'); page.className = 'document'; reader.append(page);
    const nav = el('nav'); nav.setAttribute('aria-label', '网站目录');
    nav.append(link('首页', '/explore'));
    if (isSocialEra(era)) {
      nav.append(link('视频', '/red_video'));
      if (isStreamEra(era)) nav.append(link('直播', '/livelist'));
      if (view.data.selfUrl) nav.append(link('我的主页', view.data.selfUrl));
    }
    const message = link(view.data.unread === null || view.data.unread === 0 ? '消息' : `消息 (${view.data.unread})`, '/chat');
    message.dataset.nav = 'messages'; nav.append(message, link('通知', '/notification'));
    if (!isSocialEra(era) || view.data.kind !== 'list') nav.append(action(isSocialEra(era) ? '返回' : '返回前页', 'back', () => {
      if (era === '1985' && view?.discussion) { closeDiscussion(); return; }
      remember(); win.history.back();
    }));
    const search = (keyword: string) => { if (keyword.trim()) navigate(`/search_result?keyword=${encodeURIComponent(keyword.trim())}&source=web_explore_feed`); };
    const form = el('form'); form.setAttribute('role', 'search');
    const label = el('label', isSocialEra(era) ? '搜索：' : '检索：'); const input = el('input'); input.type = 'search'; input.name = 'keyword'; input.setAttribute('aria-label', '检索词');
    input.value = new URL(view.data.key).searchParams.get('keyword') ?? '';
    label.append(input); const submit = el('button', isSocialEra(era) ? '搜索' : '检索'); submit.type = 'submit'; form.append(label, submit);
    form.addEventListener('submit', event => { event.preventDefault(); search(input.value); });
    status = el('p'); status.className = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const foot = el('nav'); foot.className = 'document-footer';
    foot.append(action(isSocialEra(era) ? '刷新' : '重新读取', 'refresh', () => { pending = null; view = freeze(adapter.read()); navigationKey = view.data.key; render(); }));
    const data = view.data;
    const start = view.pages[view.page] ?? 0, end = view.pages[view.page + 1] ?? start + PAGE_SIZE;
    const commentStart = view.commentPages[view.commentPage] ?? 0, commentEnd = view.commentPages[view.commentPage + 1] ?? commentStart + PAGE_SIZE;
    const context: PeriodPageContext = {
      createLogo: () => createEraLogo(doc, era, 'page', resolveAssetURL),
      doc, era, data, entries: data.entries.slice(isStreamEra(era) ? 0 : start, end), comments: data.comments.slice(isStreamEra(era) ? 0 : commentStart, commentEnd),
      discussionOpen: view.discussion, picturesOpen: view.picturesOpen,
      navigation: nav, searchForm: form, status, footer: foot, link, action, search, selectChannel, pagination, showDiscussion, closeDiscussion,
      showPictures() { if (view) { remember(); view.picturesOpen = true; render(true); } },
      mountImage: periodImage,
      mountInbox(parent) {
        if (retainedMailbox) { mailbox = retainedMailbox; parent.append(mailbox.element); mailbox.setEra(era); }
        else mailbox = mountInbox(doc, parent, era, navigate);
      },
      mountCompose, mountActions, copyLink,
      mountVideo(parent) { player = mountPeriodVideo(doc, parent, source => { allowedVideo = source; }, era); },
      text: value => periodText(value, era),
    };
    if (era === '1985') renderBBS1985(page, context);
    else if (isSocialEra(era)) streamView = renderSocialPage(page, context);
    else renderWebPage(page, context);
    updateActions(); reader.scrollTop = position; lastReaderScroll = position; autoLoadBlocked = false;
  }

  function tick() {
    if (!active) return;
    const key = win.location.href;
    const chatRoute = (url: string) => /^\/(?:chat|messages?|im)(?:\/|$)/.test(new URL(url).pathname);
    if (key !== navigationKey && view?.data.kind === 'messages' && chatRoute(key) && chatRoute(navigationKey)) {
      // The mailbox owns the selected conversation and its pending identity
      // checks. Native /chat/:id changes must not destroy that state.
      navigationKey = key; view.data.key = key;
      if (pending?.kind === 'route') { pending = null; setStatus(''); }
    }
    if (key !== navigationKey && pending?.kind !== 'route') {
      remember(); pending = { kind: 'route', start: Date.now(), previousKey: navigationKey, count: 0 };
      lastFingerprint = ''; stableSince = Date.now();
    }
    if (!pending) {
      if (view && isSocialEra(era) && Date.now() - nativeCheckedAt > 700) {
        nativeCheckedAt = Date.now(); const fresh = adapter.read();
        if (fresh.key === view.data.key && fresh.kind === view.data.kind) {
          view.data.controls = fresh.controls || [];
          if (view.data.kind === 'live') streamView?.updateLive(fresh.liveMessages || []);
          if (controlRequest) {
            const initial = controlRequest.control, current = fresh.controls?.find(c => c.id === initial.id);
            const changed = current && (current.active !== initial.active || current.count !== initial.count);
            if (changed || initial.kind === 'filter-open' || initial.kind === 'replies') { controlRequest = null; setStatus(''); }
            else if (Date.now() - controlRequest.start > 5000) { controlRequest = null; setStatus('原站尚未确认结果，可能需要登录或确认。请检查原站后再试。'); }
          }
          updateActions(); composeRefresh?.();
        }
      }
      // Comments often arrive after the article. Refresh only this section;
      // decoding pictures, the playing video and the compose draft stay intact.
      if (view?.data.kind === 'note' && isSocialEra(era) && Date.now() - commentsCheckedAt > 1200) {
        commentsCheckedAt = Date.now();
        const fresh = adapter.read();
        if (fresh.key === view.data.key && fresh.kind === 'note' && fresh.title === view.data.title && fresh.authorUrl === view.data.authorUrl) {
          const merged = merge(view.data.comments, fresh.comments);
          if (merged.length !== view.data.comments.length || fresh.hasMore !== view.data.hasMore) {
            view.data.comments = merged; view.data.hasMore = fresh.hasMore; refreshDiscussion(); composeRefresh?.();
          }
        }
      }
      // Header counts may arrive after the initial feed. Updating one text node
      // must never rebuild or reorder the document the user is reading.
      if (view && Date.now() - unreadCheckedAt > 2000) {
        unreadCheckedAt = Date.now();
        const unread = adapter.read().unread;
        view.data.unread = unread;
        const nav = reader.querySelector('[data-nav="messages"]');
        if (nav) { const label = nav.getAttribute('data-terminal-label') || '消息'; nav.textContent = unread ? `${label} (${unread})` : label; }
      }
      return;
    }
    const incoming = adapter.read();
    if (pending.kind === 'route') {
      // Route changes can arrive before Vue replaces the previous document. Wait
      // for a short stable snapshot instead of exposing intermediate source UI.
      const fingerprint = `${incoming.key}|${incoming.sectionKey}|${incoming.kind}|${incoming.title}|${incoming.text.slice(0, 80)}|${incoming.entries.map(item => item.id).join(',')}|${incoming.comments.length}`;
      if (fingerprint !== lastFingerprint) { lastFingerprint = fingerprint; stableSince = Date.now(); }
      const populated = incoming.kind === 'note' ? !!incoming.text || !!incoming.images.length || (incoming.video && !!incoming.author) : incoming.kind === 'list' || incoming.kind === 'profile' ? !!incoming.entries.length || incoming.empty : true;
      const channelChanged = pending.previousEntries === undefined || channelChangedSnapshot(incoming, pending.previousEntries, pending.channel, pending.selection);
      if ((incoming.key !== pending.previousKey || !view) && populated && channelChanged && Date.now() - stableSince >= 350) {
        view = pending.previousEntries !== undefined ? freeze(incoming) : cachedView(incoming) || freeze(incoming); navigationKey = incoming.key; pending = null; render(true); return;
      }
    } else if (view && incoming.key === view.data.key) {
      const comments = pending.kind === 'comments';
      if (comments) view.data.comments = merge(view.data.comments, incoming.comments);
      else view.data.entries = merge(view.data.entries, incoming.entries);
      const items = comments ? view.data.comments : view.data.entries;
      if (items.length > pending.count) {
        const offsets = comments ? view.commentPages : view.pages;
        offsets[(comments ? view.commentPage : view.page) + 1] = pending.count;
        if (comments) view.commentPage++; else view.page++;
        view.data.hasMore = incoming.hasMore; pending = null;
        if (comments && isSocialEra(era)) refreshDiscussion();
        else if (!comments && isStreamEra(era)) appendStream(); else render(); return;
      }
      if (comments && isSocialEra(era) && !incoming.hasMore) {
        view.data.hasMore = false; pending = null; refreshDiscussion(); return;
      }
      if (!comments && isStreamEra(era) && !incoming.hasMore) {
        view.data.hasMore = false; pending = null; appendStream(); return;
      }
    }
    if (pending && Date.now() - pending.start > 10000) {
      navigationKey = key;
      // A failed route must not leave the previous note masquerading as the new one.
      if (pending.kind === 'route') {
        view = freeze(pending.previousEntries !== undefined && !channelChangedSnapshot(incoming, pending.previousEntries, pending.channel, pending.selection)
          ? { ...incoming, entries: [], empty: false } : incoming);
        render();
      }
      pending = null; autoLoadBlocked = true; setStatus('未能取得新的内容。请重新读取；若需登录或验证，可切换至 now。');
    }
  }

  function channelChangedSnapshot(data: Snapshot, previous: string, channel?: string, selection?: NativeControl) {
    if (channel && data.channels?.find(item => item.active)?.label !== channel) return false;
    if (selection && !adapter.isControlSelected(selection) && !data.controls?.some(item => item.kind === selection.kind && item.group === selection.group && item.label === selection.label && item.active)) return false;
    if (data.empty) return true;
    const before: string[] = JSON.parse(previous);
    // A reordered result is new content too. A previous feed merely appending
    // another batch remains unconfirmed, even if the new option is highlighted.
    return data.entries.length > 0 && (!before.length || before.some((id, index) => data.entries[index]?.id !== id));
  }

  const pageShow = (event: PageTransitionEvent) => {
    if (!active || !event.persisted) return;
    // A native full-page navigation may put this document in the back/forward
    // cache. Its old pending timer must not turn a successful return into an error.
    pending = null; navigationKey = win.location.href;
    view = cachedView(adapter.read()) || view;
    if (view) render(true);
  };

  return {
    setPanelOpen(open: boolean) { reader.dataset.panelOpen = String(open); },
    setSlowImages(slow: boolean) { slowImages = slow; },
    focusCommand() { shadow.querySelector<HTMLInputElement>('.terminal-command input')?.focus({ preventScroll: true }); },
    enable(next: HistoricalEra = '1995') {
      if (active && era === next) return;
      if (active) {
        remember();
        // A pending directory page belongs to the old era's view offsets.
        // Keep route requests, but let the reader request pagination again.
        if (pending?.kind !== 'route') pending = null;
      }
      era = next; style.textContent = isSocialEra(era) ? documentSocial(era) : era === '1985' ? document1985 : era === '2000' ? document2000 : document1995;
      reader.setAttribute('aria-label', `小红书${eraLabels[era]}阅读界面`);
      if (active) {
        // Keep source isolation and the mailbox identity fence throughout a
        // historical-era switch. Do not pass through disable()/now.
        const previous = view;
        if (previous) view = previous.data.kind === 'messages' ? previous : cachedView(previous.data) ?? {
          ...freeze({ ...previous.data, entries: [...previous.data.entries], comments: [...previous.data.comments] }),
          page: previous.page, pages: [...previous.pages], scroll: previous.scroll,
        };
        render(true, true);
        if (pending) setStatus('正在读取文档，请稍候。');
        return;
      }
      active = true; sourceScroll = { x: win.scrollX, y: win.scrollY };
      sourceFocus = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;
      doc.head.append(isolation); doc.body.append(host); sourceIsolation.enable();
      doc.addEventListener('play', pauseSource, true);
      win.addEventListener('pagehide', remember); win.addEventListener('pageshow', pageShow);
      const data = adapter.read();
      const sourceChangedDirectory = view?.data.kind === 'list' && data.kind === 'list'
        && view.data.key === data.key && cacheKey(view.data) !== cacheKey(data);
      view = sourceChangedDirectory ? freeze(data) : cachedView(data) || freeze(data);
      navigationKey = data.key; render(true);
      const waiting = data.kind === 'list' || data.kind === 'profile'
        ? !data.entries.length && !data.empty
        : data.kind === 'note' && !data.text && !data.images.length && !data.video;
      if (waiting) {
        pending = { kind: 'route', start: Date.now(), previousKey: '', count: 0 };
      }
      timer = setInterval(tick, 200);
    },
    disable() {
      if (!active) return;
      remember(); active = false; pending = null; clearInterval(timer); sourceIsolation.disable();
      mailbox?.destroy(); mailbox = null; clearImages();
      doc.removeEventListener('play', pauseSource, true);
      win.removeEventListener('pagehide', remember); win.removeEventListener('pageshow', pageShow);
      isolation.remove(); host.remove();
      win.scrollTo(sourceScroll.x, sourceScroll.y);
      if (sourceFocus?.isConnected) sourceFocus.focus({ preventScroll: true });
    },
    destroy() { this.disable(); adapter.destroy(); cache.clear(); drafts.clear(); },
  };
}
