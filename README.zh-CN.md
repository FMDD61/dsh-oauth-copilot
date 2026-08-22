# dsh-oauth-copilot

面向 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的 GitHub Copilot 登录与模型路由插件。

通过设备码流程登录 GitHub，把 Copilot 授权存入 harness 凭据记录，并注册基于 pi-ai Copilot 模型目录的 **github-copilot** LLM 路由——全部走官方 seam（`ctx.credentials` / `ctx.authorization` / `ctx.llm`），不依赖第三方 OAuth 基座。

> **状态：0.1.0（开发中）** —— 已针对 dsh 0.1.1-rc.2 / pi-ai 0.82.1 构建并通过冒烟；广泛使用前仍需一次真实 GitHub 账号登录验证。

## 为什么不基于社区 dsh-oauth

当前 dsh-oauth（0.2.0）构建于 0.1.0-rc.6/rc.8 包线，其 peer 与出货版 dsh 0.1.1-rc.2 在 semver 上互斥（npm 拒绝同 profile 安装）。因此本插件直接对接官方 seam（凭据记录、授权 flow、LLM 适配器），dsh-llm-pi-ai 已注册的 Copilot flow 可直接复用。

## 安装

```sh
cd ~/projects/dsh-oauth-copilot
npm run build
dsh plugin --profile web add /home/fmdd61/projects/dsh-oauth-copilot
```

重启 `dsh web` 生效（插件的 `cordis.patch.yml` 经 `dsh.bundle.patch` 自动加载，id `llm-github-copilot`）。

## 使用

在会话里对 agent 说：

- **「登录 GitHub Copilot」** → 触发 `github_copilot_login`：打印设备码 URL 与代码，浏览器完成授权后返回成功；
- **「查看 Copilot 状态」** → `github_copilot_status`：grant 过期时间与可用模型；
- **「注销 GitHub Copilot」** → `github_copilot_logout`：移除本地 grant。

登录后在模型选择器的 **GitHub Copilot** 下选择模型即可使用。请求用 Copilot token 认证，过期自动刷新，模型列表按账号可用模型过滤（pi-ai 原生 filterModels）。

## 配置

```yaml
- id: llm-github-copilot
  config:
    loginWindowMs: 180000       # 登录工具等待授权的最长时间（毫秒）
    streamIdleTimeoutMs: 300000
```

## 工作原理

| 部件 | 文件 | 职责 |
|---|---|---|
| 模型路由 | `src/adapter.ts` | 以 `PiAiAdapter` 注册 `github-copilot`；请求级 apiKey 留空，交由 pi-ai 原生 OAuth 认证 |
| 凭据桥 | `src/credential-store.ts` | 把 harness 记录 `llm-pi-ai/github-copilot`（kind `grant`，pi-ai 凭据载荷）映射为 pi-ai `CredentialStore` 与环境 `AuthContext` |
| 登录工具 | `src/login-tool.ts` | 三个 agent 工具：驱动已注册的 `ctx.authorization` flow（设备码）、状态查询、注销 |

## 开发

```sh
npm install
npm run typecheck
npm test          # 单元 + 组合
npm run build
node scripts/smoke.mjs   # 在临时 DSH_HOME 中把构建产物挂到真实 seam 上冒烟
```

## 兼容性注记

登录工具（`github_copilot_login` / `github_copilot_status` / `github_copilot_logout`）仅当
`authorization` 服务已挂载时注册——dsh 0.1.1-rc.2 的 dsh-base 默认不挂载该服务，因此在该
默认组合下插件只以 **github-copilot 模型路由** 形态激活（无登录工具）。模型路由本身不依赖
authorization 服务；服务缺失绝不能拖垮整个插件树。

## License

MIT
