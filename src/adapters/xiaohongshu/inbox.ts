/** Reading stays in this tab's memory. Editors, credentials and send controls are never read. */
export type MailItem = {
  id: string; author: string; date: string; text: string; url: string;
  action: string; unread: number | null; outgoing: boolean;
};
export type MailTab = { id: string; label: string; active: boolean };
export type Inbox = {
  kind: 'messages' | 'notifications'; ready: boolean; empty: boolean;
  conversations: MailItem[]; messages: MailItem[]; notifications: MailItem[];
  tabs: MailTab[]; title: string; activeTab: string; conversationId: string; recipientKey: string;
};

const content = (node: Element | null) => (node?.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();
const field = (root: ParentNode, selector: string) => content(root.querySelector(selector));

export function createInboxAdapter(doc: Document) {
  const win = doc.defaultView;
  let disposed = false;
  let serial = 0;
  const ids = new WeakMap<Element, { id: string; identity: string }>();
  const actions = new Map<string, { node: HTMLElement; kind: 'conversation' | 'tab'; author: string }>();
  const headerIds = new Map<string, string>();
  type ViewState = { nodes: Element[]; signature: string };
  let pendingConversation: { action: string; author: string; previous: ViewState; started: number; routeBefore: string; expectedRoute: string } | null = null;
  let pendingTab: { action: string; previous: ViewState } | null = null;
  let lastRoute = doc.location.pathname;
  let lastConversationState: ViewState | null = null;
  let routeFence: { route: string; previous: ViewState } | null = null;
  let validatedRecipient: { route: string; action: string; node: Element } | null = null;

  function id(node: Element, prefix: string, identity = '') {
    const known = ids.get(node);
    if (known && known.identity === identity) return known.id;
    const next = `${prefix}-${++serial}`;
    ids.set(node, { id: next, identity });
    return next;
  }

  function visible(node: Element) {
    for (let el: Element | null = node; el && el !== doc.body; el = el.parentElement) {
      if (el.hasAttribute('hidden')) return false;
      if (el.getAttribute('aria-hidden') === 'true' && !el.hasAttribute('data-rewind-source')) return false;
      const style = (el as HTMLElement).style;
      if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    }
    return true;
  }

  function selected(node: Element) {
    return node.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-current') === 'true'
      || [...node.classList].some(token => /(?:^|[-_])(?:active|selected)$/.test(token));
  }

  function count(node: Element | null): number | null {
    const value = content(node);
    return node && visible(node) && /^\d+$/.test(value) ? Number(value) : null;
  }

  function safeLink(root: ParentNode) {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const raw = anchor.getAttribute('href');
      if (!raw || raw.startsWith('#')) continue;
      try {
        const url = new URL(raw, doc.location.href);
        if (/^https?:$/.test(url.protocol) && url.hostname === 'www.xiaohongshu.com' && !url.port && !url.username && !url.password) return url.href;
      } catch { /* Ignore malformed links in source content. */ }
    }
    return '';
  }

  function mail(node: Element, prefix: string, values: Partial<MailItem> = {}): MailItem {
    return { id: values.id ?? id(node, prefix), author: '', date: '', text: '', url: '', action: '', unread: null, outgoing: false, ...values };
  }

  function readConversations(root: ParentNode) {
    const result: MailItem[] = [];
    let active: MailItem | undefined;
    let activeNode: HTMLElement | null = null;
    let selectedCount = 0;
    for (const node of root.querySelectorAll<HTMLElement>('.xhs-im-conv-item')) {
      if (!visible(node)) continue;
      const author = field(node, '.xhs-im-conv-item__name');
      const itemId = id(node, 'conversation', author);
      const item = mail(node, 'conversation', {
        id: itemId, author, date: field(node, '.xhs-im-conv-item__time'),
        text: field(node, '.xhs-im-conv-item__summary-text'), action: itemId,
        unread: count(node.querySelector('.xhs-im-conv-item__badge')),
      });
      // Never map arbitrary buttons or the message editor to an action.
      actions.set(itemId, { node, kind: 'conversation', author });
      result.push(item);
      if (selected(node)) { active = item; activeNode = node; selectedCount++; }
    }
    return { items: result, active: selectedCount === 1 ? active : undefined,
      activeNode: selectedCount === 1 ? activeNode : null, ambiguousSelection: selectedCount > 1 };
  }

  function sourceRouteMatches(node: Element, route: string) {
    const routeId = route.match(/^\/(?:chat|messages?|im)\/([^/]+)\/?$/)?.[1];
    if (!routeId) return false;
    if (['data-conversation-id', 'data-user-id', 'data-id'].some(name => node.getAttribute(name) === routeId)) return true;
    return [...node.querySelectorAll<HTMLAnchorElement>('a[href]')].some(anchor => {
      try { const url = new URL(anchor.getAttribute('href') || '', doc.location.href); return url.origin === doc.location.origin && url.pathname === route; }
      catch { return false; }
    });
  }

  function messageBody(node: Element) {
    const plain = [...node.querySelectorAll('.xhs-im-bubble__text')].map(content).filter(Boolean).join('\n');
    if (plain) return plain;
    const card = field(node, '.xhs-im-bubble-card-note-title');
    if (card) {
      const author = field(node, '.xhs-im-bubble-card-note-author-name');
      return `分享的笔记：${card}${author ? `\n作者：${author}` : ''}`;
    }
    const hint = field(node, '.xhs-im-hint__text');
    if (hint) return hint;
    if (node.querySelector('audio, [class*="bubble-voice"], [class*="bubble__voice"], [class*="bubble-audio"]')) return '语音。此模式不播放语音内容。';
    if (node.querySelector('video, [class*="bubble-video"], [class*="bubble__video"]')) return '视频。此模式不播放视频内容。';
    if (node.querySelector('[class*="bubble-image"], [class*="bubble__image"], [class*="bubble"] img')) return '图片。此模式不显示图片内容。';
    return '此记录的内容类型暂不支持。';
  }

  function readMessages(root: ParentNode, correspondent: string) {
    const result: MailItem[] = [];
    const list = root.querySelector('.xhs-im-msg-list') ?? root.querySelector('.xhs-im-msg-list-wrap');
    if (!list) return result;
    let date = '';
    for (const node of list.querySelectorAll('.xhs-im-msg-list__time-divider, .chat-item, .xhs-im-hint__text')) {
      if (!visible(node)) continue;
      if (node.matches('.xhs-im-msg-list__time-divider')) { date = content(node); continue; }
      if (node.matches('.xhs-im-hint__text') && node.closest('.chat-item')) continue;
      const outgoing = !!node.querySelector('.chat-item__content--right') || node.matches('.chat-item__content--right');
      const hint = node.matches('.xhs-im-hint__text');
      const body = hint ? content(node) : messageBody(node);
      result.push(mail(node, 'message', {
        id: id(node, 'message', `${date}:${outgoing}:${body}`),
        author: hint ? '' : outgoing ? '我' : correspondent, date,
        text: body, url: safeLink(node), outgoing,
      }));
    }
    return result;
  }

  function viewState(kind: 'conversation' | 'tab'): ViewState {
    if (kind === 'conversation') {
      const chat = doc.querySelector('.xhs-im-chat-window');
      const list = chat?.querySelector('.xhs-im-msg-list');
      return {
        nodes: list ? [...list.querySelectorAll('.chat-item, .xhs-im-hint__text')] : [],
        signature: JSON.stringify(chat ? readMessages(chat, '').map(item => [item.date, item.text, item.url, item.outgoing]) : []),
      };
    }
    const list = doc.querySelector('.notification-page .tabs-content-container');
    const nodes = list ? [...list.querySelectorAll(':scope > .container')] : [];
    return {
      nodes,
      // Only notification data fields: no source action controls or editor text.
      signature: JSON.stringify(nodes.map(node => ['.user-info', '.interaction-hint', '.interaction-content', '.quote-info'].map(selector => field(node, selector)))),
    };
  }

  function unchanged(before: ViewState, after: ViewState) {
    return before.signature === after.signature && before.nodes.length === after.nodes.length
      && before.nodes.every((node, index) => node === after.nodes[index]);
  }

  function readNotifications(result: Inbox) {
    const root = doc.querySelector('.notification-page');
    if (!root) return result;
    const list = root.querySelector('.tabs-content-container');
    result.ready = !!list;
    for (const tab of root.querySelectorAll<HTMLElement>('.reds-tabs-list .reds-tab-item')) {
      if (!visible(tab)) continue;
      const label = content(tab).match(/^(评论和@|赞和收藏|新增关注)/)?.[1];
      if (!label) continue;
      const tabId = id(tab, 'notification-tab', label);
      const active = selected(tab);
      result.tabs.push({ id: tabId, label, active });
      actions.set(tabId, { node: tab, kind: 'tab', author: '' });
      if (active) result.activeTab = tabId;
    }
    if (!list) return result;
    for (const node of list.querySelectorAll(':scope > .container')) {
      if (!visible(node)) continue;
      const info = node.querySelector(':scope > .main > .info, .main .info');
      if (!info) continue;
      const author = field(info, '.user-info a') || field(info, '.user-info');
      const date = field(info, '.interaction-time');
      const hint = info.querySelector('.interaction-hint')?.cloneNode(true) as Element | undefined;
      hint?.querySelectorAll('.interaction-time').forEach(time => time.remove());
      const body = [content(hint ?? null), field(info, '.interaction-content'), field(info, '.quote-info')].filter(Boolean).join('\n');
      // A source avatar/profile link is not the target note. Only content/extra
      // anchors can become a reading link; action-reply/action-like are excluded.
      const linkRoot = node.querySelector('.extra a[href]')?.parentElement;
      const contentRoot = info.querySelector('.interaction-content');
      const quoteRoot = info.querySelector('.quote-info');
      const url = (linkRoot ? safeLink(linkRoot) : '') || (contentRoot ? safeLink(contentRoot) : '') || (quoteRoot ? safeLink(quoteRoot) : '');
      result.notifications.push(mail(node, 'notification', {
        id: id(node, 'notification', `${author}:${date}:${body}`), author, date, text: body, url,
      }));
    }
    if (!result.notifications.length) {
      // Do not guess emptiness from an unrecognised/loading container.
      const empty = list.querySelector('.empty-text, .empty, .empty-container, .empty-tip, .no-data');
      result.empty = !!empty && visible(empty) && /^(?:暂时没有(?:消息|通知)|暂无(?:消息|通知)|还没有(?:消息|通知)|没有(?:消息|通知)|暂无内容)[。.!！\s]*$/.test(content(empty));
    }
    if (pendingTab) {
      if (result.activeTab !== pendingTab.action || (!result.empty && (!result.notifications.length || unchanged(pendingTab.previous, viewState('tab'))))) {
        result.ready = false; result.notifications = []; result.empty = false;
      } else pendingTab = null;
    }
    return result;
  }

  function read(): Inbox {
    const notifications = /^\/notifications?(?:\/|$)/.test(doc.location.pathname);
    const result: Inbox = {
      kind: notifications ? 'notifications' : 'messages', ready: false, empty: false,
      conversations: [], messages: [], notifications: [], tabs: [], title: notifications ? '通知' : '消息',
      activeTab: '', conversationId: '', recipientKey: '',
    };
    if (disposed) return result;
    actions.clear();
    if (notifications) { pendingConversation = null; routeFence = null; validatedRecipient = null; return readNotifications(result); }
    pendingTab = null;
    if (!/^\/(?:chat|messages?|im)(?:\/|$)/.test(doc.location.pathname)) {
      pendingConversation = null; routeFence = null; validatedRecipient = null; lastConversationState = null; lastRoute = doc.location.pathname; return result;
    }
    if (lastRoute !== doc.location.pathname) {
      routeFence = lastConversationState ? { route: doc.location.pathname, previous: lastConversationState } : null;
      validatedRecipient = null;
      lastRoute = doc.location.pathname;
    }
    if (pendingConversation && (Date.now() - pendingConversation.started > 12000
      || (pendingConversation.expectedRoute !== pendingConversation.routeBefore && doc.location.pathname !== pendingConversation.expectedRoute))) pendingConversation = null;
    const root = doc.querySelector('.xhs-im-page, .xhs-im-view');
    if (!root) return result;
    result.ready = true;
    const conversations = readConversations(root);
    result.conversations = conversations.items;
    if (conversations.ambiguousSelection) result.ready = false;
    result.empty = !result.conversations.length && !!root.querySelector('.xhs-im-conv-list__empty, .xhs-im-empty, .xhs-im-empty-state');
    const chat = root.querySelector('.xhs-im-chat-window');
    if (!chat) return result;
    const title = field(chat, '.xhs-im-chat-window__header-name');
    if (!title) return result;
    // A newly selected item can precede the old chat window's replacement.
    if ((pendingConversation && pendingConversation.author !== title) || (conversations.active?.author && conversations.active.author !== title)) {
      result.ready = false;
      return result;
    }
    result.title = title;
    const sameName = conversations.items.filter(item => item.author === title);
    if (!conversations.active && sameName.length > 1) result.ready = false;
    const active = conversations.active ?? (sameName.length === 1 ? sameName[0] : undefined);
    if (active) result.conversationId = active.id;
    else {
      if (!headerIds.has(title)) headerIds.set(title, `conversation-header-${++serial}`);
      result.conversationId = headerIds.get(title)!;
    }
    // Sending requires both a source conversation row and a native route ID.
    // Display names alone cannot distinguish two correspondents with the same name.
    result.messages = readMessages(chat, title);
    const emptyChat = chat.querySelector('.xhs-im-msg-list__empty, .xhs-im-chat-window__empty, .xhs-im-empty');
    const empty = !!emptyChat && visible(emptyChat);
    if (empty && !result.messages.length) result.empty = true;
    if (pendingConversation) {
      if (result.conversationId !== pendingConversation.action || (!empty && (!result.messages.length || unchanged(pendingConversation.previous, viewState('conversation'))))) {
        result.ready = false; result.messages = []; result.empty = false;
      } else {
        if (conversations.activeNode && conversations.active?.id === pendingConversation.action) validatedRecipient = { route: doc.location.pathname, action: pendingConversation.action, node: conversations.activeNode };
        pendingConversation = null;
      }
    }
    const currentState = viewState('conversation');
    if (routeFence?.route === doc.location.pathname) {
      // Returning to the directory only needs its conversation rows. The old
      // chat pane may remain mounted there, so its unchanged body is not a
      // reason to keep the directory waiting.
      if (/^\/(?:chat|messages?|im)\/[^/]+/.test(doc.location.pathname) && !empty && unchanged(routeFence.previous, currentState)) result.ready = false;
      else routeFence = null;
    }
    lastConversationState = currentState;
    const selectedRow = conversations.activeNode;
    if (result.ready && conversations.active && selectedRow && active?.id === conversations.active.id
      && (sourceRouteMatches(selectedRow, doc.location.pathname)
        || (validatedRecipient?.route === doc.location.pathname && validatedRecipient.action === active.id && validatedRecipient.node === selectedRow))) {
      result.recipientKey = `${doc.location.pathname}:${active.id}`;
    }
    return result;
  }

  function activate(action: string) {
    if (disposed) return false;
    const entry = actions.get(action);
    if (!entry?.node.isConnected) return false;
    if (entry.kind === 'conversation' && !entry.node.matches('.xhs-im-conv-item')) return false;
    if (entry.kind === 'tab' && !entry.node.matches('.notification-page .reds-tabs-list .reds-tab-item')) return false;
    if (entry.kind === 'conversation') {
      const current = read();
      pendingConversation = current.conversationId === action ? null : { action, author: entry.author, previous: viewState('conversation'), started: Date.now(), routeBefore: doc.location.pathname, expectedRoute: doc.location.pathname };
    } else {
      const current = read();
      pendingTab = current.activeTab === action ? null : { action, previous: viewState('tab') };
    }
    entry.node.click();
    if (entry.kind === 'conversation' && pendingConversation) pendingConversation.expectedRoute = doc.location.pathname;
    return true;
  }

  function loadMore(mode: 'conversations' | 'conversation' | 'notifications') {
    if (disposed || !win) return;
    const root = mode === 'notifications' ? doc.querySelector('.notification-page') : doc.querySelector('.xhs-im-page, .xhs-im-view');
    const target = mode === 'conversation'
      ? root?.querySelector('.xhs-im-msg-list-wrap')
      : mode === 'conversations'
        ? root?.querySelector('.xhs-im-conv-list__scroll') ?? root?.querySelector('.xhs-im-conv-list, .xhs-im-conv-list-wrap') ?? root?.querySelector('.xhs-im-conv-item')?.parentElement
        : root?.querySelector('.tabs-content-container');
    if (!target) return;
    let scroll = target as HTMLElement;
    let scrollFound = false;
    for (let node: Element | null = target; node && node !== doc.body; node = node.parentElement) {
      const el = node as HTMLElement;
      if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(win.getComputedStyle(el).overflowY)) { scroll = el; scrollFound = true; break; }
      if (node === root && mode !== 'notifications') break;
    }
    if (mode === 'notifications' && !scrollFound) {
      win.scrollTo({ top: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight), behavior: 'instant' });
      win.dispatchEvent(new win.Event('scroll'));
      return;
    }
    scroll.scrollTop = mode === 'conversation' ? 0 : scroll.scrollHeight;
    scroll.dispatchEvent(new win.Event('scroll'));
  }

  return { read, activate, loadMore, destroy() { disposed = true; actions.clear(); headerIds.clear(); pendingConversation = null; pendingTab = null; routeFence = null; validatedRecipient = null; lastConversationState = null; } };
}
