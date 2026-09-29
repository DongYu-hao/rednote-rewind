// Netscape Welcome's 1995 document model, using an original welcome illustration.
export const document1995 = `
:host{all:initial;position:fixed;inset:0;z-index:2147483645;display:block;color-scheme:light;background:#c0c0c0;color:#000}
*{box-sizing:border-box;animation:none!important;transition:none!important;scroll-behavior:auto!important}
[hidden]{display:none!important}
main{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;padding:16px 24px 280px;font:16px/1.5 "Times New Roman","Songti SC",SimSun,serif;text-align:left;color:#000;background:#c0c0c0;overflow-anchor:none}
.document{width:800px;max-width:100%;margin:0 auto}
h1{font-size:34px;line-height:1.2;margin:10px 0 6px;color:#7b1515}h2{font-size:24px;margin:20px 0 10px}h3{font-size:18px;margin:16px 0 6px}
p{margin:9px 0}a,a:link{color:#0000ee;text-decoration:underline;cursor:pointer}a:visited{color:#551a8b}a:hover{color:#0000ee}a:active{color:#ee0000}
button,input,select,textarea{font:16px/1.35 "Times New Roman","Songti SC",SimSun,serif;color:#000;border-radius:0}
button,input[type=submit]{padding:2px 10px;background:#c0c0c0;border:2px outset #eee;cursor:pointer}button:active{border-style:inset}button:disabled{color:#555;cursor:default}
input[type=search],input[type=text],textarea{appearance:none;background:#fff;border:2px inset #eee;padding:3px 5px}input[type=search],input[type=text]{width:220px;max-width:55vw}textarea{display:block;width:100%;min-height:100px;resize:vertical}
form{margin:10px 0}form label{margin-right:7px}form button{margin-left:8px}form textarea+button{margin:8px 0}
nav{margin:12px 0;line-height:30px}nav a{display:inline-block;margin-right:22px}nav button{margin-right:10px}nav a[data-nav=messages]{min-width:94px}
hr{height:3px;border:0;border-top:1px solid #777;border-bottom:1px solid #eee;margin:18px 0}
.web-welcome{text-align:center}.welcome-banner{display:flex;justify-content:center;align-items:center;height:88px;margin:0 auto}
.web-welcome>p{font-size:18px;margin:6px 0 10px}.welcome-directory{display:grid;grid-template-columns:1fr 1fr;gap:0 32px;text-align:left;padding:0 18px}.welcome-directory>div{padding:0 0 12px}.welcome-directory h2{font-size:20px;line-height:1.3;margin:12px 0 6px}.welcome-directory p{font-size:14px;margin:5px 0}.welcome-directory [data-channel]{display:inline-block;border:0;padding:0;background:transparent;color:#0000ee;text-decoration:underline;margin:2px 12px 2px 0}.welcome-directory [data-channel]:disabled{color:#000;text-decoration:none}.welcome-directory form{text-align:left;margin:0}.welcome-directory form input{width:160px;max-width:100%}.welcome-directory form label{display:block}.welcome-directory form button{margin:4px 0 0}
.web-index{padding-left:26px;list-style:disc}.web-index li{padding-bottom:12px}.web-index .byline{margin:2px 0}.byline{font-size:14px}.byline>span{margin-left:18px}.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0}
.web-article{padding:4px 20px}.article-title{text-align:center;margin:20px 0 10px}.web-article>.byline{text-align:center}.article-pictures{margin:14px 0}.picture{width:fit-content;max-width:100%;margin:12px 0;padding:4px;border:1px solid #777}.picture figcaption{font-size:13px;margin:4px 0 0}.period-image-frame{overflow:hidden;background:#b4b4b4}.picture canvas,.picture img{display:block;max-width:100%;height:auto;image-rendering:pixelated}
.guestbook{margin:22px 0;border-top:3px double #777;padding:2px 20px 12px}.guestbook h2{text-align:center}.guestbook-entry{padding:12px 0;border-bottom:1px solid #888}.guestbook-entry .byline{margin:0}.guestbook-entry .body{margin:8px 0}.guestbook form{padding-top:12px}.personal-home{padding:8px 20px;text-align:center}.personal-home .body{text-align:left}.film-reference{padding:10px 0;border-top:1px solid #888}
.paging{min-height:30px;margin:18px 0}.paging button,.paging a{margin-right:14px}.status{min-height:24px;margin:8px 0}.site-footer{font-size:14px;text-align:center}.site-footer button,.site-footer a{margin:0 10px}
[data-inbox] ol{padding-left:28px}[data-mail-item]{padding:10px 0;border-bottom:1px solid #888}[data-mail-item] p{margin:4px 0}[data-inbox] nav{margin:8px 0}.mail-letter-list{background:#fff;border:1px solid #777;padding:10px 20px 10px 38px}.mail-letter-record{padding:12px 6px!important;border-bottom:1px solid #aaa}.mail-letter-record .body{font-size:16px;line-height:1.5;margin:10px 0}.period-compose{padding:12px 0}.period-compose label{display:block;margin:0 0 8px}.period-compose textarea{margin-top:6px}.period-compose button{margin:4px 0}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:1px dotted #000;outline-offset:3px}
@media(max-width:600px){main{padding:12px 14px 280px}.welcome-directory{gap:0 18px;padding:0}.web-article,.guestbook{padding-left:0;padding-right:0}.welcome-directory form input{width:100%}nav a{margin-right:12px}}
`;
