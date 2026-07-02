# TajiDuo Server - 游戏数据代理服务端

一个轻量级的 Node.js 后端服务，为游戏 APP 提供 API 代理转发、用户 Token 保活、数据缓存等功能。

## 功能特性

- **API 代理** — 转发游戏请求到官方 API，处理签名、加密、DS Token
- **用户登录** — 短信验证码发送/验证、Token 交换
- **Token 保活** — 自动刷新用户 accessToken，保持登录状态
- **管理后台** — Web 仪表盘，管理 API Key、查看在线用户、请求日志
- **名字映射** — 角色/弧盘 ID 到中文名的映射管理，支持手动编辑
- **即时通知** — 向所有在线 APP 用户推送通知消息
- **公告系统** — 发布、编辑、管理公告
- **用户反馈** — 收集用户提交的反馈并跟踪处理状态
- **请求日志** — 实时记录所有 API 请求，显示调用者和操作
- **IP 黑名单** — 自动封禁异常请求 IP，支持手动管理
- **限流保护** — 每 IP 每分钟请求限制，防止滥用
- **定时任务** — 支持定时重启容器、重启服务器、关机
- **Docker 部署** — 一键部署，数据持久化

## 快速开始

### 使用 Docker

```bash
# 1. 构建镜像
docker build -t tajiduo-server .

# 2. 创建数据目录
mkdir -p /data/tajiduo

# 3. 运行容器
docker run -d --name tajiduo-server \
  --restart always \
  -p 3000:3000 \
  -v /data/tajiduo:/data \
  -e DATA_DIR=/data \
  -e MASTER_KEY=your_admin_password \
  -e PORT=3000 \
  tajiduo-server
```

### 直接运行

```bash
# 需要 Node.js 18+
npm install
DATA_DIR=./data MASTER_KEY=your_password node server.js
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `DATA_DIR` | `/data` | 数据持久化目录 |
| `MASTER_KEY` | `admin123` | 管理后台登录密码 |
| `MACHINE_NAME` | `主服务器` | 服务器显示名称 |

## 管理后台

启动后访问 `http://your-server:3000` 进入管理后台。

### 后台功能

| 功能 | 说明 |
|------|------|
| 仪表盘 | 运行时间、用户数、请求量统计 |
| API Keys | 生成/管理 API Key，设置绑定上限 |
| Token 保活 | 查看在线用户及其游戏 UID |
| 即时通知 | 发送通知消息到所有 APP 用户 |
| 公告管理 | 发布/编辑/隐藏公告 |
| 用户反馈 | 查看用户提交的反馈 |
| 名字映射 | 管理角色/弧盘 ID 到中文名的映射 |
| IP 黑名单 | 查看/管理被封禁的 IP |
| 定时任务 | 设置定时重启/关机 |
| 请求日志 | 查看所有 API 请求记录 |

## API 接口

### APP 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login/captcha` | 发送验证码 |
| POST | `/api/login/verify` | 验证码登录 |
| GET | `/api/game/*` | 游戏数据查询 |
| POST | `/api/game/*` | 游戏操作 |
| POST | `/api/keepalive/register` | Token 保活注册 |
| GET | `/api/key/verify` | 验证 API Key |
| POST | `/api/key/bind` | 绑定 API Key 到游戏UID |
| GET | `/api/system/info` | 系统信息 |
| GET | `/api/app/version` | 版本更新检查 |
| GET | `/api/notices` | 获取公告 |
| POST | `/api/feedback` | 提交反馈 |
| GET | `/api/server/info` | 服务器信息 |
| GET | `/api/name-map` | 获取名字映射 |
| POST | `/api/name-map/report` | 上报名字映射 |

### 管理接口

所有管理接口需在 Header 中传入 `X-Master-Key`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/status` | 服务器状态 |
| GET | `/admin/keys` | API Key 列表 |
| POST | `/admin/keys` | 创建 API Key |
| PUT | `/admin/keys/:id` | 更新 API Key |
| DELETE | `/admin/keys/:id` | 删除 API Key |
| POST | `/admin/broadcast` | 发送通知 |
| DELETE | `/admin/broadcast` | 清除通知 |
| GET | `/admin/logs` | 请求日志 |
| GET | `/admin/notices` | 公告列表 |
| POST | `/admin/notices` | 发布公告 |
| PUT | `/admin/notices/:id` | 编辑公告 |
| DELETE | `/admin/notices/:id` | 删除公告 |
| GET | `/admin/feedbacks` | 反馈列表 |
| PUT | `/admin/feedbacks/:id` | 处理反馈 |
| GET | `/admin/name-map` | 名字映射列表 |
| POST | `/admin/name-map` | 添加/编辑映射 |
| POST | `/admin/name-map/sync` | 同步最新 ID |
| DELETE | `/admin/name-map/:id` | 删除映射 |
| GET | `/admin/schedule` | 定时任务列表 |
| POST | `/admin/schedule` | 创建定时任务 |
| DELETE | `/admin/schedule/:id` | 删除定时任务 |
| GET | `/admin/blocked` | 黑名单列表 |
| POST | `/admin/blocked` | 封禁 IP |
| DELETE | `/admin/blocked/:ip` | 解封 IP |

## 数据持久化

所有数据存储在 `DATA_DIR` 目录：

```
/data/
├── api-keys.json        # API Key 列表
├── fwt-tokens.json       # 用户 Token
├── feedbacks.json        # 用户反馈
├── notices.json          # 公告
├── name-map.json         # 名字映射
├── blocked-ips.json      # IP 黑名单
└── scheduled-tasks.json  # 定时任务
```

## 架构说明

```
用户 APP  →  TajiDuo Server  →  游戏官方 API
                ↕
           管理后台 (Web)
```

服务端作为中间层，负责：
1. 签名/加密/DS Token 生成
2. 多用户 Token 统一管理
3. API Key 鉴权与限流
4. 数据缓存与名字映射

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express.js
- **容器**: Docker / Docker Compose
- **存储**: JSON 文件（本地持久化）

## License

MIT
