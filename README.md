# WF 截图查价（Windows 桌面版）

Tauri 2 + React + TypeScript 的 Windows 便携应用：粘贴 / 拖拽 / 选择一张 Warframe 截图，调用第三方视觉模型识别物品与裂罅，再查 warframe.market 行情。

不依赖 QQ、Codex CLI 或 warframe-mcp，安装后只需配置一个 OpenAI 兼容的视觉模型 API Key。

## 目录

| 路径 | 作用 |
| --- | --- |
| `src/` | React 界面与领域逻辑（物品库、匹配、紫卡、报价、等级规则） |
| `src/components/` | 输入区、结果卡片、设置页 |
| `src/lib/bridge.ts` | 与 Rust 后端通信的唯一入口 |
| `src-tauri/src/vision.rs` | 视觉模型调用（API Key 只在这里使用） |
| `src-tauri/src/market.rs` | warframe.market 代理（注入 User-Agent、重试） |
| `src-tauri/src/secret.rs` | Windows 凭据管理器读写 |
| `src-tauri/src/settings.rs` | 设置与数据目录 |

## 开发

前置：Node 24、Rust stable（MSVC 工具链）、WebView2。

```powershell
cd C:\Users\40899\Documents\ChatGPT\wfs-desktop
npm install
npm run desktop:dev      # 开发模式（Tauri 窗口）
npm test                 # 领域逻辑单测
npm run typecheck
npm run lint             # ESLint
npm run check            # 前端检查 + Rust fmt/clippy/test 全量门禁
```

`npm run check` 会自动把 `%USERPROFILE%\.cargo\bin` 加入 PATH；首次使用需要已安装
`rustfmt` 与 `clippy` 组件。

## 构建便携版

```powershell
npm run desktop:build
```

产物：`src-tauri\target\release\wfs-desktop.exe`，单文件即可运行（目标机器需要 WebView2，Windows 11 自带）。

## 配置项

- **模型服务**：DeepSeek 预设（`https://api.deepseek.com` / `deepseek-flash`）或任意 OpenAI 兼容服务；可填 Base URL、模型名、超时。
- **API Key**：保存在 Windows 凭据管理器（服务名 `wfs-desktop`）。前端只能设置/清除/查询状态，无法读回明文；配置文件与日志中都不会出现。
- **查询偏好**：MOD 默认 rank 0，赋能默认满级 rank 5（可改）；warframe.market 的 User-Agent 可改。
- **诊断信息**：设置页可导出 `data/diagnostics-<时间戳>.txt`，包含版本、平台、脱敏设置与最近日志。

## 数据目录

便携优先：exe 同级的 `data\`（`settings.json`、`catalog.json`、`logs\`）。该目录不可写时回退 `%APPDATA%\wfs-desktop`。

日志按天滚动，保留 7 个文件；不会记录 API Key、图片 base64 或完整请求体。

## 已知限制

- 识别完全依赖视觉模型；没有 API Key 时只能手动搜索查价。
- 安魂 MOD 走提示词 + 固定词表自动识别（3×3 网格实测能列出 9 张，偶有相似字形认错，可删掉后补选）。
- 效价 / 1999 帕拉松 MOD 的卡面常只有图案没有文字，任何模型与图像相似度都不可靠，
  因此不做猜测：点「从候选里选」或识别为空时自动弹出 39 个帕拉松候选（安魂 8 / 效价 8 / 其它 23），手动点选后查价。
- 裂罅的负面词条与数值读不到，价格区间天然偏宽。
- `/v1/auctions/search` 是官方已声明不再支持的遗留接口，随时可能失效。
