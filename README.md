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
- **🤖 微信机器人** — 通过企业微信远程管理服务器
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

### Docker（推荐）

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

### 直接运行

```bash
npm install
MASTER_KEY=your_admin_password FIXED_KEY=your_app_default_key node server.js
```

---

## 🔧 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `MASTER_KEY` | ✅ | 管理后台登录密码 | `change_me_admin_password` |
| `FIXED_KEY` | ✅ | APP 端默认 API Key | `change_me_app_default_key` |
| `PORT` | | 服务端口 | `3000` |
| `DATA_DIR` | | 数据持久化目录 | `/data` |
| `MACHINE_NAME` | | 服务器显示名称 | `主服务器` |

---

## 📖 部署后操作

1. 访问 `http://your-server:3000`，用 `MASTER_KEY` 登录管理后台
2. 进入 API Keys 页面创建新 Key
3. 在 APP 设置页填入服务器地址和 API Key

---

## 🏗️ 项目结构

```
tajiduo-server/
├── server.js                     # 主程序
├── Dockerfile                    # Docker 镜像构建
├── package.json                  # Node.js 依赖
├── keepalive.sh                  # 微信机器人保活脚本
├── zeroclaw_config.example.toml  # AI Agent 配置示例
├── public/                       # 管理后台前端静态文件
└── README.md
```

### 数据文件（`DATA_DIR` 目录）

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

在服务器 `/root/wechat_bot.py` 顶部修改以下变量：

```python
CORP_ID = "ww_your_corpid"
CORP_SECRET = "your_corp_secret"
AGENT_ID = 1000002
TOKEN = "your_callback_token"
AES_KEY = "your_encoding_aes_key"
MASTER_KEY = "your_admin_password"    # 与服务端 MASTER_KEY 一致
```

### 支持命令

| 命令 | 说明 |
|------|------|
| `状态` / `报告` | 服务器状态报告 |
| `弹窗 <内容>` | 向 APP 推送通知 |
| `发布公告 <标题> <内容>` | 发布公告 |
| `生成key <名称>` | 创建 API Key |
| `封禁 <IP>` / `解封 <IP>` | IP 管理 |
| `日志 [行数]` | 查看服务器日志 |
| `重启容器` | 重启 Docker 容器 |
| `其他文本` | 转发给 AI 处理 |

保活 crontab：`*/5 * * * * /root/keepalive.sh`

---

## 🔌 API 接口

### APP 接口（需 `X-API-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login/captcha` | 发送验证码 |
| POST | `/api/login/verify` | 验证码登录 |
| GET/POST | `/api/game/*` | 游戏数据和操作 |
| POST | `/api/keepalive/register` | Token 保活注册 |
| GET | `/api/key/verify` | 验证 API Key |
| GET | `/api/app/version` | 版本更新检查 |
| GET | `/api/notices` | 获取公告 |
| POST | `/api/feedback` | 提交反馈 |
| GET | `/api/name-map` | 获取名字映射 |

### 管理接口（需 `X-Master-Key` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/status` | 服务器状态 |
| GET/POST/PUT/DELETE | `/admin/keys` | API Key 管理 |
| POST/DELETE | `/admin/broadcast` | 弹窗通知 |
| GET/POST/PUT/DELETE | `/admin/notices` | 公告管理 |
| GET/PUT | `/admin/feedbacks` | 反馈管理 |
| GET/POST/DELETE | `/admin/blocked` | IP 黑名单 |
| GET/POST/DELETE | `/admin/schedule` | 定时任务 |
| GET | `/admin/logs` | 请求日志 |
| GET/POST/PUT/DELETE | `/admin/name-map` | 名字映射 |
| POST | `/admin/name-map/sync` | 同步最新 ID |

---

## 📄 许可证

本项目基于 MIT 许可证开源 — 详见 [LICENSE](LICENSE) 文件。

---

*Made with ❤️ by a2006-dev*
