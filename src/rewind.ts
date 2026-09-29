import { socialFonts } from './typography/social-fonts';
import { mountPeriodFont } from './typography/period-fonts';
import { createHistoricalReader } from './historical-reader';
import { eras, eraLabels, type Era } from './eras';
import { createEraLogo } from './presentation/era-logo';

export type { Era } from './eras';
export interface RewindOptions {
  initial: Era;
  resolveAssetURL?(path: string): string;
  open?: boolean;
  save(era: Era): void;
  onPanelChange?(open: boolean): void;
}

export function mountRewind(doc: Document, options: RewindOptions) {
  const font = mountPeriodFont(doc, options.resolveAssetURL);
  const host = doc.createElement('rednote-rewind-control');
  host.style.cssText = 'all:initial!important;position:fixed!important;right:calc(20px - (100vw - 100%))!important;bottom:20px!important;z-index:2147483647!important;visibility:visible!important;';
  const panel = host.attachShadow({ mode: 'open' });
  // All eras use the same geometry. Surface and control styling alone change.
  panel.innerHTML = `<style>
    :host{all:initial;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}
    section,.open{font:14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#292929}
    section{width:304px;max-width:calc(100vw - 40px);height:236px;padding:16px;border:2px solid #d6d6d6;border-radius:12px;background:#fafafa;box-shadow:0 6px 24px #0002}
    header{height:32px;display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;padding:0 6px}
    strong{font-size:14px;line-height:20px}button{font:inherit;cursor:pointer;color:inherit}
    button:focus-visible,input:focus-visible{outline:2px solid #555;outline-offset:3px}
    .close{width:48px;height:32px;padding:0;border:1px solid #bbb;border-radius:5px;background:#eee}
    output{display:block;height:44px;font:32px/44px Georgia,"Times New Roman",serif;font-variant-numeric:tabular-nums}
    .era-heading{display:flex;align-items:center;gap:8px;height:44px}
    p{height:24px;margin:0 0 10px;font-size:12px;line-height:24px;white-space:nowrap}
    /* Seven label centers share the thumb's travel range, inset by half a cell. */
    .era-track{padding-inline:calc(7.142857% - 9px)}
    input{display:block;appearance:none;width:100%;height:24px;margin:0;padding:0;border:0;background:transparent;cursor:pointer}
    input::-webkit-slider-runnable-track{height:6px;background:#ddd;border:1px solid #bbb;border-radius:4px}
    input::-webkit-slider-thumb{box-sizing:border-box;appearance:none;width:18px;height:22px;margin-top:-9px;background:#555;border:2px solid #333;border-radius:8px}
    input::-moz-range-track{height:4px;background:#ddd;border:1px solid #bbb;border-radius:4px}
    input::-moz-range-thumb{box-sizing:border-box;width:18px;height:22px;background:#555;border:2px solid #333;border-radius:8px}
    .speed{float:right;font-size:11px;padding:0 6px;min-height:24px;line-height:20px;border:1px solid #bbb;background:transparent;border-radius:2px}.speed[aria-pressed=true]{font-weight:bold}
    .ends{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));height:32px;margin-top:4px}
    .ends button{height:32px;min-width:0;font-size:11px;padding:0;text-align:center;white-space:nowrap;background:transparent;border:1px solid transparent}
    .open{height:40px;padding:4px 12px;border:2px solid #ccc;border-radius:8px;background:#fafafa}
    section[data-era="1995"],.open[data-era="1995"]{font-family:"Times New Roman","Songti SC",SimSun,serif;background:#c0c0c0;border-color:#fff #555 #555 #fff;border-radius:0;box-shadow:2px 2px #222;color:#000}
    section[data-era="1995"] header{background:#000080;color:#fff}
    section[data-era="1995"] button{background:#c0c0c0;color:#000;border:1px solid;border-color:#fff #555 #555 #fff;border-radius:0}
    section[data-era="1995"] button:active{border-color:#555 #fff #fff #555}
    section[data-era="1995"] input::-webkit-slider-runnable-track{background:#999;border-color:#555 #fff #fff #555;border-radius:0}
    section[data-era="1995"] input::-webkit-slider-thumb{background:#c0c0c0;border:2px solid;border-color:#fff #555 #555 #fff;border-radius:0}
    section[data-era="1995"] input::-moz-range-track{background:#999;border-color:#555 #fff #fff #555;border-radius:0}
    section[data-era="1995"] input::-moz-range-thumb{background:#c0c0c0;border-color:#fff #555 #555 #fff;border-radius:0}
    section[data-era="1985"],.open[data-era="1985"]{font-family:"Fusion Pixel 12px Monospaced SC",monospace;font-size:12px;background:#182019;border-color:#465443;border-radius:0;box-shadow:0 3px 12px #0002;color:#a6bda0}
    section[data-era="1985"] header{background:transparent;color:#a6bda0;border-bottom:1px solid #465443}
    section[data-era="1985"] output{font-family:"Fusion Pixel 12px Monospaced SC",monospace;font-size:36px}
    section[data-era="1985"] strong{font-weight:400}
    section[data-era="1985"] strong,section[data-era="1985"] button{font-size:12px}
    section[data-era="1985"] button{background:transparent;color:#a6bda0;border:1px solid #465443;border-radius:0}
    section[data-era="1985"] input::-webkit-slider-runnable-track{height:6px;background:#081309;border:1px solid #92c38a;border-radius:0}
    section[data-era="1985"] input::-webkit-slider-thumb{background:#92c38a;border:2px solid #92c38a;border-radius:0}
    section[data-era="1985"] input::-moz-range-track{background:#081309;border:1px solid #92c38a;border-radius:0}
    section[data-era="1985"] input::-moz-range-thumb{background:#92c38a;border:2px solid #92c38a;border-radius:0}
    section[data-era="2000"],.open[data-era="2000"]{font-family:SimSun,"Songti SC",serif;background:#fff6df;border-color:#a3906d;border-radius:0;box-shadow:2px 2px #a3906d;color:#222}
    section[data-era="2000"] header{background:#333366;color:#fff}
    section[data-era="2000"] button{background:#eee6d2;color:#000;border:1px solid;border-color:#fff #8d8067 #8d8067 #fff;border-radius:0}
    section[data-era="2000"] button:active{border-color:#8d8067 #fff #fff #8d8067}
    section[data-era="2000"] input::-webkit-slider-runnable-track{background:#e6d3a1;border-color:#8d8067 #fff #fff #8d8067;border-radius:0}
    section[data-era="2000"] input::-webkit-slider-thumb{background:#eee6d2;border:2px solid;border-color:#fff #8d8067 #8d8067 #fff;border-radius:0}
    section[data-era="2000"] input::-moz-range-track{background:#e6d3a1;border-color:#8d8067 #fff #fff #8d8067;border-radius:0}
    section[data-era="2000"] input::-moz-range-thumb{background:#eee6d2;border-color:#fff #8d8067 #8d8067 #fff;border-radius:0}
    section[data-era="2005"],.open[data-era="2005"]{font-family:${socialFonts['2005']};background:#fff;border:2px solid #bbb;border-radius:4px;color:#333;box-shadow:1px 2px 5px #0002}
    section[data-era="2005"] header{border-bottom:2px solid #0063dc;color:#0063dc}section[data-era="2005"] button{border-radius:3px}section[data-era="2005"] input::-webkit-slider-thumb{background:#0063dc;border-color:#0054bd;border-radius:3px}section[data-era="2005"] input::-moz-range-thumb{background:#0063dc;border-color:#0054bd;border-radius:3px}
    section[data-era="2010"],.open[data-era="2010"]{font-family:${socialFonts['2010']};background:linear-gradient(#fff,#e4f1f7);border-color:#91b8cb;border-radius:6px;box-shadow:0 3px 9px #2344;color:#31566c}section[data-era="2010"] header{background:linear-gradient(#555,#222);color:#fff;border-radius:3px}section[data-era="2010"] button{color:#31566c;background:linear-gradient(#fff,#ddd);border-color:#aaa;border-radius:4px}section[data-era="2010"] input::-webkit-slider-thumb{background:linear-gradient(#fff,#bbb);border-color:#777;border-radius:4px}section[data-era="2010"] input::-moz-range-thumb{background:linear-gradient(#fff,#bbb);border-color:#777;border-radius:4px}
    section[data-era="2015"],.open[data-era="2015"]{font-family:${socialFonts['2015']};background:#fff;border-color:#ddd;border-radius:3px;box-shadow:0 2px 8px #0001;color:#444}section[data-era="2015"] header{border-bottom:1px solid #eee}section[data-era="2015"] button{background:#fff;border-radius:3px}section[data-era="2015"] input::-webkit-slider-thumb{background:#5083a5;border-color:#5083a5;border-radius:50%}section[data-era="2015"] input::-moz-range-thumb{background:#5083a5;border-color:#5083a5;border-radius:50%}
  </style>
  <button class="open" hidden aria-label="打开网页年代设置">网页年代 <span>1995</span></button>
  <section hidden aria-label="网页年代设置"><header><strong>网页年代</strong><button class="close" aria-label="收起年代设置">收起</button></header>
  <div class="era-heading"><output for="era">now</output></div><p><span id="description">当前网页样式</span><button class="speed" aria-pressed="false" title="为之后读取的图片模拟网络等待">慢速读图</button></p>
  <div class="era-track"><input id="era" type="range" min="0" max="${eras.length - 1}" step="1" value="${eras.length - 1}" aria-label="网页年代" aria-describedby="description"></div>
  <div class="ends">${eras.map(value => `<button data-value="${value}">${value}</button>`).join('')}</div></section>`;
  const section = panel.querySelector('section')!;
  const open = panel.querySelector<HTMLButtonElement>('.open')!;
  const slider = panel.querySelector<HTMLInputElement>('input')!;
  const attribute = 'data-rednote-rewind-era';
  const reading = createHistoricalReader(doc, options.resolveAssetURL);
  const previousAttribute = doc.documentElement.getAttribute(attribute);
  let era: Era = 'now';
  let disposed = false;
  let focusBeforePanel: HTMLElement | null = null;
  const restore = () => {
    if (previousAttribute === null) doc.documentElement.removeAttribute(attribute);
    else doc.documentElement.setAttribute(attribute, previousAttribute);
    reading.disable();
  };
  function setEra(next: Era, persist = true) {
    if (disposed) return;
    era = next;
    if (era !== 'now') {
      doc.documentElement.setAttribute(attribute, era);
      reading.enable(era);
    } else restore();
    section.dataset.era = era; open.dataset.era = era;
    slider.value = String(eras.indexOf(era));
    slider.setAttribute('aria-valuetext', eraLabels[era]);
    panel.querySelector('output')!.textContent = era;
    const heading = panel.querySelector('.era-heading')!;
    heading.querySelector('.era-logo')?.remove();
    const logo = createEraLogo(doc, era, 'panel', options.resolveAssetURL);
    if (logo) heading.prepend(logo);
    open.querySelector('span')!.textContent = era;
    panel.querySelector('#description')!.textContent = era === 'now' ? '当前网页样式' : `${eraLabels[era]}${era === '1985' ? '电子布告栏' : era === '2000' ? '门户' : era === '2005' ? '照片社区' : era === '2010' ? '动态' : era === '2015' ? '照片' : '文档'}浏览`;
    open.hidden = !section.hidden || era === 'now';
    panel.querySelector<HTMLButtonElement>('.speed')!.hidden = era === 'now' || era === '1985';
    reading.setPanelOpen(!section.hidden);
    if (persist) options.save(era);
  }
  function togglePanel() {
    if (section.hidden) {
      const focused = doc.activeElement;
      focusBeforePanel = focused instanceof doc.defaultView!.HTMLElement && focused !== host ? focused : null;
    }
    section.hidden = !section.hidden;
    reading.setPanelOpen(!section.hidden);
    open.hidden = !section.hidden || era === 'now';
    if (!section.hidden) slider.focus({ preventScroll: true });
    else if (era === '1985') reading.focusCommand();
    else if (!open.hidden) open.focus({ preventScroll: true });
    else if (focusBeforePanel?.isConnected) focusBeforePanel.focus({ preventScroll: true });
    else {
      // Closing the panel in "now" leaves no launcher. Return focus to the
      // source document instead of leaving it on a hidden control.
      const hadTabIndex = doc.body.hasAttribute('tabindex');
      const previousTabIndex = doc.body.getAttribute('tabindex');
      doc.body.setAttribute('tabindex', '-1'); doc.body.focus({ preventScroll: true });
      if (hadTabIndex) doc.body.setAttribute('tabindex', previousTabIndex!);
      else doc.body.removeAttribute('tabindex');
    }
    options.onPanelChange?.(!section.hidden);
  }
  const speed = panel.querySelector<HTMLButtonElement>('.speed')!;
  speed.addEventListener('click', () => {
    const slow = speed.getAttribute('aria-pressed') !== 'true';
    speed.setAttribute('aria-pressed', String(slow)); reading.setSlowImages(slow);
  });
  panel.querySelector('.close')!.addEventListener('click', togglePanel);
  open.addEventListener('click', togglePanel);
  slider.addEventListener('input', () => setEra(eras[Number(slider.value)] ?? 'now'));
  panel.querySelectorAll<HTMLButtonElement>('[data-value]').forEach(button => {
    button.addEventListener('click', () => setEra(button.dataset.value as Era));
  });
  // Keep keyboard shortcuts from triggering the underlying site's actions.
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if ((event as KeyboardEvent).key === 'Escape' && !section.hidden) togglePanel();
  });
  panel.addEventListener('click', event => event.stopPropagation());
  doc.body.append(host);
  setEra(options.initial, false);
  if (options.open) togglePanel();
  return {
    togglePanel, setEra,
    destroy() { disposed = true; restore(); reading.destroy(); host.remove(); font.destroy(); },
  };
}
