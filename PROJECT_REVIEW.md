# WF 截图查价（Windows 桌面版）项目评审报告

| 项目 | 内容 |
| --- | --- |
| 项目名称 | WF 截图查价（wfs-desktop） |
| 版本 | 0.1.0 |
| 形态 | Windows 便携版（Tauri 2 单文件 exe） |
| 评审日期 | 2026-10-23 |
| 评审范围 | `src/`（React/TS，22 个文件）、`src-tauri/src/`（Rust，6 个文件）、测试、构建配置与产物 |
| 总体结论 | 核心链路可用、安全边界清晰；存在 3 个应优先修复的并发/限流/去重缺陷，另有若干体验与工程化改进项 |

---

## 一、项目概览

用户粘贴 / 拖拽 / 选择一张 Warframe 截图后，应用调用第三方视觉模型识别出物品与裂罅，再查询 warframe.market 的实时行情，并以卡片形式展示价格。

项目完全独立：不依赖 QQ 机器人、Codex CLI 或 warframe-mcp，只依赖「OpenAI 兼容的视觉模型」与「warframe.market 公共只读接口」。

### 技术栈

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 桌面壳 | Tauri | 2.12.5 |
| 后端 | Rust | 1.99.1（MSVC） |
| 前端 | React + TypeScript | 19.3 / 5.9 |
| 构建 | Vite | 8.3.5 |
| 测试 | Vitest / cargo test | 5.0.5 |
| 平台 | Windows 11 + WebView2 | WebView2 155.0.4283.62 |

### 目录结构

```
wfs-desktop/
├─ src/                       前端（React + 领域逻辑）
│  ├─ App.tsx                 主流程与状态编排
│  ├─ types.ts                共享类型
│  ├─ components/             Header / DropZone / 卡片 / 设置 / 帕拉松选择器
│  └─ lib/
│     ├─ bridge.ts            Tauri IPC 唯一入口
│     ├─ catalog.ts           物品库拉取与缓存
│     ├─ match.ts             模糊匹配索引
│     ├─ normalize.ts         名称归一化 / bigram / 编辑距离
│     ├─ prices.ts            普通物品行情
│     ├─ auctions.ts          裂罅拍卖与三级降级
│     ├─ rivenVocabulary.ts   裂罅名词表反解
│     ├─ weapons.ts           武器名匹配（含单字纠错兜底）
│     ├─ parazon.ts           安魂 / 效价 / 其它帕拉松分组
│     ├─ rank.ts              MOD / 赋能等级规则
│     └─ settings.ts          设置默认值与合并
├─ src-tauri/
│  ├─ src/lib.rs              命令注册
│  ├─ src/vision.rs           视觉模型调用 + JSON 修复
│  ├─ src/market.rs           warframe.market 代理
│  ├─ src/secret.rs           Windows 凭据管理器
│  ├─ src/settings.rs         设置与便携数据目录
│  └─ tauri.conf.json         窗口 / 构建 / 图标配置
├─ tests/                     6 个 Vitest 测试文件
├─ testdata/                  真机回归用截图
└─ portable/                  便携版产物与 zip
```

### 运行时架构

```
┌──────────────────────────── WebView2（React 渲染进程） ────────────────────────────┐
│  DropZone / 粘贴 / 文件选择                                                          │
│        │                                                                            │
│        ├─ FileReader → dataURL ──► invoke("vision_read")                            │
│        ├─ 物品库 / 行情 ─────────► invoke("market_get")                              │
│        └─ 设置 ─────────────────► invoke("settings_*", "secret_*", "data_*")         │
│                                                                                      │
│  前端不持有 API Key；所有密钥读取与外部请求都在 Rust 侧完成                          │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ Tauri IPC
┌───────────────────────────────────────▼──────────────────────────────────────────────┐
│ Rust 主进程                                                                          │
│  vision_read    → OpenAI 兼容 /chat/completions（thinking 关闭、JSON 模式）           │
│  market_get     → https://api.warframe.market（UA 注入、429/5xx 退避）                │
│  secret_*       → Windows 凭据管理器（keyring，service=wfs-desktop）                  │
│  settings_*     → <exe>/data/settings.json（不可写时回退 %APPDATA%）                  │
│  data_*         → catalog.json 缓存读写 / 清除                                        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、功能清单

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 拖拽截图 | ✅ | HTML5 drop，仅接受图片 |
| 点击选择文件 | ✅ | `<input type="file">` |
| Ctrl+V 粘贴 | ✅ | 监听 `paste` 事件，取 clipboard image |
| 图片大小限制 | ✅ | 10MB，前端校验 |
| 视觉识别 | ✅ | 结构化 JSON：`family / items / rivens / notes` |
| 思考链关闭 | ✅ | `thinking:{type:"disabled"}`，实测把 10s+ 失败降到 1.7s |
| 截断 JSON 修复 | ✅ | 从最后一个 `}` 回退并补齐括号 |
| 普通物品查价 | ✅ | `/v2/orders/item/{slug}/top?rank=N` |
| MOD 默认 rank 0 | ✅ | 可在设置中修改 |
| 赋能默认满级 rank 5 | ✅ | 可在设置中修改，回落受 maxRank 限制 |
| 裂罅识名 | ✅ | 词表切分 + OCR 错字吸附 |
| 裂罅武器匹配 | ✅ | 中文/拉丁切片 + 字符级兜底候选 |
| 裂罅拍卖报价 | ✅ | exact / superset / all 三级降级 |
| 安魂 MOD 自动识别 | ✅ | 提示词 + 8 词固定词表，3×3 网格实测可列出 9 张 |
| 效价 / 1999 MOD | ✅ | 不猜测，39 个帕拉松候选手动点选 |
| 手动搜索物品 | ✅ | 模糊匹配，最多 6 条 |
| 设置页 | ✅ | 服务商、Key、超时、等级、UA、缓存 |
| API Key 安全存储 | ✅ | Windows 凭据管理器，前端不可读 |
| 服务商连接测试 | ✅ | 显示耗时与返回片段 |
| 物品库缓存 | ✅ | schema 版本 + 24h TTL + 网络失败回退 |
| 便携数据目录 | ✅ | exe 同级 `data/`，不可写回退 `%APPDATA%` |
| 便携版构建 | ✅ | `tauri build --no-bundle` → 单 exe |
| 查询历史 / 批量图片 | ❌ | v1 未做 |
| 自动更新 | ❌ | 便携版无安装器，按设计不做 |

---

## 三、API 清单

### 3.1 内部 Tauri 命令（Rust → 前端）

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `settings_load` | — | `Settings` | 读取设置，缺省返回默认值 |
| `settings_save` | `settings` | `void` | 写入 `data/settings.json` |
| `data_read` | `name` | `string \| null` | 读取缓存文件（仅允许安全文件名） |
| `data_write` | `name`, `content` | `void` | 写入缓存文件 |
| `data_clear` | `name` | `void` | 删除缓存文件 |
| `data_dir` | — | `string` | 返回实际数据目录 |
| `secret_status` | — | `boolean` | Key 是否已配置（不返回内容） |
| `secret_set` | `key` | `void` | 写入 Windows 凭据管理器 |
| `secret_clear` | — | `void` | 删除凭据 |
| `vision_read` | `imageBase64`, `mime`, `hint` | `VisionResult` | 调视觉模型并清洗 JSON |
| `provider_test` | — | `{ok, latencyMs, sample}` | 小请求测试服务商连通性 |
| `market_get` | `path` | `JSON` | 代理 warframe.market 请求 |

`VisionResult` 结构：

```json
{
  "family": "requiem | parazon | riven | normal | ''",
  "items": [{ "name": "分裂膛室", "count": 1, "confidence": "high" }],
  "rivens": [{ "weapon": "冰凇", "rivenName": "Plaga-visipha", "positiveTexts": [], "confidence": "high" }],
  "notes": "",
  "raw": "模型原始输出"
}
```

### 3.2 外部 API

| 服务 | 方法与路径 | 用途 | 鉴权 |
| --- | --- | --- | --- |
| 视觉模型（默认 DeepSeek） | `POST {baseUrl}/chat/completions` | 截图识别 / 连接测试 | Bearer API Key |
| warframe.market | `GET /v2/versions` | 物品库集合哈希 | 无（UA 必填） |
| warframe.market | `GET /v2/items` | 物品库（`Language: zh-hans`） | 无 |
| warframe.market | `GET /v2/riven/attributes` | 裂罅前缀/后缀词表 | 无 |
| warframe.market | `GET /v2/riven/weapons` | 可出裂罅的武器表 | 无 |
| warframe.market | `GET /v2/orders/item/{slug}/top?rank=N` | 普通物品在售/求购前 5 条 | 无 |
| warframe.market | `GET /v1/auctions/search?type=riven&weapon_url_name=...&sort_by=price_asc` | 裂罅拍卖（遗留接口） | 无 |
| warframe.market 静态资源 | `GET https://warframe.market/static/assets/...` | 物品缩略图（WebView 直接加载） | 无 |
| Windows | Credential Manager（keyring） | API Key 安全存储 | 当前 Windows 用户 |

视觉请求体要点：`model`、`messages`（system + image_url dataURL）、`max_tokens: 4000`、`thinking: disabled`、`response_format: json_object`；遇 400 会去掉后两项再重试一次，兼容不支持的 OpenAI 兼容服务。

---

## 四、参考资料来源

### 项目内来源

| 来源 | 用途 |
| --- | --- |
| `C:\Users\40899\Documents\ChatGPT\WFS` | 原始界面、卡片组件、模糊匹配、裂罅逻辑、图标匹配实验与已知限制 |
| `C:\Users\40899\Documents\ChatGPT\qq-bot` | 视觉识别提示词、thinking 关闭方案、等级规则、拍卖三级降级、市场代理与重试 |
| `WFS/README.md` | warframe.market v1/v2 接口坑位、top 5 语义、裂罅报价降级说明 |
| `WFS/src/lib/iconMatch.ts` | 图像相似度实验；本项目评审后确认命中率过低，未采用 |
| `WFS/testimage/` | 普通 MOD、安魂、效价、增幅器测试截图 |

### 外部资料

| 资料 | 链接 |
| --- | --- |
| warframe.market API 文档 | https://docs.warframe.market/docs/intro |
| warframe.market 站点 | https://warframe.market |
| Tauri 2 文档（命令 / 配置 / 权限） | https://v2.tauri.app/ |
| DeepSeek API 文档 | https://api-docs.deepseek.com/ |
| keyring crate | https://docs.rs/keyring |
| Rust 工具链 | https://rustup.rs |
| crates 镜像（构建环境使用） | https://rsproxy.cn |
| WebView2 | https://learn.microsoft.com/microsoft-edge/webview2/ |

---

## 五、实际完成内容与验证证据

### 5.1 代码规模

| 类别 | 数量 |
| --- | --- |
| 前端 TS/TSX 文件 | 22 |
| Rust 源文件 | 6 |
| Vitest 测试文件 | 6 |
| 前端测试用例 | 39 |
| Rust 单元测试 | 5（另有 2 个需密钥的真机测试） |

### 5.2 验证结果

| 验证项 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，无错误 |
| `npm test` | 6 个文件 / 39 个用例通过 |
| `cargo test` | 5 通过 / 2 忽略（真机） |
| 真机视觉（普通 MOD） | 识别成功，约 1.8 秒 |
| 真机视觉（安魂网格） | 返回 ≥8 张，用例通过 |
| 真机行情代理 | `/v2/versions` 拉取成功 |
| 便携 exe 启动 | 正常，自动创建 `data/` 并拉取物品库缓存 |
| API Key 落盘检查 | `settings.json` 仅含默认配置，无密钥 |
| 便携包 | `wfs-desktop.exe` 4.4MB + 使用说明，zip 2.09MB |

### 5.3 关键实现决策

1. **视觉前置**：Tauri/Codex 文本模型无法直接看图，因此所有识别都在 Rust 侧调用视觉模型。
2. **关闭思考链**：实测开启思考时 reasoning 会吃光 `max_tokens` 导致 `content` 为空（finish=length）；关闭后稳定 1.7–2.2 秒。
3. **JSON 修复**：模型输出被截断时，从最后一个 `}` 回退并补齐括号，避免「能识别的图变成没认出」。
4. **等级规则**：MOD 默认 rank 0、赋能默认满级，回复/卡片上始终标注 `rank N`；`/top` 不带 rank 时默认返回 0 级价。
5. **安魂自动 + 效价手动**：实测安魂词表可读；效价图标卡图像相似度 top-1 命中 0/8、正确项排名 18–33/39，因此不做猜测，改为 39 个候选手动点选。
6. **密钥隔离**：渲染进程只调用 `secret_status/set/clear`，任何命令都不回传明文 Key。

---

## 六、代码评审发现

### 6.1 主要优点

- 安全边界明确：Key 只存在于 Rust 侧与 Windows 凭据管理器，`settings.json`/日志/localStorage 均无密钥。
- 外部依赖克制：运行时只依赖视觉 API 与 warframe.market，无 Codex、无数据库、无额外服务。
- 领域逻辑测试覆盖较实：词表反解、三级降级、等级规则、帕拉松分组、JSON 修复均有单测。
- 容错设计到位：物品库 schema 版本、网络失败回退缓存、429/5xx 退避、JSON 截断修复。
- 构建产物小且可移植：单 exe 4.4MB，无需安装器。

### 6.2 缺陷清单

#### P1（建议下一版修复）

| # | 问题 | 位置 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | **识别请求没有取消/序号机制** | `src/App.tsx` `analyze()` | 连续快速粘贴两张图时，先发起的识别可能后返回，把旧结果写进新图片的界面；`busy` 状态也可能提前结束 | 引入 `requestIdRef`，每次识别自增并校验；过期结果直接丢弃 |
| 2 | **限流只覆盖部分请求** | `src/lib/prices.ts` vs `catalog.ts` / `auctions.ts` | 物品库加载一次并发 3 个请求，裂罅拍卖完全绕过 350ms 队列；批量查询可能触发 429 | 把节流下沉到 Rust（全局 Mutex + 时间戳或令牌桶），所有 `market_get` 统一排队 |
| 3 | **视觉结果未去重** | `src/App.tsx` 构建 `itemEntries` | 同一物品在截图中出现两次（如两张 Khra）会生成两张相同卡片并重复查询；手动添加路径有去重，识别路径没有 | 以 `item.id + rank` 为键去重，可选记录 `count` |

#### P2（体验/可靠性）

| # | 问题 | 位置 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 4 | **外部链接可能打不开** | `src/components/ItemCard.tsx` `<a target="_blank">` | Tauri 2 默认不保证把 `_blank` 交给系统浏览器，打包后「详情」可能无反应 | 引入 `tauri-plugin-opener` + capability，改为 `openUrl()` |
| 5 | **设置被写入两次** | `src/components/Settings.tsx` 与 `src/App.tsx` `onSaved` | 每次保存都写两遍 `settings.json`，产生无谓 I/O 与潜在竞态 | 只在 Settings 内保存一次，`onSaved` 仅更新内存状态 |
| 6 | **设置未加载时静默返回** | `src/App.tsx` `analyze()` 开头 `if (!current) return` | 极端情况下用户点识别没有任何反馈 | 显示错误提示并打开设置页 |
| 7 | **空结果一律弹帕拉松面板** | `src/App.tsx` 空结果分支 | 裂罅或暗图识别失败时也会弹 39 个 MOD，语义不符 | 仅 `family === parazon/requiem` 或 notes 命中「帕拉松」时自动弹；否则显示普通提示 + 手动按钮 |
| 8 | **首次保存 Key 后不重试当前截图** | `src/App.tsx` `handleFile()` | 首次使用要先粘贴、再配置、再粘贴一次 | 缓存待识别 dataURL，保存成功后自动继续 |
| 9 | **视觉请求无重试** | `src-tauri/src/vision.rs` | 瞬时 5xx/超时直接失败 | 对 5xx/超时做 1 次退避重试 |
| 10 | **物品库多一次版本请求** | `src/lib/catalog.ts` | 版本请求 + 3 个数据请求，首屏慢一点 | 合并流程或把版本缓存单独持久化 |

#### P3（工程化/细节）

| # | 问题 | 建议 |
| --- | --- | --- |
| 11 | `App.tsx` 433 行，状态与流程集中在单文件 | 拆成 `useCatalog` / `useVisionAnalysis` / `useSettings` 等 hooks |
| 12 | 无文件日志，错误只显示在界面 | Rust 侧用 `tracing` 写滚动日志到 `data/logs/` |
| 13 | 无组件/E2E 测试，无 ESLint / rustfmt / clippy / CI | 增加 Playwright for Tauri 或至少 React Testing Library；接入 lint 与 CI |
| 14 | 图标按钮只有 `title`，无 `aria-label` | 补充可访问性属性 |
| 15 | `count > 1` 不展示，重复卡去重后无数量信息 | ItemEntry 增加 `count`，卡片显示 ×N 与总价 |
| 16 | 裂罅候选为空时无法手动搜武器 | RivenCard 增加武器搜索框（复用 `weaponIndex.search`） |
| 17 | `baseUrl`/`model`/`userAgent` 无格式校验 | 保存前校验 URL 协议与必填项 |
| 18 | `secret_status` 吞掉凭据管理器异常 | 返回 `{configured,error}`，区分「未配置」与「读取失败」 |
| 19 | 缩略图直连远端，离线时无图标 | 可选：Rust 侧缓存 parazon/物品缩略图 |
| 20 | 截图会完整发送给第三方视觉服务 | 在设置页补充隐私说明，或提供"仅发送裁剪区域"选项 |

### 6.3 未覆盖的验证

- Tauri 窗口内的拖拽与 `Ctrl+V` 仅做了代码级确认，未做自动化 UI 测试。
- 外部链接在打包后的实际行为未自动化验证（见 P2-4）。
- 高并发（连续粘贴、批量手动添加）未做压力测试。
- 不同 OpenAI 兼容服务商（非 DeepSeek）未逐一回归，仅实现了 400 降级兼容。

---

## 七、可优化方向

### 短期（1–2 天）

1. 修复 P1-1/P1-2/P1-3：请求序号、统一限流、识别结果去重。
2. 接入 `tauri-plugin-opener`，修复详情链接。
3. 首启保存 Key 后自动重试当前截图。
4. 收紧帕拉松面板的自动弹出条件。

### 中期（1 周）

1. 增加 `data/logs/` 结构化日志与「导出诊断信息」按钮。
2. Vision 请求重试 + 超时分级提示。
3. 拆分 `App.tsx`，补组件测试与 Playwright E2E。
4. 物品卡显示数量/总价；裂罅支持手动搜武器。
5. 接入 ESLint、rustfmt、clippy 与 GitHub Actions。

### 长期

1. 查询历史与批量图片（本地保存结果，不上传）。
2. 可选的本地 OCR 兜底（离线/无 Key 场景），与视觉结果交叉校验。
3. 缩略图本地缓存与离线浏览。
4. 多语言（英文界面）。
5. 自动更新通道（如改为安装器形态）。

---

## 八、风险与合规

| 风险 | 说明 | 处置建议 |
| --- | --- | --- |
| 第三方视觉服务隐私 | 截图会完整发送给配置的服务商 | 设置页明示；敏感内容先裁剪 |
| API Key 泄露 | 历史配置过程中曾出现明文密钥 | 在服务商后台轮换 Key，并在设置页重新填写 |
| warframe.market 限流 | 公开限流 3 次/秒 | 统一 Rust 侧节流（当前只有部分请求受限） |
| 遗留接口失效 | `/v1/auctions/search` 官方声明不再支持 | 失败时明确提示；预留切换到新接口的抽象层 |
| 识别误判 | 安魂相似字形、效价图标卡无法读名 | 安魂允许删卡补选；效价强制手动选择，不自动报价 |
| 便携目录权限 | exe 放在只读目录时无法写 `data/` | 已实现回退 `%APPDATA%\wfs-desktop` |

---

## 九、附录

### 运行与构建

```powershell
cd C:\Users\40899\Documents\ChatGPT\wfs-desktop
npm install
npm run desktop:dev        # 开发模式
npm test                   # 前端单测
npm run typecheck
cd src-tauri; cargo test   # Rust 单测
cd ..; npm run desktop:build
```

真机视觉测试（会写/清 Windows 凭据）：

```powershell
$env:WFS_LIVE_KEY = "<your key>"
cd src-tauri; cargo test --lib -- --ignored --test-threads=1
```

### 构建环境

- Rust 通过 rustup 安装（stable 1.99.1，`--no-modify-path` 安装后手动加入用户 PATH）。
- crates.io 直连超时，`~/.cargo/config.toml` 使用 `https://rsproxy.cn` 稀疏索引镜像。
- 目标机器需要 WebView2 运行时（Windows 11 自带）。

### 产物

| 产物 | 路径 |
| --- | --- |
| 便携 zip | `portable/wfs-desktop-0.1.0-win64.zip` |
| 可执行文件 | `portable/app/wfs-desktop.exe` |
| 构建输出 | `src-tauri/target/release/wfs-desktop.exe` |

---

*本报告基于 2026-10-23 的工作区代码与实测结果编写；缺陷按影响面排序，建议优先处理 P1 三项。*
