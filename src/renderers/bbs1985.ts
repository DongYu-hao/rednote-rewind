import type { PeriodPageContext } from './types';

const commandHistories = new WeakMap<ShadowRoot, { entries: string[]; index: number; draft: string }>();

const keyboardListeners = new WeakMap<HTMLElement, {
  key: (event: KeyboardEvent) => void;
  pointer: (event: PointerEvent) => void;
}>();

/** A complete, separate screen model: directory, article, replies, and files. */
export function renderBBS1985(parent: HTMLElement, ctx: PeriodPageContext): void {
  const { doc, data } = ctx;
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
    const node = doc.createElement(tag); node.textContent = ctx.text(text); return node;
  }
  const main = parent.closest('main');
  const shadow = parent.getRootNode() as ShadowRoot;
  // The same main remains the scroller on every screen and era. The chassis
  // lives beside it in the shadow root, so a long letter cannot stretch a CRT.
  let scene = shadow.querySelector<HTMLElement>('[data-crt-scene]');
  if (!scene && main) {
    scene = el('div'); scene.className = 'terminal-scene'; scene.dataset.crtScene = '';
    const hardware = el('section'); hardware.className = 'terminal-hardware'; hardware.setAttribute('aria-label', '一九八五年视频终端');
    const chassis = el('div'); chassis.className = 'terminal-case';
    const top = el('div'); top.className = 'terminal-case-top'; top.setAttribute('aria-hidden', 'true');
    const display = el('div'); display.className = 'crt-display';
    const glass = el('div'); glass.className = 'crt-glass terminal-glass'; display.append(glass);
    const edge = el('div'); edge.className = 'terminal-case-edge';
    const plate = el('span', 'VIDEO TERMINAL'); plate.className = 'terminal-nameplate';
    const power = el('span', 'POWER OK'); power.className = 'terminal-power'; power.setAttribute('aria-hidden', 'true');
    edge.append(plate, power);
    const controls = el('div'); controls.className = 'terminal-side-controls'; controls.setAttribute('aria-hidden', 'true');
    controls.append(el('span'), el('span'));
    chassis.append(top, display, edge, controls);
    const stand = el('div'); stand.className = 'terminal-monitor-base'; stand.setAttribute('aria-hidden', 'true');
    hardware.append(chassis, stand);
    const notes = el('aside'); notes.className = 'terminal-notes'; notes.setAttribute('aria-label', '终端使用说明');
    [
      ['阅读', '输入序号后按回车。\nN 下一页　P 上一页\nB 返回　? 命令表'],
      ['检索', '输入 S，空一格，\n再输入检索词。\nM 返回文章目录'],
      ['信件', 'I 信箱　T 通知\nR 答复　W 发稿\nO 重新读取'],
    ].forEach(([title, text]) => { const note = el('section'); note.className = 'terminal-note'; note.append(el('h2', title), el('p', text)); notes.append(note); });
    hardware.append(notes); scene.append(hardware); shadow.append(scene); glass.append(main);
  } else if (scene && main) scene.querySelector('.crt-glass')?.append(main);
  // Keep the native route/count nodes available to the adapter, while the
  // visible terminal uses its command prompt rather than a webpage menu bar.
  const hiddenTools = el('div'); hiddenTools.hidden = true; hiddenTools.dataset.terminalTools = '';
  for (const tools of [ctx.navigation, ctx.footer]) {
    tools.querySelectorAll('[data-action="now"],[data-action="source-now"],[data-action="video-now"]').forEach(node => node.remove());
    hiddenTools.append(tools);
  }
  const header = el('header');
  const heading = el('pre', '小红书  电子布告栏\n------------------------------------------------------------');
  heading.className = 'terminal-heading'; header.append(heading);
  const count = el('p', data.unread ? `信箱 (${data.unread})` : '信箱'); count.className = 'terminal-count'; count.dataset.nav = 'messages'; count.dataset.terminalLabel = '信箱'; header.append(count);
  parent.append(header, hiddenTools, ctx.status);
  const screen = el('section'); screen.className = 'terminal-screen'; parent.append(screen);
  const search = ctx.searchForm; search.hidden = true; parent.append(search);
  const help = el('section'); help.className = 'terminal-help'; help.hidden = true;
  help.setAttribute('aria-label', '命令表');
  help.append(el('h2', '命令表'), el('p', '输入命令后按回车。输入序号，阅读本页条目。'));
  const commands = el('dl');
  for (const [code, description] of [
    ['M', '文章目录'], ['S 检索词', 'S 后空一格，再输入检索词'],
    ['N / P', '目录换页；正文向后或向前翻屏'], ['R', '阅读答复；再次输入可撰写'],
    ['B', '返回前页'], ['A', '查看本文作者'], ['F', '文件目录'],
    ['I / T', '信箱／通知目录'], ['C 序号', '选择通知分类'], ['V', '查看信件相关页面'],
    ['W', '打开官方发稿窗口'], ['O', '重新读取'], ['?', '打开或关闭命令表'],
  ]) commands.append(el('dt', code), el('dd', description));
  help.append(commands, el('p', 'Page Up、Page Down 翻屏。上下方向键查阅已用命令。'), el('p', '输入 B 返回原处。')); parent.append(help);
  let helpScroll = 0;
  function closeHelp() {
    if (help.hidden) return;
    help.hidden = true; screen.hidden = false;
    if (main) main.scrollTop = helpScroll;
  }
  function toggleHelp() {
    if (!help.hidden) { closeHelp(); return; }
    helpScroll = main?.scrollTop ?? 0;
    screen.hidden = true; search.hidden = true; help.hidden = false;
    if (main) main.scrollTop = 0;
  }
  function turnScreen(direction: number) {
    if (!main) return;
    const previous = main.scrollTop;
    const maximum = Math.max(0, main.scrollHeight - main.clientHeight);
    main.scrollTop = Math.min(maximum, Math.max(0, previous + direction * Math.max(1, main.clientHeight - 36)));
    localStatus.textContent = main.scrollTop === previous ? (direction > 0 ? '已到末尾。' : '已到开头。') : '';
  }
  const localStatus = el('p'); localStatus.className = 'terminal-command-status';
  localStatus.setAttribute('role', 'status'); localStatus.setAttribute('aria-live', 'polite');
  let filesOpen = false;
  let fileScroll = 0;
  function openFiles() {
    if (!filesOpen) fileScroll = main?.scrollTop ?? 0;
    filesOpen = true; draw();
    if (main) main.scrollTop = 0;
  }
  function closeFiles() {
    filesOpen = false; draw();
    // Restore only after the original body or replies recreate their height.
    if (main) main.scrollTop = fileScroll;
  }

  function metadata(author: string, authorUrl: string, date: string, title = '') {
    const head = el('div'); head.className = 'terminal-record-header';
    if (author) { const line = el('p', '作者：'); line.append(authorUrl ? ctx.link(ctx.text(author), authorUrl) : el('span', author)); head.append(line); }
    if (date) head.append(el('p', `日期：${date}`));
    if (title) head.append(el('p', `主题：${title}`));
    return head;
  }
  function entryDirectory() {
    screen.append(el('h2', data.kind === 'profile' ? '作者文章' : data.title || '文章目录'));
    const list = el('ol'); list.className = 'terminal-directory';
    ctx.entries.forEach((item, index) => {
      const row = el('li'); row.className = 'terminal-entry';
      row.append(el('span', `${String(index + 1).padStart(2, ' ')}. `)); row.firstElementChild!.className = 'terminal-number';
      const title = item.url ? ctx.link(ctx.text(item.title || '无题'), item.url) : el('span', item.title || '无题');
      title.dataset.entry = item.id; row.append(title);
      if (item.author || item.date) {
        const meta = el('span', item.author || item.date); meta.className = 'terminal-entry-meta'; row.append(meta);
      }
      list.append(row);
    });
    screen.append(list);
    if (!ctx.entries.length) screen.append(el('p', data.empty ? '没有相关记录。' : '正在等候文章目录。'));
    ctx.pagination(screen);
    screen.append(el('p', '输入本页序号，按回车阅读。'));
  }
  function fileDirectory() {
    screen.append(el('h2', '文件目录'));
    const files = el('ol'); files.className = 'terminal-files';
    data.images.forEach((_, index) => files.append(el('li', `${index + 1}. 附图文件`)));
    if (data.video) files.append(el('li', `${data.images.length + 1}. 影片文件`));
    screen.append(files, el('p', '终端不显示图像与影片。'));
    if (data.images.length || data.video) screen.append(el('p', '如需查看，请使用年代控件选择其他界面。'));
    else screen.append(el('p', '当前文章没有附件记录。'));
    screen.append(ctx.action(ctx.discussionOpen ? 'B 返回答复区' : 'B 返回正文', 'article', closeFiles));
  }
  function draw() {
    screen.replaceChildren(); localStatus.textContent = '';
    if (filesOpen && data.kind === 'note') { fileDirectory(); return; }
    if (data.kind === 'list') entryDirectory();
    else if (data.kind === 'profile') {
      screen.append(el('h2', '用户资料'), metadata(data.author || data.title, '', ''));
      if (data.text) { const bio = el('div', data.text); bio.className = 'body'; screen.append(bio); }
      entryDirectory();
    } else if (data.kind === 'note' && ctx.discussionOpen) {
      const discussion = el('section'); discussion.dataset.discussion = '';
      discussion.append(el('h2', '答复区'), el('p', `主题：${data.title || '无题'}`), ctx.action('B 返回正文', 'article', ctx.closeDiscussion));
      const replies = el('ol'); replies.className = 'terminal-replies';
      for (const item of ctx.comments) {
        const row = el('li'); row.dataset.comment = item.id; row.append(metadata(item.author, item.authorUrl, item.date));
        const body = el('div', item.text); body.className = 'body'; row.append(body); replies.append(row);
      }
      discussion.append(replies);
      if (!ctx.comments.length) discussion.append(el('p', '目前没有读到答复。'));
      ctx.pagination(discussion, true); ctx.mountCompose(discussion); screen.append(discussion);
    } else if (data.kind === 'note') {
      screen.append(metadata(data.author, data.authorUrl, data.date, data.title || '无题'));
      const body = el('div', data.text); body.className = 'body'; screen.append(body);
      screen.append(ctx.action('R 答复', 'comments', ctx.showDiscussion));
      if (data.images.length || data.video) screen.append(el('p'), ctx.action(`F 文件目录 (${data.images.length + (data.video ? 1 : 0)})`, 'files', openFiles));
    } else if (data.kind === 'messages') {
      screen.append(el('h2', data.title || '信箱')); ctx.mountInbox(screen);
    } else {
      screen.append(el('h2', '当前记录'), el('p', '此记录暂不能在终端内阅读。请使用年代控件选择其他界面。'));
    }
  }

  const command = el('form'); command.className = 'terminal-command'; command.setAttribute('aria-label', '终端命令');
  const label = el('label', '命令 >'); const input = el('input'); input.type = 'text'; input.name = 'command'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('aria-label', '终端命令或本页序号'); label.append(input);
  const enter = el('button', '回车'); enter.type = 'submit'; enter.setAttribute('aria-label', '执行命令'); command.append(label, enter);
  function invoke(selector: string) {
    const target = screen.querySelector<HTMLElement>(selector);
    if (!target || (target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') { localStatus.textContent = '此命令当前不可用。'; return; }
    target.click();
  }
  function execute(raw: string) {
    const value = raw.trim(); if (!value) return;
    const code = value.toUpperCase(); localStatus.textContent = '';
    if (code === '?') { toggleHelp(); return; }
    if (!help.hidden && code === 'B') { closeHelp(); return; }
    if (!help.hidden && (code === 'N' || code === 'P')) { turnScreen(code === 'N' ? 1 : -1); return; }
    closeHelp();
    if (/^\d+$/.test(value)) {
      const ordinal = Number(value);
      const entries = [...screen.querySelectorAll<HTMLElement>('[data-entry]')];
      const target = entries[ordinal - 1];
      const letters = [...screen.querySelectorAll<HTMLElement>('[data-mail-item] [data-mail-action="open"]')];
      if (target?.tagName === 'A') target.click();
      else if (!entries.length && letters[ordinal - 1]) letters[ordinal - 1]!.click();
      else localStatus.textContent = '请输入本页已有且可以阅读的选择序号。';
    } else if (code === 'M') ctx.link('文章目录', '/explore').click();
    else if (/^S(?:\s|$)/.test(code)) {
      const keyword = value.slice(1).trim();
      if (keyword) ctx.search(keyword);
      else { input.value = 'S '; localStatus.textContent = '请在 S 后空一格，输入检索词。'; input.focus({ preventScroll: true }); }
    } else if (code === 'N' || code === 'P') {
      if (filesOpen || (data.kind === 'note' && !ctx.discussionOpen) || screen.querySelector('.terminal-letter')) {
        turnScreen(code === 'N' ? 1 : -1); return;
      }
      const direction = code === 'N' ? 'next' : 'previous';
      const prefix = data.kind === 'note' && ctx.discussionOpen ? 'comments-' : '';
      invoke(`[data-action="${prefix}${direction}"],[data-mail-action="${direction}"]`);
    } else if (code === 'R') {
      if (data.kind !== 'note') localStatus.textContent = '请先选择一篇文章。';
      else if (!ctx.discussionOpen) ctx.showDiscussion();
      else screen.querySelector<HTMLElement>('textarea,input')?.focus();
    } else if (code === 'B') {
      if (filesOpen) closeFiles();
      else if (data.kind === 'note' && ctx.discussionOpen) ctx.closeDiscussion();
      else {
        const mailboxBack = screen.querySelector<HTMLElement>('[data-mail-action="letter-back"]') ?? screen.querySelector<HTMLElement>('[data-mail-action="back"]');
        const back = mailboxBack ?? ctx.navigation.querySelector<HTMLElement>('[data-action="back"]');
        if (back) back.click(); else localStatus.textContent = '目前没有可返回的记录。';
      }
    } else if (code === 'F') {
      if (data.kind === 'note') openFiles();
      else localStatus.textContent = '请先选择一篇文章。';
    } else if (code === 'A') {
      if (data.kind === 'note' && data.authorUrl) ctx.link(data.author || '作者', data.authorUrl).click();
      else localStatus.textContent = '当前没有可查阅的作者资料。';
    } else if (/^C(?:\s|$)/.test(code)) {
      const categories = [...screen.querySelectorAll<HTMLElement>('[data-mail-action="category"]')];
      const number = Number(value.slice(1).trim()); const category = categories[number - 1];
      if (Number.isInteger(number) && category) category.click();
      else localStatus.textContent = '请在 C 后空一格，输入通知分类序号。';
    } else if (code === 'V') {
      const related = screen.querySelector<HTMLElement>('[data-mail-target]');
      if (related) related.click(); else localStatus.textContent = '当前信件没有相关页面。';
    } else if (code === 'I') ctx.link('信箱', '/chat').click();
    else if (code === 'T') ctx.link('通知目录', '/notification').click();
    else if (code === 'W') {
      doc.defaultView?.open('https://creator.xiaohongshu.com/', '_blank', 'noopener,noreferrer');
      localStatus.textContent = '发稿请在站方窗口办理。';
    } else if (code === 'O') ctx.footer.querySelector<HTMLElement>('[data-action="refresh"]')?.click();
    else localStatus.textContent = '未知命令。输入 ? 查看帮助。';
  }
  // History is local to this document and survives ordinary screen changes.
  let history = commandHistories.get(shadow);
  if (!history) { history = { entries: [], index: 0, draft: '' }; commandHistories.set(shadow, history); }
  const previousCommands = history;
  command.addEventListener('submit', event => {
    event.preventDefault(); const value = input.value; input.value = '';
    if (value.trim() && previousCommands.entries.at(-1) !== value) {
      previousCommands.entries.push(value); if (previousCommands.entries.length > 20) previousCommands.entries.shift();
    }
    previousCommands.index = previousCommands.entries.length; previousCommands.draft = ''; execute(value);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault(); turnScreen(event.key === 'PageDown' ? 1 : -1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (previousCommands.index === previousCommands.entries.length) previousCommands.draft = input.value;
      previousCommands.index = Math.max(0, Math.min(previousCommands.entries.length, previousCommands.index + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = previousCommands.entries[previousCommands.index] ?? previousCommands.draft;
    }
  });
  const glass = scene?.querySelector<HTMLElement>('.crt-glass');
  if (glass) {
    glass.querySelectorAll(':scope > .terminal-command,:scope > .terminal-command-status').forEach(node => node.remove());
    glass.append(command, localStatus);
  } else parent.append(command, localStatus);
  draw();
  const typingTarget = (target: Element | null | undefined) => Boolean(target?.closest('input,textarea,select,button,[contenteditable="true"],[contenteditable=""],[role="slider"]'));
  function focusedControl() {
    let focused = doc.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    return focused;
  }
  const eraPanelFocused = doc.activeElement?.tagName === 'REDNOTE-REWIND-CONTROL';
  if (!eraPanelFocused && !typingTarget(focusedControl())) input.focus({ preventScroll: true });
  if (main) {
    const previous = keyboardListeners.get(main);
    if (previous) { main.removeEventListener('keydown', previous.key); main.removeEventListener('pointerdown', previous.pointer); }
    const onKey = (event: KeyboardEvent) => {
      if (!parent.isConnected || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const origin = event.composedPath()[0] as Element | undefined;
      if (typingTarget(origin) || typingTarget(focusedControl())) return;
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault(); turnScreen(event.key === 'PageDown' ? 1 : -1);
      } else if (event.key.length === 1) {
        event.preventDefault(); input.focus({ preventScroll: true }); input.value += event.key;
      } else if (event.key === 'Enter') {
        event.preventDefault(); const value = input.value; input.value = ''; input.focus({ preventScroll: true }); execute(value);
      } else if (event.key === 'Backspace') {
        event.preventDefault(); input.value = input.value.slice(0, -1); input.focus({ preventScroll: true });
      }
    };
    const onPointer = (event: PointerEvent) => {
      const origin = event.composedPath()[0] as Element | undefined;
      if (parent.isConnected && !origin?.closest?.('a,input,textarea,select,button,[contenteditable="true"],[role="slider"]')) input.focus({ preventScroll: true });
    };
    keyboardListeners.set(main, { key: onKey, pointer: onPointer }); main.addEventListener('keydown', onKey); main.addEventListener('pointerdown', onPointer);
  }
}
