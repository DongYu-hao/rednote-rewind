import { nativeMessageForm, submitNativeMessage } from './adapters/xiaohongshu/message-compose';
import { createInboxAdapter, type Inbox, type MailItem } from './adapters/xiaohongshu/inbox';
import { documentAction } from './document-action';
import type { HistoricalEra } from './eras';
import { periodText } from './presentation/period-text';

const PAGE_SIZE = 10;
type Mode = 'conversations' | 'conversation' | 'notifications';

/** Read through the source adapter; optional composer validates the recipient again on submit. */
export function mountInbox(doc: Document, parent: HTMLElement, era: HistoricalEra = '1995', navigate?: (url: string) => void) {
  const adapter = createInboxAdapter(doc);
  const win = doc.defaultView!;
  const routeMode = (): Mode => doc.location.pathname.startsWith('/notification') ? 'notifications'
    : /^\/(?:chat|messages?|im)\/[^/]+/.test(doc.location.pathname) ? 'conversation' : 'conversations';
  let mode: Mode = routeMode();
  let observedUrl = doc.location.href;
  let current: Inbox | null = null;
  let items: MailItem[] = [];
  let offsets = [0];
  let page = 0;
  let disposed = false;
  let expected = '';
  let waiting: 'initial' | 'select' | 'next' | null = 'initial';
  let deadline = Date.now() + 12000;
  let signature = '';
  let stableSince = 0;
  let status: HTMLElement;
  let selectedLetter: string | null = null;
  const drafts = new Map<string, string>();
  const root = doc.createElement('section'); root.dataset.inbox = ''; parent.append(root);

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
    const element = doc.createElement(tag); element.textContent = periodText(text, era); return element;
  }
  function button(label: string, name: string, onClick: () => void) {
    const node = documentAction(doc, era, periodText(label, era), onClick); node.dataset.mailAction = name;
    return node;
  }
  function collection(data: Inbox) {
    if (mode === 'notifications') return data.notifications;
    // A mailbox opens at the newest records. Earlier records are requested by
    // explicit pagination, never by scrolling the historical document.
    if (mode === 'conversation') return [...data.messages].reverse();
    return data.conversations;
  }
  function start(kind: NonNullable<typeof waiting>) {
    waiting = kind; deadline = Date.now() + 12000; signature = ''; stableSince = Date.now();
    status.textContent = kind === 'next' ? '正在读取下一页，请稍候。' : '正在读取，请稍候。';
  }
  function select(id: string, conversation: boolean) {
    if (waiting && waiting !== 'initial') return;
    if (!adapter.activate(id)) { status.textContent = '目录已经变化，请重新读取。'; return; }
    mode = conversation ? 'conversation' : 'notifications'; expected = id;
    // Never put the previous person's messages under a newly selected name.
    items = []; offsets = [0]; page = 0; current = null; selectedLetter = null;
    render(); start('select');
  }
  function reset() {
    items = []; offsets = [0]; page = 0; current = null; expected = ''; selectedLetter = null;
    render(); start('initial');
  }
  function next() {
    if (waiting) return;
    const incoming = adapter.read();
    const ids = new Set(items.map(item => item.id));
    const boundary = offsets[page + 1] ?? Math.min((offsets[page] ?? 0) + PAGE_SIZE, items.length);
    items.push(...collection(incoming).filter(item => !ids.has(item.id)));
    if (items.length > boundary) { offsets[page + 1] = boundary; page++; render(); return; }
    start('next'); adapter.loadMore(mode);
  }
  function writeCompatibility() {
    if (!['2005','2010','2015'].includes(era) || !current?.ready || !current.recipientKey || !nativeMessageForm(doc)) return el('p', '尚未取得可确认收件人的发送表单。可在原站写信。');
    const id = current.conversationId, title = current.title, url = doc.location.href, recipientKey = current.recipientKey;
    const form = el('form'); form.className = 'mail-compose';
    const label = el('label', `发送给 ${title}`), input = el('textarea'); input.rows = 3; input.setAttribute('aria-label',`发送给 ${title}`); input.value = drafts.get(id) || ''; label.append(input);
    const send = el('button','发送'); send.type = 'submit'; const report = el('p'); report.setAttribute('role','status');
    input.addEventListener('input', () => { drafts.set(id,input.value); if (drafts.size > 10) drafts.delete(drafts.keys().next().value!); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (send.disabled || disposed) return;
      send.disabled = true;
      const startingEra = era;
      const nativeForm = nativeMessageForm(doc);
      const chat = doc.querySelector('.xhs-im-chat-window');
      const matches = () => {
        const latest = adapter.read(), formNow = nativeMessageForm(doc);
        return !disposed && !waiting && mode === 'conversation' && era === startingEra && form.isConnected
          && doc.location.href === url && current?.conversationId === id && current.recipientKey === recipientKey
          && latest.ready && latest.conversationId === id && latest.recipientKey === recipientKey && latest.title === title
          && !!chat && chat.isConnected && doc.querySelector('.xhs-im-chat-window') === chat
          && !!nativeForm && formNow?.editor === nativeForm.editor && formNow.submit === nativeForm.submit;
      };
      const failure = await submitNativeMessage(doc,input.value,matches);
      if (!form.isConnected) return;
      if (failure) { report.textContent = failure; send.disabled = false; }
      else { input.disabled = true; report.textContent = '已交给原站处理，请刷新记录确认。'; drafts.delete(id); }
    });
    form.append(label,send,report); return form;
  }
  function render() {
    root.replaceChildren();
    root.className = `mailbox mailbox-${era}`;
    const navigation = el('nav');
    if (mode === 'conversation') navigation.append(button(era === '1985' ? '返回信件目录' : '返回消息目录', 'back', () => {
      mode = 'conversations'; reset();
      if (routeMode() === 'conversation') {
        const sourceLink = [...doc.querySelectorAll<HTMLAnchorElement>('a[href]')].find(a => {
          try { const url = new URL(a.href, doc.location.href); return url.origin === doc.location.origin && url.pathname === '/chat'; } catch { return false; }
        });
        if (navigate) navigate('/chat');
        else if (sourceLink) sourceLink.click(); else win.location.assign('/chat');
      }
    }));
    if (current?.kind === 'notifications') {
      for (const [index, tab] of current.tabs.entries()) {
        const control = button(tab.label, 'category', () => select(tab.id, false));
        control.dataset.category = tab.id; control.disabled = tab.active;
        if (era === '1985') {
          const category = el('span'); category.className = 'terminal-category';
          category.append(el('span', `C ${index + 1}`), control); navigation.append(category);
        } else navigation.append(control);
      }
    }
    if (navigation.hasChildNodes()) root.append(navigation);
    const heading = mode === 'conversation' ? current?.title || '通信记录' : mode === 'notifications' ? '通知目录' : era === '1985' ? '信件目录' : '消息目录';
    root.append(el('h3', heading));
    status = el('p', waiting ? '正在读取，请稍候。' : ''); status.setAttribute('role', 'status'); status.dataset.mailStatus = ''; root.append(status);
    const startAt = offsets[page] ?? 0;
    const pageItems = items.slice(startAt, offsets[page + 1] ?? startAt + PAGE_SIZE);
    // Later private conversations read from older to newer within each batch.
    if (mode === 'conversation' && (era === '2010' || era === '2015')) pageItems.reverse();
    const letter = era === '1985' && selectedLetter ? items.find(item => item.id === selectedLetter) : null;
    if (letter) {
      const record = el('article'); record.className = 'terminal-letter'; record.dataset.mailItem = letter.id;
      record.append(el('p', `发信人：${letter.outgoing ? '我' : letter.author || current?.title || '对方'}`));
      if (letter.date) record.append(el('p', `日期：${letter.date}`));
      const body = el('div', letter.text); body.className = 'body'; record.append(body);
      if (letter.url) { const a = el('a', '查看相关页面'); a.href = letter.url; a.dataset.mailTarget = ''; record.append(a); }
      record.append(button('B 返回信件目录', 'letter-back', () => { selectedLetter = null; render(); }));
      if (mode === 'conversation') record.append(el('p'), writeCompatibility());
      root.append(record); return;
    }
    if (era === '1985') {
      const header = el('div'); header.className = 'terminal-mail-heading';
      header.append(el('span', '号'), el('span', mode === 'conversations' ? '通信对象' : '发信人'), el('span', '内容摘要')); root.append(header);
      const directory = el('ol'); directory.className = 'terminal-mail-directory';
      pageItems.forEach((item, index) => {
        const row = el('li'); row.className = 'terminal-mail-row'; row.dataset.mailItem = item.id;
        const ordinal = el('span', String(index + 1).padStart(2, ' ')); ordinal.className = 'terminal-mail-number';
        const author = item.outgoing ? '我' : item.author || (mode === 'notifications' ? '通知' : current?.title || '对方');
        const name = item.unread ? `${author} (${item.unread})` : author;
        const open = button(name, 'open', () => {
          if (mode === 'conversations') select(item.action, true);
          else { selectedLetter = item.id; render(); }
        });
        if (mode === 'conversations') open.dataset.conversation = item.id;
        const body = el('p', item.text); body.className = 'body terminal-mail-preview';
        row.append(ordinal, open, body); directory.append(row);
      });
      root.append(directory);
      if (pageItems.length) root.append(el('p', '输入本页序号阅读信件。'));
    } else if (era === '2000') {
      const table = el('table'); table.className = 'mail-table';
      const colgroup = el('colgroup');
      for (const width of ['18%', '67%', '15%']) { const column = el('col'); column.style.width = width; colgroup.append(column); }
      table.append(colgroup);
      const head = el('thead'); const labels = el('tr');
      const columns = mode === 'conversations' ? ['通信对象', '内容', '时间']
        : mode === 'conversation' ? ['作者', '正文', '时间'] : ['作者', '内容', '时间'];
      for (const label of columns) {
        const cell = el('th', label); cell.scope = 'col'; labels.append(cell);
      }
      head.append(labels); const rows = el('tbody');
      for (const item of pageItems) {
        const row = el('tr'); row.dataset.mailItem = item.id;
        const author = el('td');
        if (mode === 'conversations') {
          const name = item.unread ? `${item.author || '会话'} (${item.unread})` : item.author || '会话';
          const open = button(name, 'open', () => select(item.action, true));
          open.dataset.conversation = item.id; author.append(open);
        } else author.textContent = periodText(item.outgoing ? '我' : item.author || (mode === 'notifications' ? '通知' : current?.title || '对方'), era);
        const content = el('td'); const body = el('p', item.text); body.className = 'body'; content.append(body);
        if (item.url) {
          const a = el('a', '查看相关页面'); a.href = item.url; content.append(a);
        }
        row.append(author, content, el('td', item.date)); rows.append(row);
      }
      table.append(head, rows); root.append(table);
    } else {
      const list = el('ol'); list.start = startAt + 1;
      list.className = 'mail-letter-list';
      for (const item of pageItems) {
        const row = el('li'); row.className = 'mail-letter-record'; row.dataset.mailItem = item.id;
        if (mode === 'conversation' && (era === '2010' || era === '2015')) row.dataset.outgoing = String(Boolean(item.outgoing));
        if (mode === 'conversations') {
          const name = item.unread ? `${item.author || '会话'} (${item.unread})` : item.author || '会话';
          const open = button(name, 'open', () => select(item.action, true)); open.dataset.conversation = item.id; row.append(open);
        } else row.append(el('strong', item.outgoing ? '我' : item.author || (mode === 'notifications' ? '通知' : current?.title || '对方')));
        if (item.date) row.append(el('p', item.date));
        const body = el('p', item.text); body.className = 'body'; row.append(body);
        if (item.url) {
          const a = el('a', '查看相关页面'); a.href = item.url; row.append(a);
        }
        list.append(row);
      }
      root.append(list);
    }
    if (!items.length && !waiting) root.append(el('p', current?.empty ? '当前没有记录。' : '尚未读取到记录。'));
    const paging = el('div'); paging.className = 'paging';
    const prev = button('上一页', 'previous', () => { if (!waiting && page) { page--; selectedLetter = null; render(); } }); prev.disabled = page === 0;
    const more = button('下一页', 'next', next); more.disabled = !items.length;
    const pageNumber = el('span', `第 ${page + 1} 页`); pageNumber.className = 'page-number';
    paging.append(prev, more, pageNumber);
    root.append(paging, button('重新读取目录', 'refresh', reset));
    if (mode === 'conversation') {
      root.append(writeCompatibility());
    }
  }
  function tick() {
    if (disposed) return;
    if (observedUrl !== doc.location.href) {
      observedUrl = doc.location.href;
      // Native conversation clicks also change /chat to /chat/:id. Keep the
      // in-flight identity fence instead of rebuilding the mailbox as a list.
      if (!(waiting === 'select' && mode === 'conversation')) { mode = routeMode(); reset(); }
    }
    if (!waiting) return;
    const data = adapter.read();
    const list = collection(data);
    const expectedMatches = !expected || (mode === 'conversation' ? data.conversationId === expected : data.activeTab === expected);
    if (!current && mode === 'notifications' && data.tabs.length) { current = data; render(); }
    const nextSignature = JSON.stringify([data.conversationId, data.activeTab, data.title, list.map(item => [item.id, item.text])]);
    if (nextSignature !== signature) { signature = nextSignature; stableSince = Date.now(); }
    if (data.ready && expectedMatches && Date.now() - stableSince >= 350 && (list.length || data.empty)) {
      current = data;
      if (waiting === 'next') {
        const ids = new Set(items.map(item => item.id));
        const additions = list.filter(item => !ids.has(item.id));
        if (additions.length) {
          const boundary = Math.min((offsets[page] ?? 0) + PAGE_SIZE, items.length);
          items.push(...additions); offsets[page + 1] = boundary; page++; waiting = null; render();
        }
      } else { items = list; waiting = null; render(); }
    }
    if (waiting && Date.now() >= deadline) {
      current = expectedMatches ? data : null; waiting = null; render();
      status.textContent = '尚未取得新的记录。请重新读取；若原站要求登录或验证，可切换至 now 处理。';
    }
  }
  render();
  // Already loaded lists need not wait for another site navigation.
  tick();
  const timer = win.setInterval(tick, 200);
  return {
    element: root,
    setEra(next: HistoricalEra) {
      if (era === next) return;
      era = next;
      const message = status.textContent;
      render(); status.textContent = message;
    },
    destroy() { disposed = true; win.clearInterval(timer); adapter.destroy(); drafts.clear(); root.remove(); },
  };
}
