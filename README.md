# TajiDuo Server - 游戏数据代理服务端

一个轻量级的 Node.js 后端服务，为异环游戏助手 APP 提供 API 代理转发、用户 Token 保活、管理后台等功能。

## 目录结构

```
tajiduo-server/
├── server.js          # 主程序（所有业务逻辑）
├── Dockerfile         # Docker 镜像构建
├── package.json       # Node.js 依赖
├── README.md           # 本文件
└── public/             # 管理后台前端静态文件
```

## 配置说明

### 必填参数（不改没法用）

这些配置在 **server.js 顶部**，需要改成你自己的：

```javascript
// ===== 必填配置 =====
const FIXED_KEY = "tjd_yh_2024_fixed";  // APP 默认 API Key，改成你自己的
```

### 环境变量配置（可通过 -e xbcxe0传xdfxeaxbbxf2 .env 文ä»¶xff09

| 变量 | 默认值 | 必填 | 说明 |
|--------|--------|--------|------|
| `PORT` | `3000` | 否 | 服务端口 |
| `DATA_DIR` | `/data` | 否 | 数据存储目录（用户token、API Key等） |
| `MASTER_KEY` | `change_me_admin_password` | **是** | 管理后台登录密码 |
| `MACHINE_NAME` | `主服务器` | 否 | 服务器显示名称 |

### 不需要动的配置

以下参数是对接 **异环官方 API** 的，除非官方更新，否则不用改：

- `TAJIDUO_BASE` — 异环官方 API 基地址
- `LAOHU_BASE` — 老虎平台登录 API 基地址
- `APP_VERSION` — APP 版本号（用于生成 DS Token）
- `DS_SALT` — DS 签名盐值
- `LAOHU_APP_KEY` — 老虎平台 App Key

## 部署方式

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/a2006-dev/tajiduo-server.git
cd tajiduo-server

# 2. 构建镜像
docker build -t tajiduo-server .

# 3. 创建数据目录
mkdir -p /data/tajiduo

# 4. 运行容器（注意替换 MASTER_KEY 为你的密码）
docker run -d --name tajiduo-server   --restart always   -p 3000:3000   -v /data/tajiduo:/data   -e MASTER_KEY=your_admin_password   tajiduo-server
```

### 方式二：直接运行

```bash
# 需要 Node.js 18+
npm install
MASTER_KEY=your_admin_password node server.js
```

## 部署后的必要操作

### 1. 登录管理后台

访问 `http://your-server:3000`，用 `MASTER_KEY` 作为密码登录。

### 2. 配置 FIXED_KEY

打开 **server.js**，找到这一行：
```javascript
const FIXED_KEY = "tjd_yh_2024_fixed";
```
改成你自己的字符串，这是 APP 默认的 API Key。APP 端的 `SettingsScreen.kt` 也要同步修改。

### 3. 在管理后台创建 API Key

进入管理后台 → API Keys → 创建新 Key，然后在 APP 设置页填入该 Key。

## 特性列表

- **API 代理** — 转发游戏请求到官方 API，处理签名加密和 DS Token
- **用户登录** — 短信验证码发送/验证、Token 交换
- **Token 保活** — 自动刷新用户 accessToken，保持登录状态
- **管理后台** — Web 仪表盘，管理 API Key、查看在线用户和请求日志
- **IP 黑名单** — 自动封禁异常请求 IP
- **限流保护** — 每 IP 每分钟请求限制
- **Docker 部署** — 一键部署

## 关联项目

- [YihuanAssistant](https://github.com/a2006-dev/YihuanAssistant) - Android 游戏助手 APP（Kotlin Compose）

## License

MIT
