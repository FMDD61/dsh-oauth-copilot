# dsh-oauth-copilot

面向 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的 GitHub Copilot 登录与模型路由插件。

通过设备码流程登录 GitHub，把 Copilot 授权存入 harness 凭据记录，并注册基于 pi-ai Copilot 模型目录的 **github-copilot** LLM 路由——全部走官方 seam（`ctx.credentials` / `ctx.authorization` / `ctx.llm`），不依赖第三方 OAuth 基座。

> **状态：0.1.0（开发中）** —— 已针对 dsh 0.1.1-rc.2 / pi-ai 0.82.1 构建并通过冒烟；广泛使用前仍需一次真实 GitHub 账号登录验证。

## 为什么不基于社区 dsh-oauth

当前 dsh-oauth（0.2.0）构建于 0.1.0-rc.6/rc.8 包线，其 peer 与出货版 dsh 0.1.1-rc.2 在 semver 上互斥（npm 拒绝同 profile 安装）。因此本插件直接对接官方 seam（凭据记录、授权 flow、LLM 适配器），dsh-llm-pi-ai 已注册的 Copilot flow 可直接复用。

## 安装

```sh
npm install -g dsh-oauth-copilot
# 或本地开发(仓库检出): npm run build && dsh plugin --profile web add <仓库路径>
dsh plugin --profile web add dsh-oauth-copilot
```

重启 `dsh web` 生效（插件的 `cordis.patch.yml` 经 `dsh.bundle.patch` 自动加载，id `llm-github-copilot`）。

## 使用 —— 人工 CLI 为主路径

认证是**纯人工终端操作**，全程不经过 LLM——非官方模型即使被提示注入，也无法发起或撤销授权。

```sh
dsh-copilot-auth login     # 打印设备码 URL 与代码（终端醒目输出；仓库检出: node scripts/dsh-copilot-auth.mjs login）
dsh-copilot-auth status    # grant 过期时间与可用模型
dsh-copilot-auth logout    # 移除本地 grant
```

`login` 支持 `--enterprise-url <域>`（GitHub Enterprise；开始前会醒目提示目标主机）与 `--timeout <ms>`（默认 180000）。命令绝不回显密钥；provider 错误先脱敏；凭据文件以 0600 原子写落盘。

登录后在模型选择器的 **GitHub Copilot** 下选择模型即可使用。请求用 Copilot token 认证，过期自动刷新，模型列表按账号可用模型过滤（pi-ai 原生 filterModels）。

## 可选：模型端工具（默认关闭）

模型可执行的工具（`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`）**默认不注册**，仅在 `authorization` 服务已挂载 **且** 配置 `enableModelTools: true` 时出现。登录工具只支持 github.com（企业域仅走 CLI），所有工具错误在进入模型上下文前一律脱敏。

```yaml
- id: llm-github-copilot
  config:
    enableModelTools: true       # 显式开启；默认 false
    loginWindowMs: 180000        # 登录工具等待授权的最长时间（毫秒）
    streamIdleTimeoutMs: 300000
```

## 安全姿态

已对照社区实现（dsh-oauth / dsh-oauth-openai）并完成一轮对抗性评审，已修复：

- **凭据校验**（`src/credential-store.ts` 与 CLI）：存储载荷做 schema 校验，`proxy-ep` 端点必须为官方主机或记录自身企业主机——伪造记录无法再把模型流量引向攻击者服务器。
- **企业域注入**（V1）：模型登录工具拒绝 `enterpriseUrl` 参数；CLI 在发起前展示并要求确认目标主机。
- **错误脱敏**（V2）：provider 错误先做 JWT/token 正则脱敏再截断展示。
- **模型端权限**（V4）：登录/注销工具默认关闭；CLI 路径完全不需要模型参与。
- 无 redirect_uri、无本地回调端口、scope 固定最小 `read:user`、每 key 单一授权尝试、凭据 0600 存储且不进入 settings/describe/环境变量。

## 工作原理

| 部件 | 文件 | 职责 |
|---|---|---|
| 模型路由 | `src/adapter.ts` | 以 `PiAiAdapter` 注册 `github-copilot`；请求级 apiKey 留空，交由 pi-ai 原生 OAuth 认证 |
| 凭据桥 | `src/credential-store.ts` | 严格校验的 harness 记录 `llm-pi-ai/github-copilot`（kind `grant`）↔ pi-ai `CredentialStore` + 环境 `AuthContext` |
| 人工 CLI | `scripts/dsh-copilot-auth.mjs` | 纯人工设备码登录/状态/注销，写入同一凭据记录 |
| 登录工具 | `src/login-tool.ts` | 可选模型工具，驱动 `ctx.authorization` flow（仅显式开启时注册） |

## 开发

```sh
npm install
npm run typecheck
npm test          # 单元 + 组合 + 凭据校验
npm run build
node scripts/smoke.mjs           # 在临时 DSH_HOME 中把构建产物挂到真实 seam 上冒烟
node scripts/smoke-noauth.mjs    # 验证无 authorization 服务时插件树照常启动
```

## 兼容性注记

模型路由始终激活；登录工具需要 `authorization` 服务挂载 + 显式开启。dsh 0.1.1-rc.2 的 dsh-base 默认不挂该服务——profile patch 已补充挂载。服务缺失绝不能拖垮整个插件树。

## License

MIT