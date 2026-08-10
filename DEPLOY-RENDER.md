# 云端「运行 server.js 的完整代理版」部署指南（涨跌家数最稳）

> 目标：把工作台部署成一个**真正运行 `server.js` 的 Node 服务**，由服务端同源代理东方财富 `/api/em`，
> 这样「涨跌家数 / 涨停跌停」不再依赖浏览器侧公共 CORS 代理，最稳。
>
> ⚠️ 注意：**CloudStudio 静态托管无法运行 Node / 后端**（平台限制），所以静态版永远走浏览器 CORS 兜底。
> 要跑 `server.js` 必须用一个能运行 Node 的云平台 —— 推荐 **Render**（免费、自带 HTTPS、识别 `render.yaml`）。

---

## 已为你准备好的内容（本仓库已提交）

- `server.js`：静态托管 + 东方财富 `/api/em` 代理 + `/api/health` 健康检查；已绑定 `0.0.0.0`、读 `PORT` 环境变量。
- `stock-dashboard.html`：主程序（同 dist 内容一致）。
- `package.json`：`npm start` → `node server.js`，`engines.node >=18`。
- `render.yaml`：Render Blueprint 配置（`runtime: node`、`healthCheckPath: /api/health`）。
- `Dockerfile`：备用，VPS / 任意容器平台可用。
- PWA 资源：`manifest.webmanifest` / `sw.js` / `icon-*.png`。

无需任何 token；`.env`（iFinD）为可选项，缺失时纯用东方财富免费数据，涨跌家数照常可用。

---

## 方式一：Render 免费版（最简单，2 分钟）

### 1. 推到 GitHub（仓库已 `git commit` 完成，只差推送）

在本机（或任意有网络的电脑）执行：

```bash
# 1) 去 https://github.com/new 新建一个空仓库，拿到仓库地址（不要勾 README/.gitignore）
# 2) 关联并推送（在本项目目录执行）：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

> 如果提示没有 GitHub 凭证：用 `gh auth login`（GitHub CLI）或在推送时粘贴 Personal Access Token 作为密码。

### 2. Render 一键部署

1. 登录 https://render.com → **New** → **Blueprint**。
2. 连接你的 GitHub 账号，选中刚才的仓库。
3. Render 会自动读取 `render.yaml`，显示 `stock-dashboard` 这个 Web Service。
4. 点 **Apply** / **Deploy**，约 1–2 分钟构建完成。
5. 拿到地址：`https://stock-dashboard-xxx.onrender.com`（自带 HTTPS）。

### 3. 手机安装

Android Chrome 打开该 HTTPS 链接 → 右上「⋮」→「安装应用」。
iPhone Safari：分享 →「添加到主屏幕」。

> 免费实例空闲约 15 分钟会休眠，首次访问冷启动约 30 秒；交易时段内每 5 秒轮询会保持活跃。
> 若需常驻，可在 Render 升级为付费实例，或改用下面的 VPS / Docker 方式。

---

## 方式二：Docker / 自有 VPS（常驻、可控）

```bash
# 构建镜像（server.js 仅用 Node 内置模块，无需 npm install）
docker build -t stock-dash .
docker run -d --restart unless-stopped -p 3000:3000 --name stock-dash stock-dash
```

然后用 Nginx / Caddy 反代到 443 并配 Let's Encrypt 证书即获 HTTPS：
```nginx
# 例：/etc/nginx/conf.d/stock.conf
server {
  listen 443 ssl;
  server_name stock.yourdomain.com;
  ssl_certificate     /path/fullchain.pem;
  ssl_certificate_key /path/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

可选注入 iFinD token（不填也能用，仅增强）：
```bash
docker run -d -p 3000:3000 -e IFIND_REFRESH_TOKEN=你的token --name stock-dash stock-dash
```

---

## 验证部署成功

部署后用浏览器/命令行确认：

```bash
# 1) 页面可访问
curl -s -o /dev/null -w "%{http_code}" https://你的地址/
# 期望 200

# 2) 健康检查
curl -s https://你的地址/api/health
# 期望 {"ok":true,"ts":...}

# 3) 代理可用（关键：决定涨跌家数是否最稳）
curl -s "https://你的地址/api/em?path=/api/qt/clist/get&pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6&fields=f12,f3" | head -c 300
# 期望返回东方财富原始 JSON（含 "data":{"diff":[...]}），而不是 {"error":"..."}
```

只要第 3 步返回真实 JSON，说明服务端代理生效，涨跌家数即为「最稳」状态。

---

## 与静态版的区别

| 维度 | CloudStudio 静态版 | 本「server.js 完整代理版」 |
| --- | --- | --- |
| 运行方式 | 平台静态服务器 | 真正运行 `node server.js` |
| `/api/em` 代理 | ❌ 无（404，走浏览器 CORS 兜底） | ✅ 服务端同源代理 |
| 涨跌家数稳定性 | ⚠️ 依赖公共 CORS 代理，偶发 `—` | ✅ 服务端直连东财，最稳 |
| HTTPS | ✅ 平台自带 | ✅ 平台自带（Render）/ 自建 |
| 是否需要 token | 否 | 否（iFinD 可选） |
