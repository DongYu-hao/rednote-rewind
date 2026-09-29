import { createNativeCapabilities, sourceSubject, sourceVisible, type NativeControl } from './capabilities';
/** Only read content already loaded by the original page. No API or credential access. */
export type Entry = { id: string; title: string; url: string; author: string; authorUrl: string; date: string; subject?: string; kind?: 'note' | 'user' | 'live'; bio?: string; avatar?: Picture | undefined; thumbnail?: Picture | undefined };
export type Channel = { id: string; label: string; active: boolean };
export type Comment = { id: string; author: string; authorUrl: string; date: string; text: string; parentId?: string | undefined; subject?: string };
export type Picture = { src: string; width: number; height: number };
export type Snapshot = {
  kind: 'list' | 'note' | 'profile' | 'messages' | 'live' | 'unsupported';
  key: string; title: string; entries: Entry[]; author: string; authorUrl: string;
  date: string; text: string; images: Picture[]; comments: Comment[];
  unread: number | null; empty: boolean; hasMore: boolean; video: boolean;
  controls?: NativeControl[]; selfUrl?: string; sectionKey?: string; liveMessages?: { author: string; text: string }[];
  channels?: Channel[]; avatar?: Picture | undefined;
};

const text = (node: Element | null) => (node?.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();
const pickText = (root: ParentNode, selector: string) => text(root.querySelector(selector));

export function createAdapter(doc: Document) {
  const win = doc.defaultView;
  const capabilities = createNativeCapabilities(doc);
  let disposed = false;
  let lastNote: { node: Element; routeId: string; signature: string } | null = null;
  const channelActions = new Map<string, HTMLElement>();
  const app = () => doc.querySelector('#app') ?? doc.body;

  function safeUrl(value: string) {
    try {
      const url = new URL(value, doc.location.protocol === 'file:' ? 'https://www.xiaohongshu.com/' : doc.location.href);
      return /^https?:$/.test(url.protocol) && url.hostname === 'www.xiaohongshu.com' && !url.port && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function link(node: Element | null) {
    if (!node) return '';
    const raw = node.getAttribute('href') ?? '';
    // Static references deliberately replace active URLs with this marker.
    // The data attribute is never preferred over a real, live href.
    if (raw === '#reference') return safeUrl(node.getAttribute('data-reference-path') ?? '');
    if (!raw || raw.startsWith('#')) return '';
    return safeUrl(raw);
  }

  function profileLink(node: Element | null) {
    const url = link(node);
    return url && /^\/user\/profile\/[^/]+\/?$/.test(new URL(url).pathname) ? url : '';
  }

  function present(node: Element) {
    // Do not treat the extension's own hiding of #app as missing source data.
    for (let el: Element | null = node; el && el !== app() && el !== doc.body; el = el.parentElement) {
      if (el.hasAttribute('hidden') || (el.getAttribute('aria-hidden') === 'true' && !el.hasAttribute('data-rewind-source'))) return false;
      const style = (el as HTMLElement).style;
      if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    }
    return true;
  }

  function first(root: ParentNode, selector: string) {
    return [...root.querySelectorAll(selector)].find(present) ?? null;
  }

  function unreadCount(): number | null {
    const chat = [...app().querySelectorAll('a[href*="/chat"], a[href*="/message"], a[href="/im"], .message-entry')];
    const roots = chat.length ? chat : app().querySelectorAll('a[href*="/notification"], .notification-container, .notification-entry, [data-unread-count]');
    for (const root of roots) {
      if (!present(root)) continue;
      const explicit = root.getAttribute('data-unread-count');
      if (explicit !== null && /^\d+$/.test(explicit)) return Number(explicit);
      const label = root.getAttribute('aria-label') ?? '';
      const labelled = label.match(/(?:未读|消息|通知)\s*[（(]?\s*(\d+)\s*(?:[)）]|条)/);
      if (labelled) return Number(labelled[1]);
      const plain = text(root).match(/^(?:消息|通知)\s*[（(](\d+)[)）]$/);
      if (plain) return Number(plain[1]);
      const leading = text(root).match(/^(\d+)\s*(?:消息|通知)$/);
      if (leading) return Number(leading[1]);
      const trailing = text(root).match(/^(?:消息|通知)\s*(\d+)$/);
      if (trailing) return Number(trailing[1]);
      for (const badge of root.querySelectorAll('.badge, .badge-container, .count, .unread-count, .reds-badge, .red-count')) {
        const value = text(badge);
        if (present(badge) && /^\d+$/.test(value)) return Number(value);
      }
    }
    return null;
  }

  function ended(root: ParentNode) {
    return [...root.querySelectorAll('.end-container, .no-more, .no-more-text, .feeds-end, .comments-end, .list-end, .tips-el, .end-text')]
      .some(node => present(node) && /^(?:没有更多(?:内容|评论|笔记)?了?|已(?:经)?到底了?|到底了|THE END|The End|没有更多啦)[。.!！\s]*$/.test(text(node)));
  }

  function entries(root: ParentNode): Entry[] {
    const result: Entry[] = [];
    const seen = new Set<string>();
    for (const item of root.querySelectorAll('.note-item, .user-list-item, .live-item')) {
      if (!present(item)) continue;
      const user = item.matches('.user-list-item'), live = item.matches('.live-item');
      const anchor = live ? item.querySelector('a[href]') : user ? item.querySelector('a[href]') : item.querySelector('a.cover[href], a.title[href]') ?? item.querySelector('a[href]');
      const url = link(anchor);
      if (!url) continue;
      const title = pickText(item, user ? '.user-name' : '.title') || (user ? '用户资料' : '未题名笔记');
      const authorNode = item.querySelector('a.author[href*="/user/profile/"], .author-wrapper a[href*="/user/profile/"]')
        ?? item.querySelector('a.author, .author-wrapper a[href]');
      const author = user ? title : pickText(item, '.author .name, .author-wrapper .name') || text(authorNode);
      const pathname = new URL(url).pathname;
      // Sanitized fixtures collapse user IDs; do not collapse distinct sample rows.
      const id = pathname.includes('USER_ID') ? `${pathname}:${result.length}` : pathname;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, title, url, author, subject: sourceSubject(item), authorUrl: user ? profileLink(anchor) : profileLink(authorNode), date: pickText(item, '.time, .date'),
        kind: live ? 'live' : user ? 'user' : 'note', bio: user ? pickText(item, '.user-desc, .user-description, .desc') : '',
        avatar: picture(item.querySelector(user ? '.avatar img, img.avatar, .user-avatar img, img.user-avatar' : '.author img, .author-wrapper img')),
        thumbnail: user ? undefined : picture(item.querySelector('a.cover img, .live-item .cover img')) });
    }
    return result;
  }

  function comments(root: ParentNode): Comment[] {
    const result: Comment[] = [];
    const seen = new Set<string>();
    for (const item of root.querySelectorAll('.comment-item')) {
      if (!present(item)) continue;
      const content = item.querySelector('.comment-inner-container > .right > .content, .content');
      const author = item.querySelector('.comment-inner-container > .right > .author-wrapper a.name, .author a.name, .author-wrapper a.name');
      const body = text(content);
      if (!body) continue;
      const date = pickText(item, '.info > .date, .date');
      const id = item.id || `${link(author)}:${date}:${body}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const parent = item.parentElement?.closest('.comment-item') ?? item.closest('.parent-comment')?.querySelector('.comment-item');
      result.push({ id, author: text(author), authorUrl: profileLink(author), date, text: body, subject: sourceSubject(item), parentId: parent && parent !== item ? parent.id || sourceSubject(parent) : undefined });
    }
    return result;
  }

  function picture(node: Element | null): Picture | undefined {
    if (!node || node.tagName !== 'IMG') return;
    const img = node as HTMLImageElement;
    const raw = img.currentSrc || img.getAttribute('src') || '';
    if (!raw) return;
    try {
      const url = new URL(raw, doc.baseURI);
      if (!['http:', 'https:', 'blob:', 'file:'].includes(url.protocol) || url.username || url.password) return;
      return { src: url.href, width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 };
    } catch { return; }
  }

  function channels(root: ParentNode): Channel[] {
    channelActions.clear();
    const result: Channel[] = [];
    for (const node of root.querySelectorAll<HTMLElement>('.channel-container .channel, .search-layout__top .channel')) {
      const content = node.querySelector('.channel-content') ?? node;
      const label = text(content);
      if (node.closest('.search-layout__top') && !['笔记', '用户'].includes(label)) continue;
      if (!present(node) || node.classList.contains('channel--mobile-only') || !label || label.length > 20 || result.some(item => item.label === label)) continue;
      const id = `channel:${result.length}`;
      channelActions.set(id, node);
      result.push({ id, label, active: content.classList.contains('active') || node.classList.contains('active') || node.getAttribute('aria-selected') === 'true' });
    }
    return result;
  }

  function images(root: ParentNode): Picture[] {
    const result: Picture[] = [];
    const seen = new Set<string>();
    for (const img of root.querySelectorAll<HTMLImageElement>('.media-container .note-slider-img img, .media-container .img-container img, .note-slider-img > img')) {
      const image = picture(img);
      if (!image || seen.has(image.src)) continue;
      seen.add(image.src); result.push(image);
    }
    return result;
  }

  function read(): Snapshot {
    const snapshot: Snapshot = {
      kind: 'unsupported', key: doc.location.href, title: '小红书', entries: [], author: '', authorUrl: '',
      date: '', text: '', images: [], comments: [], unread: unreadCount(), empty: false, hasMore: true, video: false,
    };
    if (disposed) return snapshot;
    snapshot.controls = capabilities.read();
    snapshot.sectionKey = snapshot.controls.filter(c => (c.kind === 'tab' || c.kind === 'filter') && c.active).map(c => `${c.group}:${c.label}`).join('|');
    const selfLinks = [...app().querySelectorAll('nav a[href], [role=navigation] a[href], .side-bar-component.user a[href], a.bottom-channel[href]')]
      .filter(a => sourceVisible(a) && !a.closest('.note-container,#noteContainer,.note-item,.comment-item,.user-page') && /^(我|我的|个人中心|我的主页)$/.test(text(a)))
      .map(profileLink).filter(Boolean);
    const uniqueSelf = [...new Set(selfLinks)];
    snapshot.selfUrl = uniqueSelf.length === 1 ? uniqueSelf[0]! : '';
    const pathname = doc.location.pathname;
    const source = app();
    const routeId = pathname.match(/^\/(?:explore|search_result)\/([^/]+)\/?$/)?.[1]
      ?? pathname.match(/^\/user\/profile\/[^/]+\/([^/]+)\/?$/)?.[1] ?? '';
    const profileRoute = /^\/user\/profile\/[^/]+\/?$/.test(pathname);
    const liveRoute = /^\/livestream\/[^/]+/.test(pathname);
    const mediaList = /^\/(?:livelist|red_video)\/?$/.test(pathname);
    if (liveRoute) {
      snapshot.kind = 'live'; snapshot.author = pickText(source, '.anchor-name');
      snapshot.title = pickText(source, '.live-chat .intro-title') || '直播';
      snapshot.avatar = picture(source.querySelector('.anchor-avatar img, img.anchor-avatar'));
      snapshot.authorUrl = profileLink(source.querySelector('.anchor-info a[href*="/user/profile/"]'));
      snapshot.video = !!source.querySelector('video');
      snapshot.liveMessages = [...source.querySelectorAll('.live-chat .msg-content')].slice(-80).map(n => {
        const copy = n.cloneNode(true) as Element; copy.querySelector('.nickname')?.remove();
        return { author: pickText(n, '.nickname'), text: text(copy) };
      });
      return snapshot;
    }
    const messagesRoute = /^\/(?:notifications?|messages?|chat|im)(?:\/|$)/.test(pathname);
    // Vue teleports note dialogs beside #app, directly under body.
    // A departing dialog can outlive the URL change to a profile or inbox.
    const note = profileRoute || messagesRoute || mediaList ? null : first(doc, '#noteContainer, .note-container');
    if (note) {
      const author = note.querySelector(':scope > .author a.name, :scope > .author .author-wrapper a[href], .author-wrapper a.name');
      const content = note.querySelector('.note-content') ?? note;
      snapshot.kind = 'note';
      snapshot.title = pickText(content, '#detail-title, h1.title') || '未题名笔记';
      snapshot.author = pickText(note, ':scope > .author .username, :scope > .author .name') || text(author);
      snapshot.authorUrl = profileLink(author);
      snapshot.avatar = picture(note.querySelector(':scope > .author img, .author-wrapper img'));
      snapshot.date = pickText(content, '.date');
      snapshot.text = pickText(content, '#detail-desc, .desc');
      snapshot.images = images(note);
      snapshot.comments = comments(note);
      snapshot.hasMore = !ended(note.querySelector('.comments-el') ?? note.querySelector('.note-scroller') ?? note);
      snapshot.video = !!note.querySelector('video, .xgplayer');
      const sourceId = note.getAttribute('data-note-id') ?? note.querySelector('[data-note-id]')?.getAttribute('data-note-id') ?? '';
      const signature = JSON.stringify([snapshot.title, snapshot.text, snapshot.authorUrl, snapshot.images.map(image => image.src)]);
      const stale = routeId && ((sourceId && sourceId !== routeId)
        || (lastNote && lastNote.routeId && lastNote.routeId !== routeId && lastNote.node === note && lastNote.signature === signature));
      if (stale) {
        // Keep the old body out of the new URL while Vue is changing route.
        return { ...snapshot, title: '正在读取笔记', author: '', authorUrl: '', date: '', text: '', images: [], comments: [], hasMore: true, video: false };
      }
      lastNote = { node: note, routeId, signature };
      return snapshot;
    }
    if (routeId) return { ...snapshot, kind: 'note', title: '' };
    if (messagesRoute) {
      snapshot.kind = 'messages';
      snapshot.title = pathname.startsWith('/notification') ? '通知' : '消息';
      // Detailed mailbox content is read by the separate, read-only inbox adapter.
      return snapshot;
    }
    const profile = first(source, '#userPageContainer, .user-page');
    if (profile || profileRoute) {
      snapshot.kind = 'profile';
      if (!profile) { snapshot.title = '作者资料'; return snapshot; }
      const root = profile ?? source;
      snapshot.author = pickText(root, '.user-info .user-name, .user-nickname .user-name, .user-nickname');
      snapshot.authorUrl = safeUrl(doc.location.href);
      snapshot.title = snapshot.author || '作者资料';
      snapshot.text = pickText(root, '.user-info .user-desc');
      snapshot.avatar = picture(root.querySelector('.user-info .avatar img, .user-avatar img, img.user-avatar, img.avatar'));
      snapshot.entries = entries(root);
      snapshot.empty = !snapshot.entries.length && !!first(root, '.empty-text, .empty-container');
      snapshot.hasMore = !snapshot.empty && !ended(root);
      return snapshot;
    }
    // Explicit unsupported routes must not accidentally expose a background feed.
    if (/^\/(?:explore|search_result|livelist|red_video)?\/?$/.test(pathname)) {
      snapshot.kind = 'list';
      snapshot.title = pathname.startsWith('/search_result') || first(source, '.search-layout') ? '检索结果' : '文章目录';
      if (pathname.startsWith('/livelist')) snapshot.title = '直播';
      if (pathname.startsWith('/red_video')) snapshot.title = '视频';
      snapshot.entries = entries(source);
      snapshot.channels = channels(source);
      const channel = snapshot.channels.find(item => item.active);
      if (channel && !pathname.startsWith('/search_result')) snapshot.title = `${channel.label}栏目`;
      snapshot.empty = !snapshot.entries.length && !!first(source, '.search-empty-wrapper, .search-empty-text, .feeds-container .empty-text');
      snapshot.hasMore = !snapshot.empty && !ended(source.querySelector('.feeds-container') ?? source);
    }
    return snapshot;
  }

  function navigate(value: string) {
    if (disposed || !win) return;
    const url = safeUrl(value);
    if (!url) return;
    // Offline captures are intentionally inert, including their reference paths.
    if (app().querySelector('a[href="#reference"][data-reference-path]')) return;
    const anchor = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].find(node => link(node) === url && node.target !== '_blank');
    if (anchor) anchor.click();
    else win.location.assign(url);
  }

  function loadMore(section: 'entries' | 'comments') {
    if (disposed || !win) return;
    const source = app();
    if (source.querySelector('a[href="#reference"][data-reference-path]')) return;
    const target = section === 'comments'
      ? first(doc, '.note-container .note-scroller, #noteContainer .note-scroller')
      : first(source, '.user-page .feeds-container, .search-layout .feeds-container, .feeds-container');
    // Use only the original page's ordinary scrolling path. Whether it can load
    // another batch depends on its own layout, authentication and network state.
    for (let node = target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
      const el = node as HTMLElement;
      if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(win.getComputedStyle(el).overflowY)) {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new win.Event('scroll'));
        return;
      }
    }
    win.scrollTo({ top: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight), behavior: 'instant' });
    win.dispatchEvent(new win.Event('scroll'));
  }

  return { read, navigate, loadMore, activateControl: capabilities.activate, isControlSelected: capabilities.selected, activateChannel(id: string, expectedLabel: string) {
    const node = channelActions.get(id);
    if (disposed || !node?.isConnected || text(node.querySelector('.channel-content') ?? node) !== expectedLabel) return false;
    node.click(); return true;
  }, destroy() { disposed = true; capabilities.destroy(); lastNote = null; channelActions.clear(); } };
}
