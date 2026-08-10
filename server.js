#!/usr/bin/env node
/**
 * 股票盯盘工作台 —— 本地运行服务（零依赖，纯 Node 内置模块）
 * -------------------------------------------------------------
 * 作用：
 *   1) 托管 stock-dashboard.html（同源，浏览器无 CORS 限制）
 *   2) 代理东方财富接口 /api/em（clist 等接口不支持 JSONP、也无 CORS 头，必须走服务端转发）
 * 运行：node server.js   （需 Node.js 18+，已加入 PATH）
 * 访问：http://localhost:3000   （手机用同 WiFi 的电脑局域网 IP 访问）
 * 说明：.env 中的同花顺 iFinD token 为可选项；缺省时纯用东方财富免费数据，涨跌家数/涨停跌停照常可用。
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

/* ---------- 加载 .env（本地保管 token，绝不进前端） ---------- */
const envPath = path.join(__dirname, '.env');
try {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (e) {}
const REFRESH_TOKEN = (process.env.IFIND_REFRESH_TOKEN || '').trim();
const PORT = parseInt(process.env.PORT || '3000', 10);
const IFIND = 'https://ft.10jqka.com.cn';

/* ---------- iFinD access_token 缓存（有效期 7 天，第 6 天刷新） ---------- */
let accessToken = null;
let tokenExpireAt = 0;

function logRaw(tag, obj) {
  try {
    const f = path.join(__dirname, 'ifind-debug.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 1024 * 1024) fs.writeFileSync(f, '');
    fs.appendFileSync(f, `\n[${new Date().toISOString()}] ${tag}\n` + JSON.stringify(obj) + '\n');
  } catch (e) {}
}

function ifindRequest(apiPath, body, useToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(IFIND + apiPath);
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (useToken && accessToken) headers['access_token'] = accessToken;
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method: 'POST', headers, timeout: 15000
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('PARSE_FAIL:' + buf.slice(0, 300))); } });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function ensureToken() {
  if (accessToken && Date.now() < tokenExpireAt) return accessToken;
  if (!REFRESH_TOKEN) throw new Error('NO_TOKEN');
  const r = await ifindRequest('/api/v1/get_access_token', { refresh_token: REFRESH_TOKEN }, false);
  logRaw('get_access_token', r);
  const ec = r.errorcode != null ? r.errorcode : (r.error_code != null ? r.error_code : 0);
  if (ec && ec !== 0 && ec !== '0') throw new Error('TOKEN_FAIL:' + (r.errmsg || r.error_info || JSON.stringify(r).slice(0, 200)));
  const tk = r && r.data && r.data.access_token;
  if (!tk) throw new Error('TOKEN_FAIL:' + JSON.stringify(r).slice(0, 300));
  accessToken = tk;
  tokenExpireAt = Date.now() + 6 * 24 * 3600 * 1000;
  return tk;
}

/* ---------- 通用解析工具 ---------- */
function extractRows(r) {
  if (!r || typeof r !== 'object') return [];
  const ec = r.errorcode != null ? r.errorcode : (r.error_code != null ? r.error_code : 0);
  if (ec && ec !== 0 && ec !== '0') return [];
  let d = r.data;
  if (d == null) return [];
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return []; } }
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.tables)) return d.tables;
  if (Array.isArray(d.rows)) return d.rows;
  if (d.return_json) { try { return JSON.parse(d.return_json); } catch (e) {} }
  return [d];
}
function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  const lk = {};
  Object.keys(obj).forEach(k => { lk[k.toLowerCase()] = k; });
  for (const k of keys) { const real = lk[k.toLowerCase()]; if (real != null && obj[real] !== '' && obj[real] != null) return obj[real]; }
  return undefined;
}
function num(v) { if (v == null) return null; const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }

/* ---------- 实时行情 ---------- */
async function handleQuote(codes) {
  await ensureToken();
  const r = await ifindRequest('/ds_service/api/v1/real_time_quotation', {
    codes,
    indicators: 'open,high,low,latest,prev_close,volume,amount,change,change_ratio,name'
  }, true);
  logRaw('quote', r);
  const rows = extractRows(r);
  if (!rows.length) throw new Error('EMPTY:' + JSON.stringify(r).slice(0, 200));
  const data = rows.map(row => {
    const price = num(pick(row, ['latest', 'close', 'LATEST', 'CLOSE']));
    const prev = num(pick(row, ['prev_close', 'pre_close', 'PREV_CLOSE', 'PRE_CLOSE']));
    let chg = num(pick(row, ['change', 'CHANGE', 'chs']));
    let pct = num(pick(row, ['change_ratio', 'CHANGE_RATIO', 'pct', 'changeRatio']));
    if (price != null && prev != null && prev !== 0) { chg = +(price - prev).toFixed(2); pct = +(((price - prev) / prev) * 100).toFixed(2); }
    const mnRaw = pick(row, ['main_net_inflow', 'MAIN_NET_INFLOW', 'main_inflow_net', 'ths_main_net_inflow']);
    return {
      code: (pick(row, ['ths_code', 'THSCODE', 'code', 'CODE']) || '').toString().replace(/\.(SZ|SH)$/i, ''),
      name: pick(row, ['name', 'NAME', 'ths_name']) || '',
      price, pct, chg,
      amount: num(pick(row, ['amount', 'AMOUNT'])) || 0,
      mainNet: mnRaw != null ? num(mnRaw) : null,
      prevClose: prev,
      open: num(pick(row, ['open', 'OPEN'])),
      high: num(pick(row, ['high', 'HIGH'])),
      low: num(pick(row, ['low', 'LOW']))
    };
  });
  return { ok: true, data };
}

/* ---------- 日内分时（1 分钟，前复权 CPS=2） ---------- */
async function handleTrend(code) {
  await ensureToken();
  const t = new Date();
  const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const r = await ifindRequest('/api/v1/cmd_history_quotation', {
    codes: code,
    indicators: 'open,high,low,close,volume',
    startdate: d, enddate: d,
    functionpara: { Interval: '1', Days: 'tradedays', Fill: 'Previous', CPS: '2' }
  }, true);
  logRaw('trend', r);
  const rows = extractRows(r);
  if (!rows.length) throw new Error('EMPTY');
  const prices = [], opens = [], highs = [], lows = [];
  rows.forEach(row => {
    const p = num(pick(row, ['close', 'latest', 'CLOSE', 'LATEST'])) || num(pick(row, ['open', 'OPEN']));
    if (p == null) return;
    prices.push(p);
    opens.push(num(pick(row, ['open', 'OPEN'])));
    highs.push(num(pick(row, ['high', 'HIGH'])));
    lows.push(num(pick(row, ['low', 'LOW'])));
  });
  if (!prices.length) throw new Error('NO_PRICE');
  const hi = Math.max(...prices, ...highs.filter(x => x != null));
  const lo = Math.min(...prices, ...lows.filter(x => x != null));
  return { ok: true, prices, open: prices[0], high: hi, low: lo, last: prices[prices.length - 1], preClose: num(pick(rows[0], ['prev_close', 'PREV_CLOSE'])) };
}

/* ---------- 日 K（前复权 CPS=2，近 120 交易日） ---------- */
async function handleKline(code) {
  await ensureToken();
  const t = new Date();
  const end = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const past = new Date(t.getTime() - 400 * 24 * 3600 * 1000);
  const start = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
  const r = await ifindRequest('/api/v1/cmd_history_quotation', {
    codes: code,
    indicators: 'open,high,low,close,volume',
    startdate: start, enddate: end,
    CPS: '2',
    functionpara: { Interval: 'D', Days: 'tradedays', Fill: 'Previous' }
  }, true);
  logRaw('kline', r);
  const rows = extractRows(r);
  if (!rows.length) throw new Error('EMPTY');
  const last = rows.slice(-120);
  const klines = last.map(row => {
    const date = (pick(row, ['time', 'date', 'datetime', 'TIME', 'DATE']) || '').toString().slice(0, 10);
    const o = num(pick(row, ['open', 'OPEN']));
    const c = num(pick(row, ['close', 'CLOSE', 'latest', 'LATEST']));
    const h = num(pick(row, ['high', 'HIGH']));
    const l = num(pick(row, ['low', 'LOW']));
    const v = num(pick(row, ['volume', 'VOLUME', 'amount', 'AMOUNT'])) || 0;
    return [date, o, c, h, l, v].map(x => x == null ? '' : x).join(',');
  });
  return { ok: true, klines };
}

/* ---------- HTTP 服务 ---------- */
function send(res, obj) { res.end(JSON.stringify(obj)); }
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 健康检查（Render / 容器编排用）
  if (p === '/api/health') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); return send(res, { ok: true, ts: Date.now() }); }
  if (p.startsWith('/api/ifind/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!REFRESH_TOKEN) return send(res, { ok: false, error: 'NO_TOKEN（请在 .env 填入 IFIND_REFRESH_TOKEN）' });
    if (p === '/api/ifind/quote' && req.method === 'POST') {
      let body = ''; req.on('data', d => body += d);
      req.on('end', async () => {
        try { const { codes } = JSON.parse(body || '{}'); send(res, await handleQuote(codes)); }
        catch (e) { send(res, { ok: false, error: String(e.message || e) }); }
      });
      return;
    }
    if (p === '/api/ifind/trend' || p === '/api/ifind/kline') {
      const code = u.searchParams.get('code');
      const fn = p === '/api/ifind/trend' ? handleTrend : handleKline;
      fn(code).then(r => send(res, r)).catch(e => send(res, { ok: false, error: String(e.message || e) }));
      return;
    }
    if (p === '/api/ifind/status') return send(res, { ok: true, tokenConfigured: true, source: 'tonghuashun iFinD' });
    return send(res, { ok: false, error: 'UNKNOWN_API' });
  }
  // 东方财富 JSON 代理（同源，绕过浏览器 CORS；clist 等接口不支持 cb，故走服务端 fetch）
  if (p.startsWith('/api/em')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const emPath = u.searchParams.get('path') || '/api/qt/clist/get';
    const q = new URLSearchParams(u.searchParams);
    q.delete('path');
    const target = 'https://push2.eastmoney.com' + emPath + '?' + q.toString();
    const req = https.get(target, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' }
    }, r => {
      let buf = ''; r.on('data', d => buf += d); r.on('end', () => {
        // 透传东方财富原始 JSON（含 rc/data/diff）
        res.end(buf);
      });
    });
    req.on('timeout', function () { this.destroy(); res.statusCode = 504; res.end('{"error":"timeout"}'); });
    req.on('error', e => { res.statusCode = 502; res.end('{"error":"' + e.message + '"}'); });
    return;
  }
  // 静态托管：默认回退到 stock-dashboard.html
  let fp = p === '/' ? '/stock-dashboard.html' : p;
  const file = path.join(__dirname, fp);
  if (!file.startsWith(__dirname)) { res.statusCode = 403; return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'stock-dashboard.html'), (e2, d2) => {
        if (e2) { res.statusCode = 404; return res.end('not found'); }
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(d2);
      });
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'text/plain; charset=utf-8');
    res.end(data);
  });
});

server.on('error', e => { console.error('服务启动失败:', e.message); process.exit(1); });
// 云端/容器必须绑定 0.0.0.0，否则外部无法访问（Render / Docker 均依赖此）
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 盯盘工作台已启动: http://localhost:${PORT}`);
  console.log('✅ 行情数据：东方财富免费接口（经本机 /api/em 代理转发，无需 token，涨跌家数/涨停跌停可用）');
  if (REFRESH_TOKEN) console.log('ℹ️  已检测到 IFIND_REFRESH_TOKEN，额外启用同花顺 iFinD 真接口（可选）');
  console.log('📌 关闭窗口不会停止服务；停止请结束 node 进程，或用 Ctrl+C 停在本窗口。');
});
process.on('uncaughtException', e => console.error('未捕获异常(已忽略):', e.message));
