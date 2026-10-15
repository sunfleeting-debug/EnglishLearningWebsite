# 本地运行说明

项目位置：`C:\Users\靳中轩\Desktop\祥哥\EnglishLearningWebsite`。代码、浏览器测试环境和本地数据库均在此目录，D 盘临时项目已迁回并移除。

## 启动与停止

- 双击 `start-local.cmd`，自动启动服务并打开浏览器；重复启动会复用当前服务。
- 访问 http://127.0.0.1:5173/ 。请固定使用这个地址，学习进度按浏览器和来源保存。
- 双击 `stop-local.cmd`，停止本项目的本地服务。

前端为零构建静态站，不需要 npm install。Python 环境在 `tools/.cache/venv`，测试浏览器在 `tools/.cache/ms-playwright`。

## 本地账号与同步

本地启动器同时运行仓库自带的 Python 开发 API（`tools/mock_api.py`），地址 http://127.0.0.1:8791 。SQLite 数据库持久保存在 `tools/.cache/local.sqlite`，重启保留账号与同步进度。`admin@test.local` 是开发管理员邮箱，可自行注册并设置密码；未预设任何账号或密码。

本地默认连接开发 API；网站部署后的默认 Cloudflare 地址保持原值。若浏览器以前手动保存过后端地址，请在「账号」页改为本地 API 地址。开发 API 供本机调试，数据不会自动同步到线上 Cloudflare，也不支持跨设备云同步。

## 句子练习

访问 http://127.0.0.1:5173/#/sentences 。无需新增依赖，支持分级递进、整句翻译、听写、课程导入、收藏与错句复习。句子数据仅保存在浏览器，设置页的整站备份已包含句子；当前账号同步仍只覆盖单词。用法及核验见 `docs/sentence-practice.md`。

## 手机 App

PWA 验证地址是 http://127.0.0.1:5173/（真实手机安装请使用 HTTPS 部署地址）。Capacitor 工程在 `android/` 和 `ios/`，Android Debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。网页更新后执行 `npm run mobile:sync`；Android 用 Android Studio 打开工程，iOS 需要 macOS + Xcode。

## 已安装的测试环境

PowerShell 中运行：

```powershell
cd 'C:\Users\靳中轩\Desktop\祥哥\EnglishLearningWebsite'
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\tools\.cache\ms-playwright"
$env:PYTHONIOENCODING = 'utf-8'
$env:TEMP = "$PWD\tools\.cache\tmp"
$env:TMP = $env:TEMP
$env:APORT = '8793' # 避开已启动的本地开发 API
& .\tools\.cache\venv\Scripts\python.exe -u tools\verify_practice.py
& .\tools\.cache\venv\Scripts\python.exe -u tools\verify_backend.py
```

日志、数据库和安装环境均在 Git 忽略的 `tools/.cache/` 内。保留此目录可继续使用当前环境；删除前请备份 `local.sqlite` 中需要的开发数据。

## 本机验证记录

- 练习交互：92 项断言通过。
- 账号与同步：56 项断言通过，使用隔离的测试数据库。
- 页面综合检查：172 项中首次通过 171 项；唯一失败是 Windows 未配置 WebP MIME 类型，已在服务器中修复，并通过浏览器图片解码与相同断言的专项复验。
- 音频 Range、同一连接后续完整词典下载、本地 API 跨域连接、启动/停止及重复启动均已验证。

验证日志位于 `tools/.cache/verify-*.log`；WebP 修复后的专项脚本是 `tools/.cache/verify_local_setup.py`。测试运行在独立浏览器环境，不会改变日常浏览器中的学习进度。
