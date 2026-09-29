## rednote rewind

把小红书网页版带回不同年代的互联网。支持 1985、1995、2000、2005、2010、2015 六种界面，选择 now 返回原站。

从终端布告栏、早期网页和门户，到照片社区与动态流，每个年代都有自己的排版、字体和阅读方式。

这是独立的非官方项目，与小红书及相关品牌无关联或背书。

## 安装

从 [Releases](https://github.com/DongYu-hao/rednote-rewind/releases/latest) 下载对应浏览器的 ZIP 文件。请选择名称包含 `chrome` 或 `firefox` 的安装包，GitHub 自动提供的 Source code 是源码。

### Chrome

1. 下载并解压 `rednote-rewind-0.1.0-chrome.zip`。
2. 打开 `chrome://extensions`，开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的解压目录。

安装后请保留该目录，浏览器会继续从中读取扩展文件。

### Firefox

1. 下载 `rednote-rewind-0.1.0-firefox.zip`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击“临时载入附加组件”，选择下载的 ZIP 文件。

Firefox 包尚未经过 Mozilla 签名，仅支持上述临时加载方式，重启浏览器后需要重新加载。不能通过普通安装流程永久安装。

## 使用

打开小红书网页版并刷新页面，点击浏览器工具栏中的扩展图标，在右下角的小窗口选择年代。也可以使用 `Alt + Shift + Y` 打开设置。选择 now 恢复原站显示。

1985 使用终端命令阅读，输入本页序号后按回车打开内容，`N` 和 `P` 翻页，`B` 返回。其余年代可直接使用页面控件。

评论、私信、点赞和关注会通过原站控件执行真实操作。网页结构变化可能影响部分功能，遇到问题可切回 now。

## 隐私

扩展在浏览器中读取当前页面内容，用于本地呈现，不向项目作者上传页面内容、私信或登录凭据。持久保存的设置只有所选年代和小窗口开关；图片加载及用户主动执行的操作仍由小红书处理。

发布包不包含开发时的网页抓取、账号资料、截图或缓存。像素字体使用 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)，相关许可证随字体保留在 `src/assets/fonts/`。

## 开发

需要 Node.js 22.13 或更新版本，以及 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Firefox 开发使用 `pnpm dev:firefox`。开发环境的扩展目录分别是 `.output/chrome-mv3` 和 `.output/firefox-mv3`，需要按上面的方式手动加载。

```sh
pnpm check
pnpm test
pnpm zip
pnpm zip:firefox
```

安装包输出到 `.output/`。依赖本地私有网页样本的测试在样本缺失时自动跳过。
