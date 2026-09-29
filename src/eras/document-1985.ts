import { periodPixelFontFamily } from '../typography/period-fonts';

// Text menus inside a VT220-inspired monitor. The case and attached notes
// share one stable layout; the actual keyboard remains the input device.
export const document1985 = `
:host{all:initial;position:fixed;inset:0;z-index:2147483645;display:block;color-scheme:dark;background:#292c28;color:#9ee79e;--case-width:min(1080px,calc(100vw - 456px),calc((100vh - 208px) * 4 / 3 + 112px));--terminal-pixel:clamp(14px,calc((var(--case-width) - 160px) / 40),23px)}
*{box-sizing:border-box;animation:none!important;transition:none!important;scroll-behavior:auto!important}
[hidden]{display:none!important}
.terminal-scene{position:absolute;inset:0;overflow:auto;min-width:0;padding:24px 336px 24px 120px;font:400 var(--terminal-pixel)/1.25 ${periodPixelFontFamily};background:radial-gradient(ellipse at 45% 35%,#43463d,#282b26 78%);color:#a4daa0;isolation:isolate}
.terminal-hardware{position:relative;width:var(--case-width);min-width:520px;margin:0 auto;padding-bottom:16px}
.terminal-case{position:relative;width:100%;padding:36px 38px 44px;border:5px solid;border-color:#dedacc #858679 #63695e #bcbcac;border-radius:12px 14px 23px 23px;background:linear-gradient(100deg,#c5c3b3,#bcbba9 65%,#a5a794);box-shadow:inset 0 2px 1px #e8e4d5,inset -7px -6px 0 #939687,8px 14px 20px #13181190,1px 1px 0 #171d17}
.terminal-case-top{position:absolute;top:13px;left:54px;right:54px;height:7px;border-radius:2px;background:repeating-linear-gradient(90deg,#767a6b 0 3px,#b3b49f 3px 7px);box-shadow:0 1px 0 #e1ddc6;opacity:.65}
.crt-display{padding:11px;border-radius:32px;background:#454b3d;border:2px solid;border-color:#777d6d #d0cfb6 #e1dfc4 #7c806b;box-shadow:inset 7px 9px 9px #141d13,inset -5px -5px 5px #5c6451}
.crt-glass{position:relative;width:100%;aspect-ratio:4/3;border-radius:23px;overflow:hidden;background:#080d08;box-shadow:inset 0 0 20px #020802,0 1px 1px #171e14}
.crt-glass::before,.crt-glass::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:inherit}
.crt-glass::before{background:radial-gradient(ellipse at 28% 6%,#d7ffdb12,transparent 48%),linear-gradient(120deg,#ffffff04,transparent 45%);box-shadow:inset 0 0 16px 8px #0006,inset 1px 1px 2px #cedcbd22}
.crt-glass::after{background:repeating-linear-gradient(0deg,transparent 0 2px,#00000015 2px 3px);opacity:.6}
.terminal-case-edge{position:absolute;left:48px;right:44px;bottom:12px;display:flex;align-items:center;justify-content:space-between;color:#454d40;font:10px/1.2 Arial,sans-serif;letter-spacing:1px}.terminal-nameplate{border:1px solid #8f9483;padding:5px 8px;background:#a6aa97;box-shadow:inset 1px 1px 1px #767e6c,0 1px 0 #dfdeca}
.terminal-power{display:flex;align-items:center;gap:8px}.terminal-power::before{content:"";width:5px;height:5px;border:1px solid #526e31;border-radius:1px;background:#a5ca70;box-shadow:0 0 3px #a6cf6455}
.terminal-side-controls{position:absolute;right:2px;top:38%;display:grid;gap:18px}.terminal-side-controls span{width:6px;height:29px;border-radius:2px;background:repeating-linear-gradient(0deg,#464d40 0 2px,#818974 2px 4px);box-shadow:inset 1px 0 1px #1b2116}
.terminal-monitor-base{width:55%;height:20px;margin:0 auto;background:linear-gradient(#686f60,#a4a892 60%,#676f5f);clip-path:polygon(7% 0,93% 0,100% 90%,0 90%);box-shadow:0 4px 6px #141814}
.terminal-notes{position:absolute;left:-104px;top:54px;width:136px;display:grid;gap:25px;color:#3b372d;font:12px/1.65 "Songti SC",SimSun,serif;z-index:4}
.terminal-note{position:relative;background:linear-gradient(120deg,#e9dfac,#d7c996);padding:16px 9px 12px;box-shadow:2px 3px 4px #10150e60,0 1px 0 #efe7bf;transform:rotate(-3deg)}
.terminal-note:nth-child(2){transform:rotate(2deg);background:linear-gradient(120deg,#e5dfbd,#d2c9a3)}.terminal-note:nth-child(3){transform:rotate(-1deg);background:linear-gradient(140deg,#dedfc1,#c9cfab)}
.terminal-note::before{content:"";position:absolute;width:58px;height:19px;right:-11px;top:-8px;background:#ded7b38c;border:1px solid #eee9c037;transform:rotate(7deg);box-shadow:0 1px 1px #78714c22}
.terminal-note h2{font:inherit;font-weight:600;margin:0 0 6px;padding-bottom:4px;border-bottom:1px solid #988d5a55}.terminal-note p{white-space:pre-wrap;margin:0}
main{position:absolute;inset:0 0 calc(2.5em + 26px);overflow:auto;overscroll-behavior:contain;padding:20px 24px;font:400 var(--terminal-pixel)/1.25 ${periodPixelFontFamily};text-align:left;background:#080d08;color:#9ee79e;overflow-anchor:none;text-shadow:0 0 2px #91dc8526;scrollbar-color:#344c31 #0b160b;scrollbar-width:thin}
.document{width:100%;margin:0;font-weight:400}
.terminal-screen{min-height:0}.terminal-heading{white-space:pre;font:inherit;margin:0 0 .25em;overflow:hidden}.terminal-count{margin:0 0 .5em}
h1,h2,h3,h4{font:inherit;font-weight:400;margin:1em 0 .5em}h1{margin:0}p{margin:.5em 0}strong{font-weight:400}
a,a:link,a:visited,a:hover,a:active{color:inherit;text-decoration:none;cursor:pointer}
a:hover,button:hover{color:#080d08;background:#9ee79e}a[aria-disabled=true],button:disabled{color:#537753;cursor:default;background:transparent}
button,input,textarea,select{font:inherit;font-weight:400;border-radius:0;background:transparent;color:inherit}
button{border:0;padding:0;cursor:pointer;text-align:left}input,textarea{border:0;border-bottom:1px solid currentColor;padding:0 2px;outline:none}
textarea{border:1px solid #537753;width:100%;max-width:100%;min-height:5em;resize:vertical}input[type=search]{appearance:none;width:36ch;max-width:60%;background:transparent}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:1px dashed currentColor;outline-offset:2px}
nav{margin:.5em 0;display:flex;flex-wrap:wrap;gap:.25em 2ch}nav a,nav button{white-space:nowrap}nav a[data-nav=messages]{min-width:12ch}
.terminal-directory{list-style:none;padding:0;margin:.5em 0}.terminal-entry{margin:0;display:grid;grid-template-columns:4ch minmax(0,1fr) 20ch;gap:1ch}
.terminal-number{white-space:pre}.terminal-entry-meta{grid-column:3;grid-row:1;white-space:nowrap;color:#76b776}
.terminal-entry>[data-entry],.terminal-entry-meta{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.terminal-record-header{margin:0 0 1em}.terminal-record-header p{margin:0;overflow-wrap:anywhere}
.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:1em 0}.terminal-replies{list-style:none;padding:0;margin:1em 0}.terminal-replies li{border-top:1px dashed #537753;padding:1em 0 .5em}
.terminal-command{position:absolute;left:24px;right:24px;bottom:calc(1.25em + 14px);z-index:2;display:flex;align-items:baseline;gap:2ch;border-top:1px solid #537753;margin:0;padding-top:4px;background:#080d08}.terminal-command label{display:flex;flex:1;min-width:0;gap:1ch;align-items:baseline;white-space:nowrap}
.terminal-command input{flex:1;min-width:0;width:0;border:0;caret-color:#9ee79e}.terminal-command button{flex:none;white-space:nowrap;margin:0;color:#73976f;font-size:.75em}
.terminal-help{margin:0}.terminal-help dl{display:grid;grid-template-columns:12ch minmax(0,1fr);gap:.3em 1ch;margin:.5em 0}.terminal-help dt,.terminal-help dd{margin:0}.terminal-help p{color:#82b47d}.terminal-command-status{position:absolute;left:24px;right:24px;bottom:10px;z-index:2;min-height:1.25em;margin:0;background:#080d08}
.terminal-files{list-style:none;margin:1em 0;padding:0}.terminal-files li{margin:.4em 0}.paging{display:flex;align-items:center;gap:2ch;flex-wrap:wrap;margin:.5em 0;min-height:1.25em}.status{min-height:1.25em;margin:.25em 0}.status:empty{display:none}.terminal-screen h2{margin:.25em 0}
form[role=search]{margin:1em 0}form[role=search] button{margin-left:2ch}
input[type=search]::-webkit-search-cancel-button,input[type=search]::-webkit-search-decoration{display:none}
footer,.terminal-footer{border-top:1px solid #537753;padding-top:.5em;margin-top:1em}
[data-inbox] ol{padding-left:4ch}[data-mail-item]{margin-bottom:1em}[data-mail-item] .body{margin:.25em 0}[data-mail-item] p{margin:.25em 0}
.terminal-mail-heading,.terminal-mail-row{display:grid;grid-template-columns:3ch 18ch minmax(0,1fr);gap:1ch;align-items:start}.terminal-mail-heading{margin:1em 0;border-bottom:1px dashed #537753;padding-bottom:.25em}
[data-inbox] .terminal-mail-directory{list-style:none;padding:0;margin:0}.terminal-mail-row{margin:0 0 .4em}.terminal-mail-row button{overflow:hidden;white-space:nowrap;text-overflow:clip}.terminal-mail-number{white-space:pre}
[data-mail-item] .terminal-mail-preview{overflow:hidden;white-space:nowrap;text-overflow:clip;margin:0}.terminal-letter{margin:1em 0}.terminal-letter>.body{border-top:1px dashed #537753;padding-top:1em}
.terminal-letter>p{overflow-wrap:anywhere}
[data-inbox] table{width:100%;border-collapse:collapse}[data-inbox] th,[data-inbox] td{font:inherit;text-align:left;vertical-align:top;padding:.25em 1ch;border-bottom:1px dashed #537753}
.terminal-category{display:inline-flex;align-items:baseline;gap:1ch;white-space:nowrap}
hr{border:0;border-top:1px solid #537753;margin:1em 0}
@media(prefers-reduced-motion:reduce){.crt-glass::after{opacity:.3}}
@media(max-width:1100px){.terminal-entry{grid-template-columns:4ch minmax(0,1fr) 12ch}}
`;
