'use strict';
/**
 * Vercel Serverless Function —— 东方财富 JSON 代理
 * -------------------------------------------------------------
 * 路由自动映射到 /api/em（Vercel 会把 api/ 下的文件编译为函数，
 * 优先于静态托管，因此前端 stock-dashboard.html 无需任何改动即可使用）。
 *
 * 前端调用示例： /api/em?path=/api/qt/clist/get&pn=1&pz=5&fs=m:0+t:6&fields=f12,f3
 *   - path : 东方财富接口路径（默认 /api/qt/clist/get）
 *   - 其余参数原样透传（pn/pz/fs/fields/fid/po/...）
 *
 * 为何需要它：东方财富 clist 等接口不支持 JSONP（cb 参数无效）且无 CORS 头，
 * 浏览器直连会被拦；走服务端转发后同源请求即可正常取数，涨跌家数/涨停跌停最稳。
 */
module.exports = async function handler(req, res) {
  try {
    const params = req.query || {};
    const emPath = params.path || '/api/qt/clist/get';

    // 组装透传参数（剔除 path 本身）
    const q = new URLSearchParams();
    Object.keys(params).forEach(k => {
      if (k === 'path') return;
      const v = params[k];
      if (Array.isArray(v)) v.forEach(x => q.append(k, x));
      else q.set(k, v);
    });
    const qs = q.toString();
    const target = 'https://push2.eastmoney.com' + emPath + (qs ? '?' + qs : '');

    const r = await fetch(target, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://quote.eastmoney.com/'
      },
      signal: AbortSignal.timeout(12000)
    });

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(buf);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 502;
    res.end(JSON.stringify({ error: msg }));
  }
};
