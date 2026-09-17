# APK 长期存图：存储方案对照

现在主页树、主题、背景图、自定义图标都写在 WebView 的 `localStorage` 里。导入导出已经走原生文件，所以「文件能选进来」和「选进来之后还能存住」不是同一件事。

| 指标 | 值 |
|---|---|
| 当前能长期留下的上限 | 5–10 MB |
| 原生文件 / SQLite 上限 | 机身空间 |
| 推荐方案工期 | 2–4 天 |
| 并行改 APK 对打包 HTML | 不影响 |

## 瓶颈不在导入，在写回

一张裁切后的背景 JPEG（1280px、质量 0.5）大约 100–300 KB。识别出来的图标 data URL 通常 5–30 KB。几十张图标加上两张背景，很容易顶满 `localStorage`。APK 现在能把 20 MB 的 ZIP 选进来，但 JSON 里的 data URL 再 `setItem` 时照样会 `QuotaExceeded`。

## 现在实际走哪

### 日常数据

- 键：`webManagerDataProMax`、`webManagerThemeConfig`，外加十几个开关。
- 位置：应用私有 WebView 目录，大约 `/data/data/com.webmanager.app/app_webview/`
- 卸载 App 会清掉。和浏览器打开 HTML 是同一套 JS，所以配额也差不多。

### 导入导出文件

- 写出：`Android/data/com.webmanager.app/files/Download/`，再弹系统分享。
- 读入：系统文件选择器 + FileReader / JSZip，已经比浏览器松。
- 这一层已经按 256 KB 分块，不再受 JS 桥大约 1 MB 的限制。

## 四种改法

| 方案 | 长期上限 | 改多久 | HTML 打包 | 适不适合存很多图 |
|---|---|---|---|---|
| 现状：WebView localStorage | 约 5–10 MB | 0 | 已共用，HTML 不变 | 不够 |
| WebView IndexedDB | 约 50–200+ MB | 1–2 天 | 可并行，HTML 仍走 localStorage | 够用一阵 |
| 原生 JSON + 图片文件 | 机身剩余空间 | 2–4 天 | 可并行，HTML 不变 | 适合 |
| SQLite 整库 | 机身剩余空间 | 4–7 天 | 可并行，但桥更复杂 | 能，但偏重 |

### 上限怎么理解

这些不是 Android 写死的常数，是 WebView / 系统在这台机上的常见表现。机身 64 GB 和 256 GB 差很多；低存储时系统还会杀后台、清缓存。

| 存储 | 硬限制 | 实用上限 | 一张背景大概占 |
|---|---|---|---|
| localStorage | Chromium 源配额，常见 5 或 10 MB | 大约 5–8 MB 有效 JSON | 1 张就可能吃掉几分之一配额 |
| IndexedDB | 同源磁盘配额，常见远大于 10 MB | 按 50–200 MB 估较稳，再往上看机身 | 可存几十到几百张，图仍以 Base64 偏胖 |
| 应用私有文件 | 机身剩余空间 | 数 GB，受用户清数据 / 卸载影响 | 二进制文件，比 data URL 小约 33% |
| SQLite BLOB | 机身剩余空间 | 数 GB，但库会膨胀、难备份增量 | 能存，但不适合当图床 |

## 各方案利弊

### 继续 localStorage（不推荐再挖）

**好处**

零改动。HTML 和 APK 行为完全一致。同步读写，现有 `save()` 一行就能用。

**坏处**

存不了很多图。主题背景和批量图标会顶配额。用户感觉是「导入成功了，重启又没了」或保存时报存储不足。

### IndexedDB（过渡可以）

只改 JS，APK 不必加新原生 API。

**好处**

工期最短。WebView 已开 DomStorage / Database。`save()` 改成异步适配层即可。HTML 继续 localStorage，APK 检测到 Android 或配额需求再走 IDB。

**坏处**

图仍是 data URL 字符串，体积比文件大约 33%。`file://` 源上 IDB 行为不如 https 稳。清 App 缓存有时会误伤。调试比文件目录难。

适合：先把配额从 10 MB 抬到几十上百 MB，验证「能存很多图标」再决定要不要上原生。

### 原生 JSON + 独立图片文件（推荐）

树和主题配置写成 `files/app-data.json`，背景和图标写成 `files/media/bg-day.jpg`、`files/media/icon-xxx.png`。JS 里只存路径或 id，显示时用 `file://` 或桥返回的 data/内容 URI。

**好处**

上限基本等于手机剩余空间。导入大包时图直接落盘，不必再塞进 JSON。备份可按文件增量。崩溃时 JSON 和图片可分开修。和现有 `saveFile` 分块桥同一套路。

**坏处**

`save()` 必须改异步。要做一次 localStorage 迁移。WebView 读私有文件要想好路径（content URI 或桥转 Base64 缩略图）。卸载仍会清空，除非再做导出到公共目录。

HTML 打包：默认分支仍 localStorage。只有 `window.Android` 存在时走文件桥。离线 HTML 不需要新 API，也不依赖 SQLite。

### SQLite（能做，但重）

**好处**

查询、分页、按主页增量写更干净。树很大时不必每次整包 stringify。事务和损坏恢复比纯 JSON 强。

**坏处**

要把树模型拆表或整段 JSON 当一列（后者几乎没赢过文件）。图放 BLOB 会让库膨胀、VACUUM 慢。工期大约是文件方案的两倍。HTML 更不能共用这套。

## 改多久（按一个人连续做估）

| 阶段 | IndexedDB | 原生文件 | SQLite |
|---|---|---|---|
| 适配层：读/写/迁移旧 localStorage | 0.5 天 | 1 天 | 1.5 天 |
| 图片从 data URL 拆出去 | 0.5 天 | 1 天 | 1.5 天 |
| 导入导出对接新存储 | 0.5 天 | 0.5–1 天 | 1 天 |
| 启动异步化、失败回退、测试 | 0.5 天 | 1 天 | 1.5–2 天 |
| 合计 | 1–2 天 | 2–4 天 | 4–7 天 |

原生文件若只先迁主题背景、图标仍留在 JSON 里，大约 1 天就能先缓解「两张背景把配额打满」。完整「很多图」要把 `customIcon` 也拆文件。

## 并行会不会影响打包 HTML

可以并行，HTML 继续 localStorage。打包脚本读的是同一份 `index.html` / `main.js` / `ui.js`，但存储可以做成适配器：没有 Android 桥就走同步 localStorage，有桥才走文件或 IDB。`npm run build` 打出来的单文件 HTML 不需要原生层，行为与现在一致。

### 必须守住的边界

- `save()`、`init()` 在网页路径保持同步，或网页也接受 async 但内部仍写 localStorage。
- 不要把 Android 专用方法写进无桥回退。
- e2e / vitest 继续测 localStorage；另加 APK 桥测。

### 会碰到的耦合

- `init()` 现在假定 localStorage 立刻有值。APK 改文件后启动要先 await 原生读，页面揭示时机要延后。这只影响 APK 壳，不改变 HTML 文件内容逻辑。
- 导出 JSON 仍应内嵌图片或附带 zip 内文件，这样 HTML 用户导入 APK 导出的包也不会缺图。

## 建议

要「能长期存很多图」：APK 走原生 JSON + 图片文件。IndexedDB 只适合当过渡。SQLite 等树大到整包 JSON 成为性能问题再考虑。HTML 保持现状，两边导入导出格式继续兼容。

- APK：文件
- 过渡：IndexedDB
- HTML：localStorage 不动

来源：当前 `main.js` 的 localStorage 读写、`ui.js` 分块导出、`MainActivity` 应用私有 Download 目录。上限为 Android WebView / 机身存储的常见范围，不是系统保证的固定配额。
