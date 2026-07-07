# 🖥️ TajiDuo Server

**异环游戏数据代理服务端** — Node.js 后端服务，为 YihuanAssistant APP 提供 API 代理、用户登录、Token 保活、管理后台等功能。

[![Node](https://img.shields.io/badge/Node-18%2B-brightgreen)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)](https://docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ 功能

- **🔄 API 代理** — 转发游戏请求到异环官方 API，自动处理签名加密和 DS Token
- **📱 用户登录** — 短信验证码发送与验证，老虎平台 Token 交换
- **🔋 Token 保活** — 自动刷新用户 accessToken，保持登录状态
- **🌐 管理后台** — Web 仪表盘，管理 API Key、查看在线用户和请求日志
- **📛 名字映射** — 角色/弧盘 ID 到中文名的映射管理
- **📢 即时通知** — 向所有在线 APP 用户推送弹窗通知
- **📰 公告系统** — 发布、编辑、管理滚动公告
- **💬 用户反馈** — 收集用户提交的反馈并跟踪处理状态
- **🛡️ IP 黑名单** — 自动封禁超频请求 IP + 手动管理
- **⏱️ 限流保护** — 每 IP 每分钟 60 请求限制
- **🤖 微信机器人** — 通过企业微信远程管理服务器（Bot + AI Agent）
- **📦 Docker 部署** — 一键部署，数据持久化

---

## 📋 前置条件

| 条件 | 说明 |
|------|------|
| **Node.js** | 18+ 或 Docker 环境 |
| **关联 APP** | [YihuanAssistant](https://github.com/a2006-dev/YihuanAssistant) Android 客户端 |
| **MASTER_KEY** | 管理后台登录密码（必填） |
| **FIXED_KEY** | APP 端默认 API Key（与 APP 代码一致） |

---

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
git clone https://github.com/a2006-dev/tajiduo-server.git
cd tajiduo-server

docker build -t tajiduo-server .
mkdir -p /data/tajiduo

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
npm install
MASTER_KEY=your_admin_password FIXED_KEY=your_app_default_key node server.js
```

---

## 🔧 环境变量配置

### 必填

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MASTER_KEY` | 管理后台登录密码 | `change_me_admin_password` |
| `FIXED_KEY` | APP 端默认 API Key（需与 APP 一致） | `change_me_app_default_key` |

### 选填

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `DATA_DIR` | 数据持久化目录 | `/data` |
| `MACHINE_NAME` | 服务器显示名称 | `主服务器` |

### 不动（对接异环官方 API）

```
TAJIDUO_BASE  → https://bbs-api.tajiduo.com
LAOHU_BASE    → https://user.laohu.com
APP_VERSION   → 1.2.2
DS_SALT       → pUds3dfMkl
LAOHU_APP_KEY → 89155cc4e8634ec5b1b6364013b23e3e
```

---

## 📖 部署后操作

### 1. 登录管理后台

访问 `http://your-server:3000`，密码为 `MASTER_KEY`。

### 2. 创建 API Key

管理后台 → API Keys → 创建新 Key → 在 APP 设置页填入

### 3. 配置 APP 端

在 `YihuanAssistant` 项目中修改 `RetrofitClient.kt` 的 `SERVER_BASE` 指向你的服务器地址。

---

## 🏗️ 项目结构

```
tajiduo-server/
├── server.js                     # 主程序（路由、代理、管理接口）
├── Dockerfile                    # Docker 镜像构建
├── package.json                  # Node.js 依赖定义
├── keepalive.sh                  # 微信机器人保活脚本
├── zeroclaw_config.example.toml  # AI Agent 配置示例
├── public/                       # 管理后台前端静态文件
│   └── index.html               # 仪表盘 + 管理页面
└── README.md                     # 本文件
```

### 数据文件（在 DATA_DIR 下）

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

---

## 🤖 微信机器人（可选）

通过企业微信向服务器发送指令，Bot 会自动处理或转发给 AI Agent。

### 配置

在服务器 `/root/wechat_bot.py` 顶部修改：

```python
CORP_ID = "ww_your_corpid"           # 企业 CorpID
CORP_SECRET = "your_corp_secret"      # 应用 Secret
AGENT_ID = 1000002                    # 应用 AgentId
TOKEN = "your_callback_token"         # 回调 Token
AES_KEY = "your_encoding_aes_key"     # 回调 EncodingAESKey
MASTER_KEY = "your_admin_password"    # 与服务端一致
```

### 支持命令

| 命令 | 说明 |
|------|------|
| `状态` / `报告` | 服务器状态报告 |
| `弹窗 <内容>` | 向 APP 推送通知 |
| `公告列表` | 查看公告 |
| `发布公告 <标题> <内容>` | 发布公告 |
| `反馈列表` | 查看用户反馈 |
| `生成key <名称>` | 创建 API Key |
| `key列表` | 查看所有 Key |
| `封禁 <IP>` | 封禁 IP |
| `解封 <IP>` | 解封 IP |
| `日志 [行数]` | 查看服务器日志 |
| `重启容器` | 重启 Docker 容器 |
| `名字映射` | 查看角色名映射 |
| `其他文本` | 转发给 AI 处理 |

### 保活

```bash
# crontab 设置，每5分钟检测一次
*/5 * * * * /root/keepalive.sh
```

---

## 🤖 Zeroclaw AI Agent（可选）

处理 Bot 转发的复杂指令，需配置 AI API Key。

参考 `zeroclaw_config.example.toml` 创建 `~/.zeroclaw/config.toml`：

```toml
[providers.models.openai.default]
api_key = "sk-your_api_key"     # AI 模型 Key
model = "deepseek-chat"
uri = "https://api.deepseek.com/v1"
```

---

## 🔌 API 接口

### APP 接口（需 `X-API-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login/captcha` | 发送验证码 |
| POST | `/api/login/verify` | 验证码登录 + Token 交换 |
| GET | `/api/game/*` | 游戏数据查询 |
| POST | `/api/game/*` | 游戏操作（签到） |
| POST | `/api/keepalive/register` | Token 保活注册 |
| GET | `/api/key/verify` | 验证 API Key 有效性 |
| POST | `/api/key/bind` | 绑定 Key 到游戏 UID |
| GET | `/api/app/version` | 版本更新检查 |
| GET | `/api/notices` | 获取公告 |
| POST | `/api/feedback` | 提交反馈 |
| GET | `/api/name-map` | 获取名字映射 |
| POST | `/api/name-map/report` | 上报名字映射 |

### 管理接口（需 `X-Master-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/status` | 服务器状态 |
| GET | `/admin/keys` | API Key 列表 |
| POST | `/admin/keys` | 创建 API Key |
| PUT | `/admin/keys/:id` | 更新 Key 配置 |
| DELETE | `/admin/keys/:id` | 删除 Key |
| POST | `/admin/broadcast` | 发送弹窗通知 |
| DELETE | `/admin/broadcast` | 清除弹窗 |
| GET/POST/PUT/DELETE | `/admin/notices` | 公告 CRUD |
| GET/PUT | `/admin/feedbacks` | 反馈管理 |
| GET/POST/DELETE | `/admin/blocked` | IP 黑名单 |
| GET/POST/DELETE | `/admin/schedule` | 定时任务 |
| GET | `/admin/logs` | 请求日志 |
| GET/POST/PUT/DELETE | `/admin/name-map` | 名字映射管理 |
| POST | `/admin/name-map/sync` | 同步最新 ID |

---

## 🖼️ 管理后台截图

> *(待补充)*

---

## ⚠️ 已知问题

1. **签到状态查询路径错误（已修复）** — `GET /signin/state` 因 `isSign` 判断遗漏走了错误的 API 路径，导致 APP 查不到签到状态
2. **Token 刷新串号（已修复）** — 多用户同时在线时，accessToken 刷新逻辑取第一个可用的 fwt 而非匹配对应用户，导致数据互串
3. **`/api/system/info` 未鉴权** — 系统信息接口未加 `apiKeyCheck`，修复建议：需要时加上

---

## 📄 许可证

本项目基于 MIT 许可证开源 — 详见 [LICENSE](LICENSE) 文件。

---

*Made with ❤️ by a2006-dev*
