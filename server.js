const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));
// favicon 防止 404
app.get('/favicon.ico', (req, res) => res.status(204).end());
const DATA_DIR = process.env.DATA_DIR || '/data';
const MASTER_KEY = process.env.MASTER_KEY || 'change_me_admin_password';
const TAJIDUO_BASE = 'https://bbs-api.tajiduo.com';
const LAOHU_BASE = 'https://user.laohu.com';
const APP_VERSION = '1.2.2';
const DS_SALT = 'pUds3dfMkl';
const LAOHU_APP_KEY = '89155cc4e8634ec5b1b6364013b23e3e';
const KEYS_FILE = path.join(DATA_DIR, "api-keys.json");
const FIXED_KEY = process.env.FIXED_KEY || "change_me_app_default_key";
let fixedBoundUids = [];
const TOKENS_FILE = path.join(DATA_DIR, 'fwt-tokens.json');
let apiKeys = [];
const fwtTokens = new Map();
function load() {
  try {
    if (fs.existsSync(KEYS_FILE)) apiKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (fs.existsSync(TOKENS_FILE)) {
      const d = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(d)) fwtTokens.set(k, v);
    }
  } catch (e) {}
}
function saveKeys() { try { fs.writeFileSync(KEYS_FILE, JSON.stringify(apiKeys, null, 2)); } catch (e) {} }
function saveTokens() {
  try { const o = {}; for (const [k, v] of fwtTokens.entries()) o[k] = v; fs.writeFileSync(TOKENS_FILE, JSON.stringify(o, null, 2)); } catch (e) {}
}
let globalNotice = '';
function ok(data, msg) { const r = { code: 0, msg: msg || 'ok', data: data }; if (globalNotice) r.notice = globalNotice; return r; }
function fail(c, m) {
  const o = { 400: 'MISSING_PARAM', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 406: 'BANNED', 429: 'RATE_LIMIT', 500: 'INTERNAL_ERROR' };
  return { code: c, msg: m || o[c] || 'UNKNOWN', data: null };
}
function randStr(l) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < l; i++) s += c[Math.floor(Math.random() * c.length)]; return s;
}
function generateDS() {
  const ts = Math.floor(Date.now() / 1000).toString(), n = randStr(8);
  return ts + ',' + n + ',' + crypto.createHash('md5').update(ts + n + APP_VERSION + DS_SALT).digest('hex');
}
function aesEncrypt(t, k) {
  const c = crypto.createCipheriv('aes-128-ecb', k, '');
  return c.update(t, 'utf8', 'base64') + c.final('base64');
}
function laohuSign(p) {
  const ks = Object.keys(p).sort();
  let s = ''; for (const k of ks) s += p[k];
  return crypto.createHash('md5').update(s + LAOHU_APP_KEY).digest('hex');
}
async function laohuPost(path, body, ep, ec) {
  const p = { ...body };
  const ak = LAOHU_APP_KEY.slice(-16);
  if (ep && p.cellphone) p.cellphone = aesEncrypt(p.cellphone, ak);
  if (ec && p.captcha) p.captcha = aesEncrypt(p.captcha, ak);
  p.sign = laohuSign(p);
  const r = await fetch(LAOHU_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'okhttp/4.12.0' },
    body: new URLSearchParams(p).toString()
  });
  return await r.json();
}
async function tajiduoGet(path, token) {
  const ds = generateDS();
  const h = { 'platform': 'android', 'appversion': APP_VERSION, 'ds': ds, 'User-Agent': 'okhttp/4.12.0' };
  if (token) h['authorization'] = token;
  const r = await fetch(TAJIDUO_BASE + path, { method: 'GET', headers: h });
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) { return { code: -1, msg: 'parse error', raw: text }; }
}
async function tajiduoPost(path, body, token) {
  const ds = generateDS();
  const h = { 'platform': 'android', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'okhttp/4.12.0', 'appversion': APP_VERSION, 'ds': ds };
  if (token) h['authorization'] = token;
  const r = await fetch(TAJIDUO_BASE + path, { method: 'POST', headers: h, body: new URLSearchParams(body).toString() });
  return await r.json();
}

async function doRefresh(rt, uid, at) {
  return await tajiduoPost('/usercenter/api/refreshToken', { refreshToken: rt, uid, deviceid: uid }, at || rt);
}
async function refreshAll() {
  let ok = 0, fail = 0;
  for (const [fwt, d] of fwtTokens.entries()) {
    try {
      const r = await doRefresh(d.refreshToken, d.uid, d.accessToken);
      if (r.code === 0 && r.data) {
        fwtTokens.set(fwt, { accessToken: r.data.accessToken, refreshToken: r.data.refreshToken, uid: d.uid, deviceId: d.deviceId, lastRefresh: Date.now(), gameRoleId: d.gameRoleId || '' });
        ok++;
      } else fail++;
    } catch (e) { fail++; }
  }
  saveTokens();
  console.log(`[刷新] ${ok}成功 ${fail}失败`);
}
function masterAuth(req, res, next) {
  const mk = req.headers['x-master-key'];
  if (mk !== MASTER_KEY) return res.status(401).json(fail(401));
  next();
}
// ===== App API =====
// API Key 验证中间件
function apiKeyCheck(req, res, next) {
  const ak = req.headers["x-api-key"];
  if (!ak) return res.status(400).json(fail(400, "请先在设置页填写 API Key"));
  const kd = apiKeys.find(k => k.key === ak && k.enabled);
  if (!kd && ak !== FIXED_KEY) return res.status(401).json(fail(401, "API Key 无效或已禁用"));
  req.keyData = kd;
  next();
}
app.post('/api/login/captcha', apiKeyCheck, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json(fail(400));
    const did = 'HT' + randStr(14).toUpperCase();
    const result = await laohuPost('/m/newApi/sendPhoneCaptchaWithOutLogin', {
      cellphone: phone, areaCodeId: '1', type: '16', appId: '10550', channelId: '1',
      deviceId: did, deviceModel: 'Pixel 6', deviceName: 'Pixel 6',
      deviceSys: 'Android 14', deviceType: 'Pixel 6', sdkVersion: '4.273.0',
      adm: did, idfa: '', bid: 'com.pwrd.htassistant', t: Date.now().toString(), version: '12', mac: ''
    });
    if (result.code === 0) res.json(ok({ deviceId: did }));
    else res.json(fail(result.code, result.message));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.post('/api/login/verify', apiKeyCheck, async (req, res) => {
  try {
    const { phone, captcha } = req.body;
    if (!phone || !captcha) return res.status(400).json(fail(400));
    const did = 'HT' + randStr(14).toUpperCase(), ts = Date.now().toString();
    const lr = await laohuPost('/openApi/sms/new/login', {
      cellphone: phone, captcha, areaCodeId: '1', type: '16', appId: '10550', channelId: '1',
      deviceId: did, deviceModel: 'Pixel 6', deviceName: 'Pixel 6',
      deviceSys: 'Android 14', deviceType: 'Pixel 6', sdkVersion: '4.273.0',
      adm: did, idfa: '', bid: 'com.pwrd.htassistant', t: ts, version: '12', mac: ''
    }, true, true);
    if (lr.code !== 0 || !lr.result) return res.json(fail(lr.code || 400, lr.message || '登录失败'));
    const { token, userId } = lr.result;
    const er = await tajiduoPost('/usercenter/api/login', { token, userIdentity: userId.toString(), appId: '10551' }, token);
    if (!er.ok || !er.data) return res.json(fail(er.code || 400, er.msg || 'token交换失败'));
    const { accessToken, refreshToken, uid } = er.data;
    // Reuse fwt
let fwt = null;
for (const [k, v] of fwtTokens.entries()) { if (v.uid === uid.toString()) { fwt = k; break; } }
if (!fwt) fwt = 'fwt_' + randStr(32);
fwtTokens.set(fwt, { accessToken, refreshToken, uid: uid.toString(), deviceId: 'app', lastRefresh: Date.now() });
    saveTokens();
    const ak = req.headers['x-api-key'];
    const keyData = apiKeys.find(k => k.key === ak && k.enabled);
    if (keyData) {
      if (!keyData.boundUids) keyData.boundUids = [];
      if (keyData.maxUsers > 0 && keyData.boundUids.length >= keyData.maxUsers && !keyData.boundUids.includes(uid.toString())) {
      } else if (!keyData.boundUids.includes(uid.toString())) {
        keyData.boundUids.push(uid.toString());
      }
      saveKeys();
    } else {
      if (!fixedBoundUids.includes(uid.toString())) fixedBoundUids.push(uid.toString());
    }
    res.json(ok({ accessToken, refreshToken, uid: uid.toString() }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/api/game/getGameRoles', apiKeyCheck, async (req, res) => {
  try {
    const path = '/usercenter/api/v2/getGameRoles?' + new URLSearchParams(req.query).toString();
    const at = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : '';
    const result = await tajiduoGet(path, at);
    res.json(result);
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});

app.get('/api/game/*', apiKeyCheck, async (req, res) => {
  try {
    const suffix = req.path.replace('/api/game', '');
    const isSign = suffix === '/sign' || suffix === '/signin/state' || suffix.startsWith('/sign/') || suffix.startsWith('/sign?');
    const path = (isSign ? '/apihub/awapi' : '/apihub/awapi/yh') + suffix + '?' + new URLSearchParams(req.query).toString();
    let at = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : '';
    let result = await tajiduoGet(path, at);
    if (result && result.code === -1 && result.raw === "" && fwtTokens.size > 0) {
      const roleId = req.query.roleId;
      let matched = false;
      if (roleId) {
        for (const [fwt, d] of fwtTokens.entries()) {
          if (d.gameRoleId === roleId && d.accessToken) {
            const rr = await doRefresh(d.refreshToken, d.uid, d.accessToken);
            if (rr.code === 0 && rr.data) {
              d.accessToken = rr.data.accessToken;
              d.refreshToken = rr.data.refreshToken;
              d.lastRefresh = Date.now();
              saveTokens();
              at = d.accessToken;
              result = await tajiduoGet(path, at);
            }
            matched = true;
            break;
          }
        }
      }
      if (matched === false) {
        for (const [fwt, d] of fwtTokens.entries()) {
          if (d.accessToken) {
            const rr = await doRefresh(d.refreshToken, d.uid, d.accessToken);
            if (rr.code === 0 && rr.data) {
              d.accessToken = rr.data.accessToken;
              d.refreshToken = rr.data.refreshToken;
              d.lastRefresh = Date.now();
              saveTokens();
              at = d.accessToken;
              result = await tajiduoGet(path, at);
            }
            break;
          }
        }
      }
    }res.json(result);
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.post('/api/game/*', apiKeyCheck, async (req, res) => {
  try {
    const suffix = req.path.replace('/api/game', '');
    const isSign = suffix === '/sign' || suffix === '/signin/state' || suffix.startsWith('/sign/') || suffix.startsWith('/sign?');
    const path = (isSign ? '/apihub/awapi' : '/apihub/awapi/yh') + suffix;
    let at = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : '';
    let result = await tajiduoPost(path, req.body, at);
    if (result && result.code === -1 && result.raw === "" && fwtTokens.size > 0) {
      const roleId = req.body.roleId;
      let matched = false;
      if (roleId) {
        for (const [fwt, d] of fwtTokens.entries()) {
          if (d.gameRoleId === roleId && d.accessToken) {
            const rr = await doRefresh(d.refreshToken, d.uid, d.accessToken);
            if (rr.code === 0 && rr.data) {
              d.accessToken = rr.data.accessToken;
              d.refreshToken = rr.data.refreshToken;
              d.lastRefresh = Date.now();
              saveTokens();
              at = d.accessToken;
              result = await tajiduoPost(path, req.body, at);
            }
            matched = true;
            break;
          }
        }
      }
      if (matched === false) {
        for (const [fwt, d] of fwtTokens.entries()) {
          if (d.accessToken) {
            const rr = await doRefresh(d.refreshToken, d.uid, d.accessToken);
            if (rr.code === 0 && rr.data) {
              d.accessToken = rr.data.accessToken;
              d.refreshToken = rr.data.refreshToken;
              d.lastRefresh = Date.now();
              saveTokens();
              at = d.accessToken;
              result = await tajiduoPost(path, at);
            }
            break;
          }
        }
      }
    }res.json(result);
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
// APP端绑定 API Key 到游戏UID
app.post('/api/key/bind', async (req, res) => {
  try {
    const { key, gameRoleId } = req.body;
    if (!key || !gameRoleId) return res.status(400).json(fail(400, '缺少参数'));
    const kd = apiKeys.find(k => k.key === key && k.enabled);
    if (!kd && key !== FIXED_KEY) return res.status(401).json(fail(401, 'API Key 无效'));
    if (kd) {
      if (!kd.boundUids) kd.boundUids = [];
      // 检查绑定数量上限
      if (kd.maxUsers > 0 && kd.boundUids.length >= kd.maxUsers && !kd.boundUids.includes(gameRoleId.toString())) {
        return res.status(403).json(fail(403, '此Key已达到最大绑定数(' + kd.maxUsers + '个)'));
      }
      if (!kd.boundUids.includes(gameRoleId.toString())) {
        kd.boundUids.push(gameRoleId.toString());
        saveKeys();
      }
      res.json(ok({ bound: true, keyName: kd.name, gameRoleId, boundCount: kd.boundUids.length, maxUsers: kd.maxUsers }));
    } else {
      res.json(ok({ bound: true, keyName: 'APP默认Key', gameRoleId }));
    }
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});

app.post('/api/keepalive/register', async (req, res) => {
  try {
    const { refreshToken, uid, gameRoleId } = req.body;
    if (!refreshToken || !uid) return res.status(400).json(fail(400));
    let existingFwt = null;
    for (const [fwt, d] of fwtTokens.entries()) {
      if (d.uid === uid.toString() && d.deviceId === 'app') { existingFwt = fwt; break; }
    }
    if (existingFwt) {
      const old = fwtTokens.get(existingFwt);
      fwtTokens.set(existingFwt, { accessToken: old ? old.accessToken : '', refreshToken, uid: uid.toString(), deviceId: 'app', lastRefresh: Date.now(), gameRoleId: gameRoleId || old.gameRoleId || '' });
      // 清理同uid的旧token
      for (const [k, v] of fwtTokens.entries()) {
        if (k !== existingFwt && v.uid === uid.toString()) {
          fwtTokens.delete(k);
        }
      }
      saveTokens();
      res.json(ok({ fwt: existingFwt, uid: uid.toString(), updated: true }));
    } else {
      // 清理同uid的旧token
      for (const [k, v] of fwtTokens.entries()) {
        if (v.uid === uid.toString()) fwtTokens.delete(k);
      }
      const fwt = 'fwt_' + randStr(32);
      fwtTokens.set(fwt, { accessToken: '', refreshToken, uid: uid.toString(), deviceId: 'app', lastRefresh: Date.now(), gameRoleId: gameRoleId || '' });
      saveTokens();
      res.json(ok({ fwt, uid: uid.toString(), updated: false }));
    }

  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/api/key/verify', async (req, res) => {
  try {
    const ak = req.headers['x-api-key'];
    if (!ak) return res.status(400).json(fail(400, '缺少 API Key'));
    const kd = apiKeys.find(k => k.key === ak && k.enabled);
    if (!kd && ak !== FIXED_KEY) return res.json(fail(401, 'API Key 无效或已禁用'));
    var name = kd ? kd.name : 'fixed';
    var enabled = kd ? kd.enabled : true;
    var count = kd ? (kd.useCount || 0) : 0;
    if (kd) { kd.lastUsed = new Date().toISOString(); kd.useCount = count + 1; saveKeys(); }
    res.json(ok({ name: name, enabled: enabled, useCount: count }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/api/system/info', async (req, res) => {
  try {
    const os = require('os');
    const cpus = os.cpus();
    const totalMem = os.totalmem(), freeMem = os.freemem();
    const usedMem = totalMem - freeMem, memPercent = (usedMem / totalMem * 100);
    const loadAvg = os.loadavg();
    const cpuPercent = Math.min(loadAvg[0] / cpus.length * 100, 100);
    let diskInfo = { used: '-', total: '-', percent: 0 };
    let dockerInfo = { containers: '-', version: '-' };
    try {
      const { execSync } = require('child_process');
      const df = execSync('df -h / | tail -1', { timeout: 3000 }).toString().trim().split(/\s+/);
      diskInfo = { used: df[2] || '-', total: df[1] || '-', percent: parseInt(df[4]) || 0 };
      const dc = execSync('docker info --format "{{.Containers}}" 2>/dev/null || echo 0', { timeout: 3000 }).toString().trim();
      const dv = execSync('docker --version 2>/dev/null || echo unknown', { timeout: 3000 }).toString().trim();
      dockerInfo = { containers: dc, version: dv.replace('Docker version ', '') };
    } catch (e) {}
    res.json(ok({
      cpuModel: cpus[0]?.model?.substring(0, 40) || '-', cpuCores: cpus.length, cpuPercent: Math.round(cpuPercent * 10) / 10,
      memTotal: (totalMem / 1024 / 1024 / 1024).toFixed(1) + 'G', memUsed: (usedMem / 1024 / 1024 / 1024).toFixed(1) + 'G', memPercent: Math.round(memPercent * 10) / 10,
      diskUsed: diskInfo.used, diskTotal: diskInfo.total, diskPercent: diskInfo.percent,
      dockerContainers: dockerInfo.containers, dockerVersion: dockerInfo.version,
      uptime: Math.floor(os.uptime()), loadAvg: loadAvg.map(v => v.toFixed(2)),
      os: os.type() + ' ' + os.release(), hostname: os.hostname()
    }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/admin/status', masterAuth, (req, res) => {
  const totalReq = apiStats.total;
  const todayReq = apiStats.today;
  const boundTotal = apiKeys.reduce((s, k) => s + (k.boundUids || []).length, 0);
  const refreshOk = fwtTokens.size > 0 ? Array.from(fwtTokens.values()).filter(d => d.lastRefresh > 0).length : 0;
  res.json(ok({
    machineName: process.env.MACHINE_NAME || '阿里云', uptime: process.uptime(),
    userCount: fwtTokens.size, keyCount: apiKeys.length + 1, activeKeys: (apiKeys.filter(k => k.enabled).length) + 1,
    totalRequests: totalReq, todayRequests: todayReq, boundUsers: boundTotal,
    refreshSuccess: refreshOk, refreshFail: fwtTokens.size - refreshOk,
    memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    nodeVersion: process.version, version: '1.1.0'
  }));
});
// 管理端：被封禁IP列表
app.get('/admin/blocked', masterAuth, (req, res) => {
  res.json(ok({ ips: [...blockedIps], count: blockedIps.size }));
});
// 管理端：解封IP
app.delete('/admin/blocked/:ip', masterAuth, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  if (blockedIps.delete(ip)) { saveBlocked(); res.json(ok({ unbanned: ip })); }
  else res.status(404).json(fail(404, 'IP不在黑名单中'));
});
// 管理端：手动封禁IP
app.post('/admin/blocked', masterAuth, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json(fail(400, '缺少IP'));
  blockedIps.add(ip); saveBlocked();
  res.json(ok({ banned: ip, total: blockedIps.size }));
});
app.get('/admin/keys', masterAuth, (req, res) => {
  const allTokens = Array.from(fwtTokens.entries()).map(([fwt, d]) => ({
    fwt, uid: d.uid, gameRoleId: d.gameRoleId || '', lastRefresh: d.lastRefresh
  }));
  // 添加固定 key 到列表
  const fixedKeyEntry = {
    id: 'fixed_key',
    name: '固定Key(APP)',
    key: FIXED_KEY,
    enabled: true,
    maxUsers: 0,
    boundUids: fixedBoundUids,
    bannedUids: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    lastUsed: null,
    useCount: 0,
    allTokens,
    boundUidList: allTokens
      .filter(d => d.uid && (fixedBoundUids.includes(d.uid) || fixedBoundUids.includes(d.gameRoleId)))
      .map(d => ({ fwt: d.fwt, uid: d.uid, gameRoleId: d.gameRoleId, lastRefresh: d.lastRefresh }))
  };
  const keysWithDetails = [fixedKeyEntry, ...apiKeys.map(k => ({
    ...k,
    allTokens,
    boundUidList: allTokens
      .filter(d => d.uid && k.boundUids && (k.boundUids.includes(d.uid) || k.boundUids.includes(d.gameRoleId)))
      .map(d => ({ fwt: d.fwt, uid: d.uid, gameRoleId: d.gameRoleId, lastRefresh: d.lastRefresh }))
  }))];
  res.json(ok(keysWithDetails));
});
app.post('/admin/keys', masterAuth, (req, res) => {
  const { name, maxUsers } = req.body;
  if (!name) return res.status(400).json(fail(400));
  const k = {
    id: uuidv4(), name, key: 'tjd_' + randStr(32), enabled: true,
    maxUsers: maxUsers || 0, boundUids: [], bannedUids: [],
    createdAt: new Date().toISOString(), lastUsed: null, useCount: 0
  };
  apiKeys.push(k); saveKeys(); res.json(ok(k));
});
app.put('/admin/keys/:id', masterAuth, (req, res) => {
  const i = apiKeys.findIndex(k => k.id === req.params.id);
  if (i === -1) return res.status(404).json(fail(404));
  if (req.body.name !== undefined) apiKeys[i].name = req.body.name;
  if (req.body.enabled !== undefined) apiKeys[i].enabled = req.body.enabled;
  if (req.body.maxUsers !== undefined) apiKeys[i].maxUsers = req.body.maxUsers;
  if (req.body.bannedUids !== undefined) {
    if (!apiKeys[i].bannedUids) apiKeys[i].bannedUids = [];
    req.body.bannedUids.forEach(uid => { if (!apiKeys[i].bannedUids.includes(uid)) apiKeys[i].bannedUids.push(uid); });
  }
  if (req.body.unbanUids !== undefined) {
    if (apiKeys[i].bannedUids) apiKeys[i].bannedUids = apiKeys[i].bannedUids.filter(u => !req.body.unbanUids.includes(u));
  }
  saveKeys(); res.json(ok(apiKeys[i]));
});
// 广播通知（供宿主机监控脚本调用）
app.post('/admin/broadcast', masterAuth, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json(fail(400, '缺少消息内容'));
  globalNotice = message;
  console.log('[广播] ' + message);
  // 10分钟后自动清除
  setTimeout(() => { if (globalNotice === message) globalNotice = ''; }, 10 * 60 * 1000);
  res.json(ok({ sent: true, userCount: fwtTokens.size }));
});

// 清除通知
app.delete('/admin/broadcast', masterAuth, (req, res) => {
  globalNotice = '';
  res.json(ok(null));
});
app.delete('/admin/keys/:id', masterAuth, (req, res) => {
  const i = apiKeys.findIndex(k => k.id === req.params.id);
  if (i === -1) return res.status(404).json(fail(404));
  const delKey = apiKeys[i];
  const boundUids = delKey.boundUids || [];
  apiKeys.splice(i, 1); saveKeys();
  // Clean up fwt tokens for deleted key's bound uids
  for (const [fwt, d] of fwtTokens.entries()) {
    if (boundUids.includes(d.uid)) {
      fwtTokens.delete(fwt);
    }
  }
  saveTokens();
  res.json(ok(null));
});
app.get('/health', (req, res) => res.json(ok(null)));
// ===== 角色/弧盘名字映射 =====
let nameMap = {};
let nameMapUpdated = 0;
async function updateNameMap() {
  try { if (fs.existsSync(TOKENS_FILE)) { const d = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")); for (const [k, v] of Object.entries(d)) { if (!fwtTokens.has(k)) fwtTokens.set(k, v); } } } catch (e) {}
  try {
    for (const [fwt, d] of fwtTokens.entries()) {
      if (!d.accessToken || !d.uid) continue;
      // 优先用游戏UID查角色列表
      const targetUid = d.gameRoleId || d.uid;
      try {
        const r = await tajiduoGet('/apihub/awapi/yh/characters?roleId=' + targetUid, d.accessToken);
        if (r && r.code === 0 && r.data && Array.isArray(r.data)) {
          for (const ch of r.data) {
            if (ch.id) {
              if (!nameMap[ch.id]) nameMap[ch.id] = ch.name || '';
              else if (ch.name && !nameMap[ch.id]) nameMap[ch.id] = ch.name;
            }
            if (ch.fork && ch.fork.id) {
              const fid = ch.fork.id;
              if (!nameMap[fid]) nameMap[fid] = ch.fork.name || '';
              else if (ch.fork.name && !nameMap[fid]) nameMap[fid] = ch.fork.name;
            }
          }
        }
      } catch (e) {}
    }
    console.log('[NameMap] ' + Object.keys(nameMap).length + ' entries');
  } catch (e) {}
}
// 保存持久化的名字映射
const NAMEMAP_FILE = path.join(DATA_DIR, 'name-map.json');
function loadPersistedNameMap() {
  try { if (fs.existsSync(NAMEMAP_FILE)) { const d = JSON.parse(fs.readFileSync(NAMEMAP_FILE, 'utf8')); for (const [k, v] of Object.entries(d)) nameMap[k] = v; } } catch (e) {}
}
function saveNameMap() {
  try { fs.writeFileSync(NAMEMAP_FILE, JSON.stringify(nameMap, null, 2)); } catch (e) {}
}
// APP端上报名字映射（登录后或刷新角色后上报）
app.post('/api/name-map/report', apiKeyCheck, async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || typeof entries !== 'object') return res.status(400).json(fail(400));
    let added = 0;
    for (const [k, v] of Object.entries(entries)) {
      if (k && v) { nameMap[k] = v; added++; }
    }
    if (added > 0) saveNameMap();
    res.json(ok({ added, total: Object.keys(nameMap).length }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
// 管理端：获取所有名字映射
app.get('/admin/name-map', masterAuth, (req, res) => {
  res.json(ok({ map: nameMap, total: Object.keys(nameMap).length }));
});
// 管理端：添加/更新/编辑名字映射
app.post('/admin/name-map', masterAuth, (req, res) => {
  try {
    const { id, name } = req.body;
    if (!id) return res.status(400).json(fail(400, '缺少id'));
    if (!name) return res.status(400).json(fail(400, '缺少名称'));
    nameMap[id] = name;
    saveNameMap();
    res.json(ok({ id, name, total: Object.keys(nameMap).length }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
// 管理端：批量获取最新ID列表（从游戏服务器拉取）
app.post('/admin/name-map/sync', masterAuth, async (req, res) => {
  try {
    const before = Object.keys(nameMap).length;
    // 遍历所有在线用户拉取角色数据
    for (const [fwt, d] of fwtTokens.entries()) {
      if (!d.accessToken || !d.uid) continue;
      try {
        const r = await tajiduoGet('/apihub/awapi/yh/characters?roleId=' + d.uid, d.accessToken);
        if (r && r.code === 0 && r.data && Array.isArray(r.data)) {
          for (const ch of r.data) {
            if (ch.id && !nameMap[ch.id]) nameMap[ch.id] = ch.name || '';
            if (ch.fork && ch.fork.id && !nameMap[ch.fork.id]) nameMap[ch.fork.id] = ch.fork.name || '';
          }
        }
      } catch (e) {}
    }
    const after = Object.keys(nameMap).length;
    saveNameMap();
    res.json(ok({ added: after - before, total: after }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
// 管理端：删除名字映射
app.delete('/admin/name-map/:id', masterAuth, (req, res) => {
  const id = req.params.id;
  if (!nameMap[id]) return res.status(404).json(fail(404, '不存在'));
  delete nameMap[id];
  saveNameMap();
  res.json(ok({ deleted: id, total: Object.keys(nameMap).length }));
});
app.get('/api/name-map', (req, res) => {
  res.json(ok({ map: nameMap }));
});
// ===== 1. 请求日志 =====
// 路径 → 功能名映射
const PATH_NAMES = {
  '/api/login/captcha': '发送验证码',
  '/api/login/verify': '登录',
  '/api/game/getGameRoles': '获取角色列表',
  '/api/keepalive/register': 'Token保活注册',
  '/api/key/verify': '验证API Key',
  '/api/system/info': '系统信息',
  '/api/notices': '获取公告',
  '/api/feedback': '提交反馈',
  '/api/app/version': '版本检查',
  '/api/server/info': '服务器信息',
  '/api/name-map': '名字映射',
  '/api/name-map/report': '上报名字映��',
  '/admin/status': '系统',
  '/admin/keys': '系统',
  '/admin/notices': '系统',
  '/admin/feedbacks': '系统',
  '/admin/broadcast': '系统',
  '/admin/app/version': '系统',
  '/admin/logs': '系统',
  '/health': '心跳'
};
function getActionName(path) {
  // 精确匹配
  if (PATH_NAMES[path]) return PATH_NAMES[path];
  // 前缀匹配
  if (path.startsWith('/api/game/')) return '游戏数据查询';
  if (path.startsWith('/admin/')) return '系统';
  return path.split('?')[0];
}
const requestLog = [];
const MAX_LOG = 200;
// 日志中间件：记录所有API请求
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/logs')) return next();
  const start = Date.now();
  const ak = req.headers['x-api-key'] || '';
  let keyName = '未知';
  if (ak) {
    if (ak === FIXED_KEY) keyName = 'APP默认Key';
    else {
      const kd = apiKeys.find(k => k.key === ak && k.enabled);
      if (kd) keyName = kd.name;
    }
  }
  res.on('finish', () => {
    requestLog.unshift({
      time: new Date().toISOString(),
      action: getActionName(req.path.split('?')[0]),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      keyName: keyName,
      ms: Date.now() - start
    });
    if (requestLog.length > MAX_LOG) requestLog.length = MAX_LOG;
  });
  next();
});
app.get('/admin/logs', masterAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(ok(requestLog.slice(0, limit)));
});
// ===== 2. 版本更新检查 =====
const APP_INFO = {
  version: '1.0',
  build: 1,
  minBuild: 1,
  url: '',
  force: false,
  desc: ''
};
app.get('/api/app/version', (req, res) => {
  const build = parseInt(req.query.build) || 0;
  const hasUpdate = build < APP_INFO.build;
  res.json(ok({
    hasUpdate,
    latestVersion: APP_INFO.version,
    latestBuild: APP_INFO.build,
    downloadUrl: APP_INFO.url,
    forceUpdate: hasUpdate && APP_INFO.force,
    updateDesc: hasUpdate ? APP_INFO.desc : ''
  }));
});
// 管理员更新版本信息
app.post('/admin/app/version', masterAuth, (req, res) => {
  const { version, build, url, force, desc } = req.body;
  if (version) APP_INFO.version = version;
  if (build) APP_INFO.build = build;
  if (url) APP_INFO.url = url;
  if (force !== undefined) APP_INFO.force = force;
  if (desc) APP_INFO.desc = desc;
  APP_INFO.minBuild = req.body.minBuild || APP_INFO.minBuild;
  res.json(ok(APP_INFO));
});
// ===== 3. 持久化公告 =====
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');
let notices = [];
function loadNotices() {
  try { if (fs.existsSync(NOTICES_FILE)) notices = JSON.parse(fs.readFileSync(NOTICES_FILE, 'utf8')); } catch (e) { notices = []; }
}
function saveNotices() { try { fs.writeFileSync(NOTICES_FILE, JSON.stringify(notices, null, 2)); } catch (e) {} }
app.get('/api/notices', (req, res) => {
  res.json(ok(notices.filter(n => n.active !== false)));
});
app.post('/admin/notices', masterAuth, (req, res) => {
  const { title, content, level } = req.body;
  if (!title || !content) return res.status(400).json(fail(400));
  const n = {
    id: uuidv4(), title, content, level: level || 'info',
    active: true, createdAt: new Date().toISOString()
  };
  notices.unshift(n);
  saveNotices();
  res.json(ok(n));
});

app.put('/admin/notices/:id', masterAuth, (req, res) => {
  const n = notices.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json(fail(404));
  if (req.body.title !== undefined) n.title = req.body.title;
  if (req.body.content !== undefined) n.content = req.body.content;
  if (req.body.level !== undefined) n.level = req.body.level;
  if (req.body.active !== undefined) n.active = req.body.active;
  saveNotices();
  res.json(ok(n));
});
app.delete('/admin/notices/:id', masterAuth, (req, res) => {
  const i = notices.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json(fail(404));
  notices.splice(i, 1);
  saveNotices();
  res.json(ok(null));
});
// ===== 4. 用户反馈 =====
const FEEDBACKS_FILE = path.join(DATA_DIR, 'feedbacks.json');
let feedbacks = [];
function loadFeedbacks() {
  try { if (fs.existsSync(FEEDBACKS_FILE)) feedbacks = JSON.parse(fs.readFileSync(FEEDBACKS_FILE, 'utf8')); } catch (e) { feedbacks = []; }
}
function saveFeedbacks() { try { fs.writeFileSync(FEEDBACKS_FILE, JSON.stringify(feedbacks, null, 2)); } catch (e) {} }
app.post('/api/feedback', apiKeyCheck, async (req, res) => {
  try {
    const { content, contact, uid } = req.body;
    if (!content) return res.status(400).json(fail(400, '请输入反馈内容'));
    if (content.length < 5) return res.status(400).json(fail(400, '反馈内容至少5个字'));
    const f = {
      id: uuidv4(), content, contact: contact || '',
      uid: uid || req.headers['x-uid'] || '',
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    feedbacks.unshift(f);
    saveFeedbacks();
    res.json(ok({ id: f.id }));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/admin/feedbacks', masterAuth, (req, res) => {
  const status = req.query.status;
  let list = feedbacks;
  if (status) list = list.filter(f => f.status === status);
  res.json(ok(list));
});
app.put('/admin/feedbacks/:id', masterAuth, (req, res) => {
  const f = feedbacks.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json(fail(404));
  if (req.body.status) f.status = req.body.status;
  if (req.body.reply) f.reply = req.body.reply;
  saveFeedbacks();
  res.json(ok(f));
});

// ===== 5. 多机互备 =====
// 定时任务管理
let scheduledTasks = [];
const TASKS_FILE = path.join(DATA_DIR, 'scheduled-tasks.json');
function loadTasks() { try { if (fs.existsSync(TASKS_FILE)) scheduledTasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch (e) { scheduledTasks = []; } }
function saveTasks() { try { fs.writeFileSync(TASKS_FILE, JSON.stringify(scheduledTasks, null, 2)); } catch (e) {} }
function executeTask(task) {
  console.log('[定时任务] 执行: ' + task.action + ' (ID: ' + task.id + ')');
  try {
    const { execSync } = require('child_process');
    if (task.action === 'shutdown') execSync('shutdown -h now', { timeout: 5000 });
    else if (task.action === 'reboot') execSync('reboot', { timeout: 5000 });
    else if (task.action === 'docker_restart') execSync('docker restart tajiduo-server', { timeout: 5000 });
  } catch (e) { console.log('[定时任务] 执行失败: ' + e.message); }
}
setInterval(() => {
  const now = Date.now();
  scheduledTasks = scheduledTasks.filter(t => {
    if (t.enabled !== false && t.scheduledAt <= now) { executeTask(t); return false; }
    return true;
  });
  saveTasks();
}, 10000);
app.post('/admin/schedule', masterAuth, (req, res) => {
  try {
    const { action, time, type } = req.body;
    if (!action || !time) return res.status(400).json(fail(400, '缺少参数'));
    if (!['shutdown','reboot','docker_restart'].includes(action)) return res.status(400).json(fail(400, '无效操作'));
    let scheduledAt;
    if (type === 'cron') {
      const p = time.split(' ');
      if (p.length !== 5) return res.status(400).json(fail(400, '格式: 分 时 日 月 周'));
      const n = new Date();
      const h = parseInt(p[1])||0; const m = parseInt(p[0])||0;
      scheduledAt = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, 0).getTime();
      if (scheduledAt <= Date.now()) scheduledAt += 86400000;
    } else { scheduledAt = parseInt(time); if (isNaN(scheduledAt)) return res.status(400).json(fail(400, '时间戳错误')); }
    const task = { id: uuidv4(), action, time, scheduledAt, type: type||'once', enabled: true, createdAt: new Date().toISOString() };
    scheduledTasks.push(task); saveTasks();
    res.json(ok(task));
  } catch (e) { console.error("[API_ERR]", e.message, e.stack); res.status(500).json(fail(500, e.message)); }
});
app.get('/admin/schedule', masterAuth, (req, res) => { res.json(ok(scheduledTasks)); });
app.delete('/admin/schedule/:id', masterAuth, (req, res) => {
  const i = scheduledTasks.findIndex(t => t.id === req.params.id);
  if (i === -1) return res.status(404).json(fail(404));
  scheduledTasks.splice(i,1); saveTasks();
  res.json(ok(null));
});
app.get('/api/server/info', (req, res) => {
  const os = require('os');
  res.json(ok({
    name: process.env.MACHINE_NAME || '主服务器',
    host: require('os').hostname(),
    version: '1.1.0',
    uptime: process.uptime(),
    online: true
  }));
});
// ===== IP 黑名单 =====
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked-ips.json');
let blockedIps = new Set();
let blockedCount = 0;
function loadBlocked() {
  try {
    if (fs.existsSync(BLOCKED_FILE)) {
      const d = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
      if (Array.isArray(d)) { blockedIps = new Set(d); blockedCount = d.length; }
    }
  } catch (e) { blockedIps = new Set(); }
}
function saveBlocked() {
  try { fs.writeFileSync(BLOCKED_FILE, JSON.stringify([...blockedIps], null, 2)); } catch (e) {}
}
// ===== 6. API 限流保护 =====
const rateLimitMap = new Map();
app.use((req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/admin')) return next();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分钟窗口
  const maxReqs = 60;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return next();
  }
  
  const entry = rateLimitMap.get(ip);
  if (now - entry.start > windowMs) {
    entry.count = 1;
    entry.start = now;
    return next();
  }
  
  entry.count++;
  if (entry.count > maxReqs * 3) {
    // 超过限流3倍，自动拉黑
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    blockedIps.add(ip);
    saveBlocked();
    console.log('[封禁] IP ' + ip + ' 因请求过于频繁被自动封禁');
    return res.status(403).json(fail(403, '您的IP已被封禁'));
  }
  if (entry.count > maxReqs) {
    return res.status(429).json(fail(429, '请求过于频繁，请稍后再试'));
  }
  next();
});

// ===== 7. API 统计埋点（管理后台能看到总调用量） =====
const apiStats = { total: 0, byPath: {}, today: 0, todayDate: new Date().toDateString() };
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/logs')) return next();
  apiStats.total++;
  const p = req.path.split('?')[0];
  apiStats.byPath[p] = (apiStats.byPath[p] || 0) + 1;
  const today = new Date().toDateString();
  if (apiStats.todayDate !== today) { apiStats.today = 0; apiStats.todayDate = today; }
  apiStats.today++;
  next();
});
// ===== 8. 404 兜底 =====
app.use((req, res) => {
  res.status(404).json(fail(404, '接口不存在: ' + req.method + ' ' + req.path));
});
// ===== 9. 全局错误处理 =====
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message || err);
  res.status(500).json(fail(500, err.message || '服务器内部错误'));
});
load();
loadPersistedNameMap();
loadBlocked();
loadNotices();
loadFeedbacks();
refreshAll();
setInterval(refreshAll, 30 * 60 * 1000);
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
  setTimeout(updateNameMap, 5000);
  setInterval(updateNameMap, 120 * 60 * 1000);
  console.log('NameMap task started');