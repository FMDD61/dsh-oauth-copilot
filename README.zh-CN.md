# dsh-oauth-copilot

面向 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的 GitHub Copilot 登录与模型路由插件。

通过设备码流程登录 GitHub，把 Copilot 授权存入 harness 凭据记录，并注册基于 pi-ai Copilot 模型目录的 **github-copilot** LLM 路由——全部走官方 seam（`ctx.credentials` / `ctx.authorization` / `ctx.llm`），不依赖第三方 OAuth 基座。

> **状态：0.1.0** —— 已针对 dsh 0.1.1-rc.2 / pi-ai 0.82.1 构建并做真实账号验证。English: [README.md](README.md)。

## 为什么不基于社区 dsh-oauth

当前 dsh-oauth（0.2.0）构建于 0.1.0-rc.6/rc.8 包线，其 peer 与出货版 dsh 0.1.1-rc.2 在 semver 上互斥（npm 拒绝同 profile 安装）。因此本插件直接对接官方 seam（凭据记录、授权 flow、LLM 适配器），dsh-llm-pi-ai 已注册的 Copilot flow 可直接复用。

## 安装

发布形态（无需 clone 与构建）：

```sh
dsh plugin --profile web add dsh-oauth-copilot
```

重启 `dsh web` 生效。插件的 `cordis.patch.yml`（`llm-github-copilot`）经 `dsh.bundle.patch` 自动加载；profile patch 中的 `authorization` 服务条目激活登录机制（见兼容性注记）。

开发形态（仓库检出）：

```sh
npm install && npm run build
dsh plugin --profile web add /path/to/dsh-oauth-copilot
```

## 使用 —— 人工 CLI 为主路径

认证是**纯人工终端操作**，全程不经过 LLM——非官方模型即使被提示注入，也无法发起或撤销授权。

```sh
# CLI 随 npm 包提供。可全局安装……
npm install -g dsh-oauth-copilot
dsh-copilot-auth login          # 打印设备码 URL 与代码；浏览器完成授权
# ……或直接用 npx 免安装运行：
npx -y dsh-oauth-copilot login

dsh-copilot-auth status         # grant 过期时间与可用模型
dsh-copilot-auth refresh        # 重新拉取账号可用模型清单并写入 grant
dsh-copilot-auth logout         # 移除本地 grant
```

仅支持 github.com（GitHub Enterprise 不支持，见"已知限制"）。命令绝不回显密钥；provider 错误先脱敏；凭据文件以 0600 原子写落盘。

## 模型选择器说明

选择器列出 pi-ai 的 advisory 目录（29 个 Copilot 模型），**并非每个模型在账号下都可用**：选择不可用模型会得到 HTTP 400 "model not supported"。`dsh-copilot-auth refresh` 会把账号可用清单（`policy=enabled`）写入 grant，此后选择器只显示可用项；刷新失败/为空时仍是全量 advisory 列表——重试 `refresh`，或按 `status` 输出里的模型选择。

## 可选：模型端工具（默认关闭）

模型可执行的工具（`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`）**默认不注册**，仅在 `authorization` 服务已挂载 **且** 配置 `enableModelTools: true` 时出现。工具错误在进入模型上下文前一律脱敏。

```yaml
- id: llm-github-copilot
  config:
    enableModelTools: true       # 显式开启；默认 false
    loginWindowMs: 180000        # 登录工具等待授权的最长时间（毫秒）
    streamIdleTimeoutMs: 300000
```

## 已知限制

- **GitHub Enterprise 不支持。** 凭据白名单仅接受官方端点（`proxy.individual.githubcopilot.com`），模型登录工具与 CLI 均显式拒绝企业域。这是安全决策：伪造的 `enterpriseUrl` 会把 pi-ai 的自动 token 刷新指向攻击者服务器。
- **绑定 0.1.1-rc.2 包线。** peer 范围为 `^0.1.1-rc.2`；未来 dsh 0.1.1 稳定版或 0.2.0 会随适配器契约一起扩展。
- CLI 输出为中文（欢迎双语 PR）。
- 请勿在另一进程正在写凭据文件时执行 `dsh-copilot-auth login/logout`：CLI 使用 0600 原子写，但未持有 dsh 的跨进程写锁。

## FAQ

- **`dsh-copilot-auth: command not found`** —— npm 全局安装包（`npm install -g dsh-oauth-copilot`），或直接用 `npx -y dsh-oauth-copilot login`。
- **模型请求返回 HTTP 400 "model not supported"** —— 先运行 `dsh-copilot-auth refresh`，再按 `status` 输出选模型。
- **如何彻底撤销授权？** `dsh-copilot-auth logout` 移除本地 grant；GitHub → Settings → Applications 撤销 Copilot 授权。
- **Web UI 里登录按钮在哪？** 没有（dsh 0.1.1-rc.2 的 Models 页不暴露 OAuth 入口）；CLI 即登录路径。
- **如何更新插件？** `npm install -g dsh-oauth-copilot@latest && dsh plugin --profile web add dsh-oauth-copilot`（或更新 profile package.json 版本），然后重启 dsh web。

## 安全姿态

已对照社区实现（dsh-oauth / dsh-oauth-openai）并完成多轮对抗性评审；既定决策：

- **凭据校验**（`src/credential-store.ts` 与 CLI）：存储载荷做 schema 校验；`proxy-ep` 端点**仅**接受官方主机，且任何非空 `enterpriseUrl` 都会拒绝记录——同时封堵流量重定向与 refresh token 外泄两条路径。
- **设备码流程**固定在 github.com：无 redirect_uri、无本地回调端口、scope 固定最小 `read:user`、每 key 单一授权尝试。
- **错误脱敏**：provider 错误先做 JWT/token 正则脱敏再截断展示。
- **模型端权限**：登录/注销工具默认关闭；CLI 路径完全不需要模型参与。
- 凭据 0600 存储，不进入 settings/describe/环境变量，CLI 绝不回显。

## 工作原理

| 部件 | 文件 | 职责 |
|---|---|---|
| 模型路由 | `src/adapter.ts` | 以 `PiAiAdapter` 注册 `github-copilot`；请求级 apiKey 留空，交由 pi-ai 原生 OAuth 认证 |
| 凭据桥 | `src/credential-store.ts` | 严格校验的 harness 记录 `llm-pi-ai/github-copilot`（kind `grant`）↔ pi-ai `CredentialStore` + 环境 `AuthContext` |
| 人工 CLI | `scripts/dsh-copilot-auth.mjs` | 纯人工设备码登录/状态/刷新/注销，写入同一凭据记录 |
| 登录工具 | `src/login-tool.ts` | 可选模型工具，驱动 `ctx.authorization` flow（仅显式开启时注册） |

## 开发

```sh
npm install
npm run typecheck
npm test          # 单元 + 组合 + 凭据校验
npm run build
# scripts/ 只随仓库发布，不含在 npm 包内：请在仓库检出后运行
node scripts/smoke.mjs           # 在临时 DSH_HOME 中把构建产物挂到真实 seam 上冒烟
node scripts/smoke-noauth.mjs    # 验证无 authorization 服务时插件树照常启动
node scripts/verify-live.mjs     # 真实 grant 端到端探测（使用真实 grant，发送一个最小请求）
node scripts/verify-vision.mjs   # opencode-go 视觉路由探测（REASONING_EFFORT=low|high|max|off）
```

## 兼容性注记

模型路由始终激活；登录工具需要 `authorization` 服务挂载 + 显式开启。dsh 0.1.1-rc.2 的 dsh-base 默认不挂该服务——profile patch 已补充挂载。服务缺失绝不能拖垮整个插件树。

## License

MIT