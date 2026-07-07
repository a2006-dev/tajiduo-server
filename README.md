# TajiDuo Server - 游戏数据代理服务端

一个轻量级的 Node.js 后端服务，为异环游戏助手 APP 提供 API 代理转发、用户 Token 保活、数据缓存等功能。

## 功能特性

- **API 代理** — 转发游戏请求到官方 API，处理签名加密和 DS Token
- **用户登录** — 短信验证码发送/验证、Token 交换
- **Token 保活** — 自动刷新用户 accessToken，保持登录状态
- **管理后台** — Web 仪表盘，管理 API Key、查看在线用户和请求日志
- **名字映射** — 角色/弧盘 ID 到中文名的映射管理
- **即时通知** — 向所有在线 APP 用户推送通知
- **公告系统** — 发布、编辑、管理公告
- **IP 黑名单** — 自动封禁异常请求 IP
- **限流保护** — 每 IP 每分钟请求限制
- **微信机器人** — 通过企业微信管理服务器
- **Docker 部署** — 一键部署

## 配置

所有敏感配置通过**环境变量**传入，无需修改代码：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `DATA_DIR` | `/data` | 数据持久化目录 |
| `MASTER_KEY` | `change_me_admin_password` | 管理后台密码 |
| `MACHINE_NAME` | `主服务器` | 服务器显示名 |

## 快速开始

```bash
docker build -t tajiduo-server .
mkdir -p /data/tajiduo

docker run -d --name tajiduo-server   --restart always   -p 3000:3000   -v /data/tajiduo:/data   -e MASTER_KEY=your_password   tajiduo-server
```

访问 `http://your-server:3000` 进入管理后台，密码为 `MASTER_KEY`。

## 关联项目

- [YihuanAssistant](https://github.com/a2006-dev/YihuanAssistant) - Android 游戏助手 APP（Kotlin Compose）

## License

MIT
