# 手机使用与发布计划

本项目保留零构建网页，同时提供两条手机路径：

1. **PWA（已实现）**：通过 HTTPS 打开网站后安装到 Android 主屏或 iOS 主屏。它复用现有页面和 `localStorage`，首屏静态资源离线可用；词典详情和大文件按需加载。
2. **Capacitor 原生包（已配置）**：将同一份网页复制到 `www/`，再生成 Android/iOS 工程。它适合发布 APK/AAB 和 App Store 包，需要 Android Studio/SDK；iOS 需要 macOS + Xcode。Windows 电脑可以准备和同步配置，但不能本机签名构建 iOS 包。

## 手机界面

手机底部保留：首页、词库、练习、句子练习、复习五个高频入口，其余页面放在「更多功能」抽屉。抽屉使用 44px 以上触控区域；底部和输入页面使用 `safe-area-inset-bottom`，避免 iPhone 手势区遮挡。桌面端仍显示完整侧边栏。

练习流程保持一致：课程选择 → 题面输入 → 检查 / 提示 / 朗读 → 反馈 → 下一题。输入法正在组字时 Enter 不提交；刷新、切换页面、手机后台都会先保留本地进度。云同步在有账号且联网时继续工作，断网时保留本机学习记录并在恢复后重试。

## PWA 安装

部署到 HTTPS（GitHub Pages 已满足）后：

- Android Chrome / Edge：打开网站，使用页面出现的「安装到手机」按钮，或浏览器菜单的安装选项。
- iPhone / iPad：用 Safari 打开，选择分享 → 添加到主屏幕。iOS 不保证显示 Chromium 的安装事件按钮。

首次访问会缓存应用壳、核心词库、句子课程、图标和阅读缩略图。版本更新由 Service Worker 检测，出现「有新版本，刷新」后再切换资源版本。MP3、PDF、大词典数据不会在首次安装时全部下载，避免手机初次打开下载过大；首次访问相应页面时会按需缓存可缓存的静态资源。音频 Range 请求交给服务器处理，未下载的音频离线时会回退系统语音或给出提示。

`file://` 双击入口仍可使用本地数据，但浏览器安全策略不允许它注册 Service Worker，也不能作为可安装 PWA。要测试离线安装，请使用 HTTPS 或 `localhost`。

## Capacitor 命令

仓库锁定 Capacitor 6.2.2（Node.js >=18），以匹配当前 Windows 的 JDK 17；Android Studio/SDK 和 Xcode 仍需按目标平台安装。仓库目前提供：

```powershell
npm install
npm run mobile:prepare
npx cap add android       # 首次生成 Android 工程
npx cap add ios           # 在 macOS + Xcode 环境执行
npm run mobile:sync      # 修改网页后重新复制并同步
npm run mobile:android   # 打开 Android Studio
npm run mobile:ios       # 打开 Xcode（macOS）
npm run mobile:run:android
```

`tools/copy-web-assets.mjs` 只复制网页运行需要的白名单目录，不把 `tools/`、`.git/` 和测试日志放进 App。`www/` 是每次同步重新生成的忽略目录；`android/` 和 `ios/` 原生工程已经生成并纳入仓库，后续应在目标环境签名并纳入发布流水线。原生工程默认不依赖 Service Worker，网页资源随 App 包提供；在线发音、云同步和在线词典仍需要网络。

## 发布前验收

- Android Chrome 安装、断网冷启动、句子练习和刷新续学。
- iOS Safari 添加到主屏、刘海/底部手势区、软键盘、文件导入和系统语音。
- Android/iOS Capacitor 工程强制退出、升级、返回手势、状态栏、MP3 播放/拖动和外部 PDF 链接。
- 导出 JSON 后清除站点数据，再导入恢复单词、句子课程、错句和当前设置。
- Service Worker 版本升级后旧缓存清理、无混用旧 JS；API、在线发音失败时不阻塞离线学习。
