import type { PeriodPageContext } from './types';
import type { Entry, Comment, Picture } from '../adapters/xiaohongshu';

/** Shared source data, but separate photo-community, timeline and photo-feed reading flows. */
export function renderSocialPage(parent: HTMLElement, ctx: PeriodPageContext) {
  const { doc, data, era } = ctx;
  const photos = era === '2005', timeline = era === '2010';
  const query = new URL(data.key).searchParams.get('keyword');
  const liveList = new URL(data.key).pathname === '/livelist';
  const gallery = era === '2015' && (data.kind === 'profile' || !!query || liveList);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') => {
    const node = doc.createElement(tag); node.textContent = ctx.text(text); node.className = cls; return node;
  };
  const creator = (label: string) => {
    const link = el('a', label, 'publish'); link.href = 'https://creator.xiaohongshu.com/';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.creator = ''; return link;
  };
  const author = (name: string, url: string) => url ? ctx.link(ctx.text(name || '作者'), url) : el('span', name || '作者');
  const byline = (target: HTMLElement, name: string, url: string, date: string) => {
    const line = el('div', '', 'byline'); line.append(author(name, url));
    if (date) line.append(el('time', date)); target.append(line);
  };
  function avatar(picture: Picture | undefined, name: string, url: string) {
    const node = url ? ctx.link('', url) : el('span'); node.className = 'avatar';
    const label = name || '作者';
    node.setAttribute('aria-label', picture ? `${label}的头像` : `${label}，未提供头像`);
    if (picture) ctx.mountImage(node, picture, '头像', 80);
    else node.classList.add('avatar-missing');
    return node;
  }
  const channels = () => {
    const nav = el('nav', '', 'social-channels'); nav.setAttribute('aria-label', '分类');
    for (const item of data.channels ?? []) {
      const button = ctx.action(ctx.text(item.label), 'channel', () => ctx.selectChannel(item.id, item.label));
      button.dataset.channel = item.id; button.disabled = item.active; button.setAttribute('aria-current', String(item.active)); nav.append(button);
    }
    return nav;
  };
  parent.classList.add(`social-${era}`, `page-${data.kind}`);
  if (query) parent.classList.add('page-search');
  const searchInput = ctx.searchForm.querySelector<HTMLInputElement>('input');
  if (searchInput) searchInput.placeholder = photos ? '搜索照片与文字' : '搜索小红书';
  const header = el('header', '', 'social-header');
  const brand = el('h1');
  const brandLink = ctx.link('小红书', '/explore'); brandLink.className = 'era-brand';
  const logo = ctx.createLogo(); if (logo) brandLink.prepend(logo);
  brand.append(brandLink);
  header.append(brand, ctx.navigation, ctx.searchForm, creator(photos ? '上传作品' : timeline ? '发表动态' : '发布'));
  parent.append(header, ctx.status);
  const shell = el('div', '', 'social-shell'), content = el('div', '', 'social-content');
  const aside = el('aside', '', 'social-side'); aside.setAttribute('aria-label', timeline ? '作者资料' : '照片资料');
  // Keep the 2005 directory/author information before the reading list in
  // document and keyboard order. Its desktop position is set by the era grid.
  if (photos) shell.append(aside, content);
  else shell.append(content);
  if (photos || timeline) {
    if (timeline) shell.append(aside);
    if (photos && data.kind === 'note') {
      const identity = el('section', '', 'side-identity');
      identity.append(avatar(data.avatar, data.author, data.authorUrl));
      byline(identity, data.author, data.authorUrl, data.date);
      if (data.authorUrl) identity.append(ctx.link(photos ? '浏览作者的作品' : '查看个人主页', data.authorUrl));
      ctx.mountActions(identity, ['follow']); aside.append(identity);
    }
    if (data.channels?.length) {
      if (photos) aside.append(el('h2', '照片分类'), channels());
      else parent.append(channels());
    }
    if (!aside.children.length) { aside.hidden = true; shell.classList.add('without-side'); }
  } else if (data.kind === 'list' && data.channels?.length) parent.append(channels());
  parent.append(shell);
  let list: HTMLElement | null = null;
  function entry(item: Entry, index: number) {
    const row = el('article', '', item.kind === 'user' ? 'user-result' : photos ? 'photo-entry' : timeline ? 'timeline-entry' : gallery ? 'gallery-entry' : 'feed-entry');
    row.dataset.socialEntry = item.id;
    if (item.kind === 'live') row.classList.add('live-entry');
    const title = item.url ? ctx.link(ctx.text(item.title || '无题'), item.url) : el('span', item.title || '无题'); title.dataset.entry = item.id;
    const heading = el('h3'); heading.append(title);
    if (item.kind === 'user') {
      const copy = el('div'); copy.append(heading);
      if (item.bio) copy.append(el('p', item.bio));
      copy.append(ctx.link('查看个人主页', item.url));
      row.append(avatar(item.avatar, item.title, item.url), copy); return row;
    }
    const identity = el('header', '', 'entry-identity');
    identity.append(avatar(item.avatar, item.author, item.authorUrl)); byline(identity, item.author, item.authorUrl, item.date);
    const media = el('div', '', 'entry-picture');
    if (item.thumbnail) {
      if (!photos && !timeline && !gallery) {
        const { width, height } = item.thumbnail;
        // Reserve the final feed slot before a deliberately slow image arrives.
        media.style.aspectRatio = width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
          ? `${width} / ${height}` : '4 / 3';
      }
      const pictureLink = item.url ? ctx.link('', item.url) : el('div');
      pictureLink.setAttribute('aria-label', ctx.text(`查看 ${item.title || '作品'}`));
      ctx.mountImage(pictureLink, item.thumbnail, '照片', photos ? 240 : timeline ? 440 : gallery ? 640 : 1080, index); media.append(pictureLink);
    } else row.classList.add('text-entry');
    const caption = el('div', '', 'entry-caption');
    if (timeline) {
      const copy = el('div', '', 'entry-copy'); byline(copy, item.author, item.authorUrl, item.date);
      copy.append(heading); if (item.thumbnail) copy.append(media);
      const actions = el('nav', '', 'entry-actions');
      actions.append(ctx.link(item.kind === 'live' ? '进入直播间' : '阅读与评论', item.url)); copy.append(actions);
      row.append(avatar(item.avatar, item.author, item.authorUrl), copy);
    } else if (photos || gallery) {
      if (item.thumbnail) row.append(media);
      else if (photos) { const textCover = el('div', '文字记录', 'text-cover'); row.append(textCover); }
      caption.append(heading); byline(caption, item.author, item.authorUrl, item.date); row.append(caption);
    } else {
      row.append(identity); if (item.thumbnail) row.append(media);
      caption.append(heading, ctx.link('阅读正文与评论', item.url)); row.append(caption);
    }
    if (item.kind === 'live') row.append(el('span', '直播中', 'live-label'));
    if (item.subject) ctx.mountActions(timeline ? row.querySelector('.entry-copy')! : caption, ['like'], item.subject);
    return row;
  }
  function appendEntries(items: Entry[]) {
    if (!list) return;
    const offset = list.children.length;
    items.forEach((item, i) => list!.append(entry(item, offset + i)));
  }
  function index() {
    const users = ctx.entries.some(item => item.kind === 'user');
    list = el('div', '', users ? 'user-results' : photos ? 'photo-directory' : timeline ? 'timeline' : gallery ? 'photo-grid' : 'photo-feed');
    list.setAttribute('aria-label', users ? '用户搜索结果' : photos ? '照片目录' : timeline ? '动态列表' : gallery ? '照片网格' : '照片动态');
    content.append(list); appendEntries(ctx.entries);
    if (!ctx.entries.length) content.append(el('p', data.empty ? '没有找到相关内容。请尝试其他关键词。' : '正在等候页面内容，请稍后重新读取。', 'empty'));
    ctx.pagination(content);
  }
  let discussionList: HTMLElement | null = null;
  function updateDiscussion(items: Comment[]) {
    if (!discussionList) return;
    const focus = doc.activeElement?.shadowRoot?.activeElement as HTMLElement | null;
    const previousAction = focus && discussionList.contains(focus) ? focus.dataset.action : undefined;
    discussionList.replaceChildren();
    for (const item of items) {
      const row = el('article', '', 'social-comment'); row.dataset.comment = item.id;
      if (item.parentId) { row.classList.add('comment-reply'); row.setAttribute('aria-label', '回复'); }
      byline(row, item.author, item.authorUrl, item.date); row.append(el('p', item.text, 'body'));
      if (item.subject) ctx.mountActions(row, ['reply', 'like'], item.subject);
      discussionList.append(row);
    }
    if (!items.length) discussionList.append(el('p', data.hasMore ? '尚未读取到评论。可读取更多留言。' : '还没有评论。', 'empty'));
    ctx.mountActions(discussionList, ['replies']); ctx.pagination(discussionList, true);
    if (previousAction) discussionList.querySelector<HTMLElement>(`[data-action="${previousAction}"]`)?.focus({ preventScroll: true });
  }
  function discussion(target: HTMLElement) {
    const section = el('section', '', 'social-discussion'); section.dataset.discussion = '';
    section.append(el('h2', photos ? '大家的留言' : '评论'));
    discussionList = el('div', '', 'discussion-list'); section.append(discussionList);
    updateDiscussion(ctx.comments); ctx.mountCompose(section); target.append(section);
  }
  function note() {
    const article = el('article', '', 'social-note');
    if (!data.images.length && !data.video) article.classList.add('no-media');
    const media = el('section', '', 'note-media'); media.setAttribute('aria-label', '作品图片');
    // Mount each image at most once. Navigation changes visibility, preserving decoded images.
    const stage = el('div', '', 'photo-stage'); media.append(stage);
    const slides: HTMLElement[] = [];
    data.images.forEach((picture, i) => {
      const slide = el('div', '', 'photo-slide'); slide.hidden = i !== 0; slides.push(slide); stage.append(slide);
      if (era === '2015') {
        const { width, height } = picture;
        slide.style.aspectRatio = width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
          ? `${width} / ${height}` : '4 / 3';
      }
      if (!i) ctx.mountImage(slide, picture, '照片 1', photos ? 640 : timeline ? 800 : 1080, i);
    });
    const mounted = new Set([0]); let selected = 0;
    if (slides.length > 1) {
      const pager = el('nav', '', 'photo-navigation'); pager.setAttribute('aria-label', '照片翻阅');
      const count = el('span', `1 / ${slides.length}`); count.setAttribute('aria-live', 'polite');
      const previous = ctx.action('上一张', 'picture-previous', () => select(selected - 1));
      const next = ctx.action('下一张', 'picture-next', () => select(selected + 1));
      function select(index: number) {
        if (index < 0 || index >= slides.length) return;
        slides[selected]!.hidden = true; selected = index; slides[index]!.hidden = false;
        if (!mounted.has(index)) { mounted.add(index); ctx.mountImage(slides[index]!, data.images[index]!, `照片 ${index + 1}`, photos ? 640 : timeline ? 800 : 1080, index); }
        count.textContent = `${index + 1} / ${slides.length}`; previous.disabled = index === 0; next.disabled = index === slides.length - 1;
      }
      previous.disabled = true; pager.append(previous, count, next); media.append(pager);
    }
    if (data.video) ctx.mountVideo(media);
    const copy = el('div', '', 'note-copy');
    const identity = el('header', '', 'note-identity'); identity.append(avatar(data.avatar, data.author, data.authorUrl)); byline(identity, data.author, data.authorUrl, data.date);
    ctx.mountActions(identity, ['follow']);
    if (!photos) copy.append(identity, el('h2', data.title || '无题', 'note-title'));
    const body = el('div', data.text, 'body note-body');
    if (!photos && (data.text.length > 160 || data.text.split('\n').length > 4)) {
      body.classList.add('collapsed');
      const expand = ctx.action('展开全文', 'expand-text', () => { body.classList.toggle('collapsed'); expand.textContent = body.classList.contains('collapsed') ? '展开全文' : '收起全文'; });
      copy.append(body, expand);
    } else copy.append(body);
    const interactions = el('div', '', 'note-actions'); ctx.mountActions(interactions, ['like', 'collect']);
    interactions.append(ctx.action('复制链接', 'share', ctx.copyLink)); copy.append(interactions);
    if (photos) { article.append(el('h2', data.title || '无题', 'photo-page-title'), media, copy); content.append(article); discussion(content); }
    else if (timeline) { article.append(copy, media); content.append(article); discussion(content); }
    else { article.append(media, copy); discussion(copy); content.append(article); }
  }
  let liveMessages: HTMLElement | null = null;
  let renderedMessages: { author: string; text: string }[] = [];
  function updateLive(messages: { author: string; text: string }[]) {
    if (!liveMessages) return;
    if (liveMessages.hasChildNodes() && messages.length === renderedMessages.length && messages.every((message, i) =>
      message.author === renderedMessages[i]?.author && message.text === renderedMessages[i]?.text)) return;
    const atBottom = liveMessages.scrollHeight - liveMessages.scrollTop - liveMessages.clientHeight < 40;
    const previousTop = liveMessages.scrollTop;
    const previousHeight = liveMessages.scrollHeight;
    // A bounded source list drops older messages. Reuse the overlapping nodes so
    // an aria log announces only newly received messages, not the whole history.
    let overlap = Math.min(renderedMessages.length, messages.length);
    while (overlap && !messages.slice(0, overlap).every((message, i) => {
      const old = renderedMessages[renderedMessages.length - overlap + i];
      return message.author === old?.author && message.text === old?.text;
    })) overlap--;
    if (!messages.length) {
      liveMessages.replaceChildren(el('p', '暂无已读取的聊天记录。'));
    } else {
      if (!overlap) liveMessages.replaceChildren();
      else for (let i = 0; i < renderedMessages.length - overlap; i++) liveMessages.firstChild?.remove();
      const removedHeight = liveMessages.scrollHeight - previousHeight;
      for (const message of messages.slice(overlap)) {
        const row = el('p'); row.append(el('strong', message.author), doc.createTextNode(' ' + ctx.text(message.text))); liveMessages.append(row);
      }
      if (!atBottom) liveMessages.scrollTop = Math.max(0, previousTop + removedHeight);
    }
    renderedMessages = messages.map(message => ({ author: message.author, text: message.text }));
    if (atBottom) liveMessages.scrollTop = liveMessages.scrollHeight;
  }
  if (data.kind === 'live') {
    shell.classList.add('live-layout'); aside.hidden = true;
    if (photos) {
      content.append(el('h2', '直播节目', 'page-title'));
      content.append(el('p', '此年代的照片目录暂不提供直播阅读。请通过网页年代设置选择较晚的年代。', 'live-unavailable'));
    } else {
      content.append(el('h2', data.title, 'page-title'));
      const room = el('div', '', 'live-room'), broadcast = el('section', '', 'live-broadcast');
      byline(broadcast, data.author, data.authorUrl, ''); ctx.mountVideo(broadcast);
      const chat = el('section', '', 'live-conversation'); chat.append(el('h2', '直播间交流'));
      liveMessages = el('div', '', 'live-messages'); liveMessages.setAttribute('role', 'log'); liveMessages.setAttribute('aria-relevant', 'additions');
      chat.append(liveMessages); updateLive(data.liveMessages || []);
      chat.append(el('p', '显示原站已接收的聊天记录。', 'live-hint'));
      room.append(broadcast, chat); content.append(room);
    }
  } else if (data.kind === 'note') note();
  else if (data.kind === 'messages') {
    content.append(el('h2', /notification/.test(data.key) ? '通知' : photos ? '站内信' : '私信', 'page-title')); ctx.mountInbox(content);
  } else if (data.kind === 'profile') {
    const profile = el('section', '', 'social-profile');
    profile.append(avatar(data.avatar, data.author, data.authorUrl));
    const bio = el('div'); bio.append(el('h2', data.title || data.author || '个人主页'));
    if (data.text) bio.append(el('p', data.text, 'body')); ctx.mountActions(bio, ['follow']); profile.append(bio); content.append(profile);
    ctx.mountActions(content, ['tab']);
    content.append(el('h2', photos ? '照片与文字' : timeline ? '发表的动态' : '作品', 'page-title')); index();
  } else if (data.kind === 'list') {
    if (query) ctx.mountActions(content, ['filter-open', 'filter']);
    content.append(el('h2', /\/(livelist|red_video)/.test(new URL(data.key).pathname) ? data.title : query ? `搜索：${query}` : photos ? '大家的照片' : timeline ? '首页动态' : '首页', 'page-title')); index();
  } else content.append(el('p', '当前页面暂无可显示内容。'));
  const footer = el('footer', '', 'social-footer'); footer.append(ctx.footer); parent.append(footer);
  return { appendEntries, updateDiscussion, updateLive };
}
