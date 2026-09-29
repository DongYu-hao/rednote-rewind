import './style.css';
import { browser } from 'wxt/browser';

async function openControl() {
  const status = document.querySelector('#status')!;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://www.xiaohongshu.com/')) {
      status.textContent = '请在小红书网页中使用。发布平台不做转换。';
      return;
    }
    await browser.tabs.sendMessage(tab.id, { type: 'rewind:toggle' });
    window.close();
  } catch {
    status.textContent = '请刷新小红书页面，再点击插件图标打开控制面板。';
  }
}
void openControl();
