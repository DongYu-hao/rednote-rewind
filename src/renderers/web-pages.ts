import type { PeriodPageContext } from './types';
import type { Entry } from '../adapters/xiaohongshu';

/** Independent early-Web and portal documents; data and source actions stay shared. */
export function renderWebPage(parent: HTMLElement, ctx: PeriodPageContext) {
  const { doc, data } = ctx;
  const portal = ctx.era === '2000';
  const home = data.kind === 'list' && !/\/search_result/.test(data.key);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, value = '') => {
    const result = doc.createElement(tag); result.textContent = ctx.text(value); return result;
  };
  const route = (label: string, url: string) => ctx.link(ctx.text(label), url);
  const byline = (target: HTMLElement, author: string, url: string, date: string) => {
    const line = node('p'); line.className = 'byline';
    if (author) line.append(doc.createTextNode('作者：'), url ? route(author, url) : node('span', author));
    if (date) line.append(node('span', date));
    if (author || date) target.append(line);
  };
  const heading = (target: HTMLElement, label: string) => target.append(node('h2', label));
  function creator(target: HTMLElement, label: string) {
    const a = node('a', label); a.href = 'https://creator.xiaohongshu.com/';
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.creator = '';
    target.append(a);
  }
  function channel(target: HTMLElement, item: NonNullable<typeof data.channels>[number]) {
    const button = ctx.action(ctx.text(item.label), 'channel', () => ctx.selectChannel(item.id, item.label));
    button.dataset.channel = item.id; button.disabled = item.active; target.append(button);
  }
  function index(target: HTMLElement) {
    if (portal) {
      const table = node('table'); table.className = 'topic-table'; table.setAttribute('aria-label', '文章目录');
      const dated = ctx.entries.some(item => item.date);
      const widths = dated ? [60, 25, 15] : [70, 30];
      const group = node('colgroup');
      widths.forEach(width => { const col = node('col'); col.style.width = `${width}%`; group.append(col); });
      const head = node('thead'); const titles = node('tr');
      ['题目', '作者', ...(dated ? ['日期'] : [])].forEach(label => { const th = node('th', label); th.scope = 'col'; titles.append(th); });
      head.append(titles); const body = node('tbody');
      ctx.entries.forEach(item => {
        const row = node('tr'); const titleCell = node('td');
        const title = item.url ? route(item.title || '无题', item.url) : node('span', item.title || '无题');
        title.dataset.entry = item.id; titleCell.append(title);
        const author = node('td'); author.append(item.authorUrl ? route(item.author || '作者资料', item.authorUrl) : node('span', item.author));
        row.append(titleCell, author); if (dated) row.append(node('td', item.date)); body.append(row);
      });
      table.append(group, head, body); target.append(table);
    } else {
      const list = node('ul'); list.className = 'web-index';
      ctx.entries.forEach(item => {
        const row = node('li'); const title = item.url ? route(item.title || '无题', item.url) : node('span', item.title || '无题');
        title.dataset.entry = item.id; row.append(title); byline(row, item.author, item.authorUrl, item.date); list.append(row);
      }); target.append(list);
    }
    if (!ctx.entries.length) target.append(node('p', data.empty ? '没有找到相关条目。' : '尚未取得目录。请稍候重新读取；若需登录或验证，请在年代窗口选择 now。'));
    ctx.pagination(target);
  }
  function discussion(target: HTMLElement) {
    const section = node('section'); section.dataset.discussion = ''; section.className = portal ? 'portal-opinions' : 'guestbook';
    heading(section, portal ? '网友意见' : '留言簿');
    if (ctx.discussionOpen) {
      ctx.comments.forEach(item => {
        const article = node('article'); article.dataset.comment = item.id;
        article.className = portal ? 'opinion' : 'guestbook-entry';
        byline(article, item.author, item.authorUrl, item.date);
        const content = node('p', item.text); content.className = 'body'; article.append(content); section.append(article);
      });
      if (!ctx.comments.length) section.append(node('p', '当前文档尚未读取到留言。'));
      ctx.pagination(section, true);
    } else section.append(ctx.action(portal ? '阅读网友意见' : '阅读留言', 'comments', ctx.showDiscussion));
    ctx.mountCompose(section); target.append(section);
  }
  function note(target: HTMLElement) {
    const article = node('article'); article.className = portal ? 'portal-article' : 'web-article';
    const title = node('h2', data.title || '无题'); title.className = 'article-title'; article.append(title);
    byline(article, data.author, data.authorUrl, data.date);
    const body = node('div', data.text); body.className = 'body'; article.append(body);
    if (data.images.length) {
      const pictures = node('section'); pictures.dataset.pictures = ''; pictures.className = 'article-pictures';
      if (portal || ctx.picturesOpen) data.images.forEach((picture, i) => ctx.mountImage(pictures, picture, `附图 ${i + 1}`, portal ? 480 : 240, i));
      if (!portal) {
        const show = ctx.action(`查看附图 (${data.images.length})`, 'images', ctx.showPictures);
        show.disabled = ctx.picturesOpen; article.append(show);
      }
      article.append(pictures);
    }
    if (data.video) {
      if (portal) ctx.mountVideo(article);
      else {
        const film = node('section'); film.className = 'film-reference';
        film.append(node('h3', '影片文档'), node('p', '本条目附有影片。请在年代窗口选择 now，使用原站播放器查看。'));
        article.append(film);
      }
    }
    target.append(article); discussion(target);
  }
  function profile(target: HTMLElement) {
    const member = node('section'); member.className = portal ? 'portal-profile' : 'personal-home';
    heading(member, data.title || '个人主页');
    if (portal && data.avatar) ctx.mountImage(member, data.avatar, '个人照片', 64);
    if (data.author && data.author !== data.title) member.append(node('p', data.author));
    if (data.text) { const body = node('p', data.text); body.className = 'body'; member.append(body); }
    target.append(member); heading(target, portal ? '发表文章' : '发表文稿'); index(target);
  }
  function guide(target: HTMLElement) {
    const entries = ctx.entries.filter((item): item is Entry & { thumbnail: NonNullable<Entry['thumbnail']> } => Boolean(item.thumbnail)).slice(0, 3);
    if (!entries.length) return;
    const section = node('section'); section.className = 'picture-guide'; heading(section, '图文导读');
    const strip = node('div'); strip.className = 'guide-strip';
    entries.forEach((item, i) => {
      const itemBox = node('div'); itemBox.className = 'guide-item'; ctx.mountImage(itemBox, item.thumbnail, '题图', 120, i);
      const caption = node('p'); caption.className = 'guide-caption'; caption.append(route(item.title || '无题', item.url)); itemBox.append(caption); strip.append(itemBox);
    }); section.append(strip); target.append(section);
  }

  const header = node('header'); header.className = portal ? 'portal-masthead' : 'web-welcome';
  const brand = node('h1', '小红书');
  if (!portal) {
    const banner = node('div'); banner.className = 'welcome-banner'; banner.setAttribute('aria-hidden', 'true');
    const logo = ctx.createLogo(); if (logo) banner.append(logo);
    creator(ctx.navigation, '投稿');
    header.append(banner, brand, node('p', '欢迎访问小红书'));
    header.append(ctx.navigation, node('hr'));
    if (home) {
      const directory = node('section'); directory.className = 'welcome-directory'; directory.setAttribute('aria-label', '站内服务索引');
      const group = (title: string, description: string, content: HTMLElement) => {
        const cell = node('div'); cell.append(node('h2', title), content, node('p', description)); directory.append(cell);
      };
      group('浏览文稿', '阅读本站已取得的文章和图片。', route('文稿索引', '/explore'));
      const query = node('div'); query.append(ctx.searchForm); group('查询资料', '填写关键词，查询站内文稿。', query);
      group('通信往来', '打开信箱，查阅通信记录。', route('我的信箱', '/chat'));
      const notice = node('div'); notice.append(route('通知目录', '/notification')); group('站内通知', '查阅与您有关的站内消息。', notice);
      const publishing = node('div'); creator(publishing, '投稿'); group('发表文稿', '前往官方创作平台。', publishing);
      const sections = node('div');
      if (data.channels?.length) data.channels.forEach(item => channel(sections, item));
      else sections.append(route('主页索引', '/explore'));
      group('分类索引', '按本站实际栏目浏览。', sections);
      header.append(directory, node('hr'));
    } else header.append(ctx.searchForm);
  } else {
    const identity = node('div'); identity.className = 'portal-identity';
    brand.className = 'era-brand';
    const logo = ctx.createLogo(); if (logo) brand.prepend(logo);
    identity.append(brand, node('span', '网络社区')); const publishing = node('div'); creator(publishing, '发稿'); identity.append(publishing);
    header.append(identity, ctx.navigation, ctx.searchForm);
    if (home && data.channels?.length) {
      const matrix = node('nav'); matrix.className = 'channel-matrix'; matrix.setAttribute('aria-label', '分类栏目');
      data.channels.forEach(item => channel(matrix, item)); header.append(matrix);
    }
  }
  parent.classList.add(portal ? 'portal-page' : 'web-page'); parent.append(header, ctx.status);
  let content = parent;
  if (portal && home) {
    const layout = node('div'); layout.className = 'portal-layout';
    const side = node('aside'); side.className = 'portal-side'; side.setAttribute('aria-label', '站内服务');
    heading(side, '站内服务');
    side.append(route('文章目录', '/explore'), route('站内信箱', '/chat'), route('通知目录', '/notification'));
    creator(side, '发稿');
    content = node('div'); content.className = 'portal-content'; layout.append(side, content); parent.append(layout); guide(content);
  }
  if (data.kind === 'list') { heading(content, data.title || (home ? '文稿目录' : '查询结果')); index(content); }
  else if (data.kind === 'note') note(content);
  else if (data.kind === 'profile') profile(content);
  else if (data.kind === 'messages') { heading(content, portal ? '站内通信' : '我的信箱'); ctx.mountInbox(content); }
  else if (data.kind === 'live') {
    heading(content, '现场直播');
    content.append(node('p', '此年代不提供直播阅读。可在网页年代设置中选择二〇一〇年或二〇一五年。'));
  } else {
    heading(content, data.title || '文档'); content.append(node('p', '本页内容尚未接入。请在年代窗口选择 now，使用原站功能。'));
  }
  const end = node('footer'); end.className = 'site-footer'; end.append(node('hr'), ctx.footer); parent.append(end);
}
