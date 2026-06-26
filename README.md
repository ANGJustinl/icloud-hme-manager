# iCloud 隐藏我的邮件 (HME) 管理器

基于 Next.js 的 iCloud「隐藏我的邮件」（Hide My Email）Web 管理面板。支持多账号、生成/启停/编辑/删除别名、搜索、一键复制、导出 CSV。

> 本项目是原油猴脚本 [iCloud 隐藏我的邮件 (HME) 高级管理器] 的独立 Web 应用版本。脚本能工作是因为注入在 `icloud.com` 同源上下文；本应用作为**服务端代理**，携带你提供的登录 Cookie 调用相同的 HME API。

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 🔐 多账号管理 | 添加/切换/删除多个 iCloud 账号，凭证 AES-256-GCM 加密落库 |
| 📋 别名列表 | 按创建时间倒序展示，含标签/备注/生成时间 |
| ➕ 生成别名 | 一键生成并自动保留 + 复制到剪贴板 |
| 🔀 启停转发 | iOS 风格开关，停用/恢复转发 |
| ✏️ 编辑标签/备注 | （增强）更新别名标签和备注 |
| 🗑️ 永久删除 | （增强）从 iCloud 永久删除别名 |
| 🔍 搜索 | 按邮箱地址或标签过滤 |
| 📑 复制全部 / 导出 CSV | 批量导出全部别名 |
| 📨 收件箱浏览 | （新增）查看隐藏别名收到的邮件，含完整正文 |
| 🔑 验证码提取 | （新增）自动从最新邮件提取验证码并复制，支持定时监听 |
| 🧩 API 收件台 | 保存外部邮箱 API 地址，加密存储 token，自动轮询并复制验证码 |
| 👤 用户页 / JWT 访问 | 按邮箱账号 + JWT 分享单邮箱访问页和公开消息 API，不暴露其他邮箱 |
| 🔒 访问密码保护 | 可选 `ACCESS_PASSWORD` 守卫 WebUI |

## 🏗️ 架构

```
浏览器 (WebUI)  ──HTTPS──▶  Next.js 服务端 (Route Handlers)
                                │  + 注入用户提供的 Cookie
                                │  + 服务端无 CORS 限制
                                ▼
                        setup.icloud.com / HME API
```

- **Cookie 注入代理**：服务端携带你粘贴的 Cookie 调 iCloud API。Cookie 用 AES-256-GCM 加密后存 SQLite，永不下发前端。
- **会话**：iron-session 签名加密 cookie，无服务端会话状态。
- **数据**：SQLite（better-sqlite3），只存账号凭证和 API base 缓存；别名列表实时拉取不落库。

## 🚀 快速开始

### 方式一：本地开发

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

首次启动会自动在 `.env.local` 生成 `ENCRYPTION_KEY` 和 `SESSION_SECRET`。本地自用可不设访问密码。

### 方式二：Docker（推荐用于自托管/服务器）

1. 生成两个密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # SESSION_SECRET
```

2. 在项目根目录创建 `.env`（参考 `.env.example`）：

```env
ACCESS_PASSWORD=你的强密码
ENCRYPTION_KEY=<上面第一个值>
SESSION_SECRET=<上面第二个值>
```

3. 构建并启动：

```bash
docker compose up -d --build
# 打开 http://<服务器IP>:3000
```

数据持久化在宿主机 `./data` 目录。

## 📋 获取 iCloud Cookie（核心步骤）

本应用靠你提供 iCloud 的登录 Cookie 工作。Cookie 会过期（通常几天到几周），过期后重新执行本步骤更新即可。

1. 在浏览器（Chrome / Edge / Safari）登录 [icloud.com](https://www.icloud.com)
2. 按 `F12` 打开开发者工具，切到 **Network（网络）** 标签
3. 刷新页面，在请求列表里点任意一个发往 `*.icloud.com` 的请求
4. 在右侧 **Headers（标头）** → **Request Headers（请求标头）** 里找到 `cookie:` 这一行
5. 复制 `cookie:` 后面的**整行字符串**（很长，包含 `X-APPLE-...` 等多个字段）
6. 粘贴到本应用「添加账号」的 Cookie 输入框

> 也可以用浏览器扩展（如 EditThisCookie）一次性导出 `icloud.com` 域的所有 cookie 拼成 `key=value; key=value` 格式。

## 📨 配置 IMAP（收件箱 & 验证码提取）

收件箱浏览和验证码提取功能基于 **IMAP**（Apple 官方支持、稳定不失效）。需要单独配置 IMAP 登录信息。

### 为什么不能用 Cookie 读取邮件？
- Apple **没有公开的邮件 REST API**，iCloud 网页版的邮件接口是无文档的私有接口，随时可能变更。
- IMAP 是官方支持的稳定通道，但要求用**主邮箱地址 + 应用专用密码**登录（隐藏别名不能用于登录）。

### 获取应用专用密码

1. 前往 [appleid.apple.com](https://appleid.apple.com) → 登录
2. **登录与安全** → 确保已开启**两步验证/双重认证**（必须）
3. **登录与安全** → **应用专用密码** → 生成
4. 随便起个名字（如 "HME 管理器"），生成 16 位密码（格式 `xxxx-xxxx-xxxx-xxxx`）
5. 复制该密码

### 在 WebUI 配置

1. 点击右上角「账号设置」
2. 在 **IMAP 邮件读取** 区块填写：
   - **主邮箱地址**：你的 iCloud 登录主地址（如 `you@icloud.com`，不是隐藏别名）
   - **应用专用密码**：上一步生成的密码
3. 保存

配置后即可使用「收件箱」和「验证码提取」两个 Tab。

### 验证码提取使用场景

注册第三方账号时：
1. 切到「验证码提取」Tab
2. 选择用于注册的隐藏别名
3. 开启「自动监听」
4. 在目标网站点发送验证码 → 回到本页，验证码会**自动提取并复制到剪贴板**，直接粘贴即可

> 监听采用短连接轮询（每 5 秒一次），无需 IMAP 长连接 IDLE（serverless 友好、不触发 per-IP 连接限制）。

## 🧩 API 收件台（外部验证码邮箱）

如果你使用第三方分配的邮箱 API（例如 `https://.../messages?token=...`），可以切到「API 查询」Tab：

1. 点击「新增」，填写名称和邮箱 API 地址
2. 保存后选择该 API 邮箱，点击「刷新」获取邮件
3. 提取到验证码后会自动复制
4. 开启「自动监听」后，系统每 5 秒轮询一次当前 API 邮箱，发现新验证码会自动复制

也可以使用「临时查询」粘贴一次性 API 地址；临时查询不会保存 token。

> API 地址可能包含敏感 token。保存的 URL 会用 `ENCRYPTION_KEY` 加密落库，不会下发到前端。服务端会拒绝 localhost、127.0.0.1、内网 IP 等地址，避免把应用变成内网代理。

### 用户页 / JWT 分享

保存 API 邮箱后，可在「API 查询」里为单个邮箱生成两种分享链接：

1. **用户页链接**：`/inboxes/<邮箱账号>?token=<jwt>`
2. **用户 API 链接**：`/api/public/inboxes/<邮箱账号>/messages?token=<jwt>&view=all&limit=100`

特点：
- JWT 只绑定单个邮箱账号，不能越权查看其他保存的邮箱
- 用户访问不需要管理员登录态
- 公开 API 只返回当前邮箱的邮件列表和最新验证码，不暴露管理员保存的原始 token URL

## ⚙️ 配置项

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_PASSWORD` | 否 | WebUI 访问密码。留空 = 不启用守卫（仅建议本地）。自托管**强烈建议**设置。 |
| `ENCRYPTION_KEY` | 是* | 32 字节 hex（64 字符），加密账号 Cookie。本地留空自动生成；**Docker 必须显式固定**，否则容器重启后已存账号失效。 |
| `SESSION_SECRET` | 是* | 任意随机字符串，签名会话。同上 Docker 必须固定。 |
| `DATA_DIR` | 否 | SQLite 存放目录，默认 `./data`。 |

\* 本地开发留空会自动生成写入 `.env.local`；生产/Docker 必须显式提供。

## 🗂️ 项目结构

```
app/
├── api/                  # Route Handlers（服务端代理）
│   ├── auth/             # 登录/登出
│   ├── accounts/         # 账号 CRUD（含 IMAP 配置）
│   ├── hme/              # list/generate/reserve/update/delete/reactivate/deactivate
│   ├── mail/             # inbox（收件箱列表）/ read（邮件正文）
│   ├── otp/              # extract（验证码提取）
│   └── relay/            # 外部邮箱 API 收件台（sources / lookup）
├── inboxes/[inbox]/page.tsx  # 用户公开邮箱页（JWT 访问）
├── login/page.tsx        # 访问密码登录页
├── page.tsx              # 主面板（别名/收件箱/验证码/API 查询）
└── layout.tsx
components/
├── ui/                   # Button/Toggle/Modal/Toast/EmptyState
├── AccountManager.tsx    # 账号管理（Cookie + IMAP 配置）
├── EmailRow.tsx
├── EditLabelModal.tsx
├── InboxPanel.tsx        # 收件箱
├── OtpExtractor.tsx      # 验证码提取器
├── ApiRelayPanel.tsx     # 外部邮箱 API 收件台
└── PublicInboxView.tsx   # 用户公开邮箱页
lib/
├── icloud/               # constants/types/client（从脚本移植的 HME API）
├── mail/                 # IMAP 客户端（列表/正文/验证码提取）
├── db/                   # better-sqlite3 + accounts 数据访问
├── crypto.ts             # AES-256-GCM
├── otp.ts                # 验证码正则提取器
├── session.ts            # iron-session + 路由守卫
└── http.ts               # 统一响应/错误处理
```

## ⚠️ 安全提示

- **Cookie 等同账号密码**：任何能读取 Cookie 的人都能完全控制你的 iCloud 邮件。请妥善保管 `ENCRYPTION_KEY` 和 `data/` 目录。
- **外部邮箱 API URL 可能含 token**：保存后会加密落库，但仍应妥善保护 `ENCRYPTION_KEY` 和 `data/` 目录。
- **JWT 分享链接可直接访问单邮箱**：请把它视为受限访问凭证，只分享给该邮箱对应用户。
- **HTTPS**：自托管暴露公网时务必套反向代理（Nginx / Caddy）并启用 HTTPS，否则会话 cookie 明文传输。
- **不要把 `.env` 和 `data/` 提交到 Git**（已在 `.gitignore` 排除）。
- 本项目仅供个人管理自己的 iCloud 账号使用。

## 📄 许可证

MIT
