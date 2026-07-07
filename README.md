# TajiDuo Server - 异环游戏数据代理服务端

一个轻量级 Node.js 后端，为[异环游戏助手](https://github.com/a2006-dev/YihuanAssistant) APP 提供 API 代理转发、用户登录、Token 保活、管理后台等功能。

## 目录结构

```
tajiduo-server/
├── server.js                     # 主程序
├── Dockerfile                    # Docker 构建
├── package.json                  # Node.js 依赖
├── keepalive.sh                  # 微信机器人保活脚本
├── zeroclaw_config.example.toml  # Zeroclaw AI Agent 配置示例
├── public/                       # 管理后台前端页面
└── README.md                     # 本文件
```

> **微信机器人 `wechat_bot.py`** 因包含企业微信密钥，请从你的服务器 `/root/wechat_bot.py` 获取，或参考下方配置说明自行创建。

---

## 快速部署

### 方式一：Docker（推荐）

```bash
# 1. 克隆
git clone https://github.com/a2006-dev/tajiduo-server.git
cd tajiduo-server

# 2. 构建
docker build -t tajiduo-server .

# 3. 创建数据目录
mkdir -p /data/tajiduo

# 4. 运行
docker run -d --name tajiduo-server \
  --restart always \
  -p 3000:3000 \
  -v /data/tajiduo:/data \
  -e MASTER_KEY=your_admin_password \
  -e FIXED_KEY=your_app_default_key \
  tajiduo-server
```

### 方式二：直接运行

```bash
# 需要 Node.js 18+
npm install
MASTER_KEY=your_admin_password FIXED_KEY=your_app_default_key node server.js
```

---

## 环境变量配置

所有敏感信息通过环境变量传入，**不需要修改代码**。

### 必填（不改无法使用）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MASTER_KEY` | 管理后台登录密码 | `change_me_admin_password` |
| `FIXED_KEY` | APP端默认 API Key（需与 APP 代码中的 FIXED_KEY 一致） | `change_me_app_default_key` |

### 选填

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `DATA_DIR` | 数据持久化目录 | `/data` |
| `MACHINE_NAME` | 服务器显示名称 | `主服务器` |

### 不需要修改的参数（对接异环官方 API）

以下参数写在 `server.js` 中，除非官方更新否则不要动：

```
TAJIDUO_BASE  → 异环官方 API 地址
LAOHU_BASE    → 老虎平台登录 API
APP_VERSION   → 用于生成 DS Token 的版本号
DS_SALT       → DS 签名盐值
LAOHU_APP_KEY → 老虎平台 AppKey
```

---

## 部署后的必要操作

### 1. 登录管理后台

访问 `http://your-server:3000`，密码为环境变量 `MASTER_KEY` 的值。

### 2. 创建 API Key

管理后台 → API Keys → 创建新 Key → 在 APP 设置页填入该 Key

### 3. 配置 APP 端的 FIXED_KEY（可选）

如果使用 APP 内置的固定 Key，需修改 APP 项目中以下文件：

```
YihuanAssistant/.../SettingsScreen.kt  →  将固定 Key 改为你设置的值
YihuanAssistant/.../MainScreen.kt      →  同上
```

---

## 微信机器人（可选）

服务器上运行了一个企业微信 Bot，可通过微信向服务器发指令。

### 文件位置

- **机器人脚本**: `/root/wechat_bot.py`
- **保活脚本**: `keepalive.sh`
- **crontab 配置**: `*/5 * * * * /root/keepalive.sh`

### 配置说明

在 `wechat_bot.py` 顶部修改以下变量：

```python
CORP_ID = "ww_your_corpid"           # 企业微信 CorpID
CORP_SECRET = "your_corp_secret"      # 应用 Secret
AGENT_ID = 1000002                    # 应用 AgentId
TOKEN = "your_callback_token"         # 消息回调 Token
AES_KEY = "your_encoding_aes_key"     # 消息回调 EncodingAESKey
MASTER_KEY = "your_admin_password"    # 与服务端 MASTER_KEY 一致
```

### 支持的命令

```
状态/报告              → 服务器状态报告
弹窗 <内容>            → 向 APP 推送通知
公告列表               → 查看公告
发布公告 <标题> <内容>   → 发布公告
反馈列表               → 查看用户反馈
生成key <名称>          → 创建 API Key
key列表                → 查看所有 Key
封禁 <IP>              → 封禁 IP
解封 <IP>              → 解封 IP
黑名单                 → 查看被封禁 IP
日志 [行数]             → 查看服务器日志
重启容器               → 重启 Docker 容器
名字映射               → 查看角色名映射
其他任意文本            → 转发给 AI 处理
```

---

## Zeroclaw AI Agent（可选）

服务器上运行了 [Zeroclaw](https://github.com/zeroclaw/zeroclaw) AI Agent，用于处理 Bot 转发的复杂指令。

配置文件位于 `~/.zeroclaw/config.toml`，参考 `zeroclaw_config.example.toml`。

需要配置项：

```toml
[providers.models.openai.default]
api_key = "sk-your_api_key"     # AI 模型 API Key
model = "deepseek-chat"          # 模型名
uri = "https://api.deepseek.com/v1"  # API 地址
```

---

## API 接口

### APP 接口（需 `X-API-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login/captcha` | 发送验证码 |
| POST | `/api/login/verify` | 验证码登录 |
| GET | `/api/game/*` | 游戏数据查询 |
| POST | `/api/game/*` | 游戏操作 |
| POST | `/api/keepalive/register` | Token 保活 |
| GET | `/api/app/version` | 版本更新检查 |
| GET | `/api/notices` | 获取公告 |
| POST | `/api/feedback` | 提交反馈 |
| GET | `/api/name-map` | 名字映射 |

### 管理接口（需 `X-Master-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/status` | 服务器状态 |
| GET | `/admin/keys` | API Key 列表 |
| POST | `/admin/keys` | 创建 API Key |
| GET | `/admin/logs` | 请求日志 |
| POST | `/admin/broadcast` | 发送推送通知 |
| GET/POST/PUT/DELETE | `/admin/notices` | 公告管理 |
| GET/PUT | `/admin/feedbacks` | 反馈管理 |
| GET/POST/PUT/DELETE | `/admin/name-map` | 名字映射管理 |
| GET/POST/DELETE | `/admin/blocked` | IP 黑名单管理 |
| GET/POST/DELETE | `/admin/schedule` | 定时任务管理 |

---

## 持久化数据

所有数据存储在 `DATA_DIR` 目录：

```
/data/
├── api-keys.json        # API Key 列表
├── fwt-tokens.json       # 用户 Token
├── feedbacks.json        # 用户反馈
├── notices.json          # 公告
├── name-map.json         # 名字映射
├── blocked-ips.json      # IP 黑名单
├── scheduled-tasks.json  # 定时任务
└── token-status.json     # Token 状态
```

## 关联项目

- [YihuanAssistant](https://github.com/a2006-dev/YihuanAssistant) — Android 游戏助手 APP（Kotlin Compose）
- [tajiduo-admin](https://github.com/a2006-dev/tajiduo-admin) — 管理后台前端（未开源）

## License

MIT
