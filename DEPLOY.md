# 盯盘工作台 · 部署与启动指南

数据全部来自**东方财富免费公开接口**，无需任何账号 / token。三种运行方式：

| 方式 | 适用 | 涨跌家数可靠性 | HTTPS（Android 安装） | 是否需要绑卡 |
| --- | --- | --- | --- | --- |
| ① 本机 `server.js` | 电脑本机 / 局域网 | ✅ 服务端 `/api/em` 代理，最稳 | ❌ 需自有域名+证书 | 不需要 |
| ② 云端静态托管（CloudStudio 等） | 公网访问 | ⚠️ 浏览器 CORS 代理兜底 | ✅ 平台自带 HTTPS | 不需要 |
| ③ 云端运行代理版（**Vercel**） | 公网 + 最稳 + **免绑卡** | ✅ 服务端 `/api/em` 代理 | ✅ 平台自带 HTTPS | ✅ **免费套餐无需绑卡** |
| ④ 云端运行 server.js（Render/VPS） | 公网 + 最稳 | ✅ 服务端代理 | ✅ 平台自带 HTTPS | ⚠️ Render 免费需绑卡验证 |

> ⚠️ **重要**：CloudStudio 等静态托管平台**无法运行 Node / 后端服务**（平台限制），
> 所以「云端静态版（②）」永远拿不到服务端代理，涨跌家数只能靠浏览器侧公共 CORS 代理兜底，偶发 `—`。
> 要做到「涨跌家数最稳」，必须把云端升级为**真正运行服务端代理的完整版（③ / ④）**：
> - **Vercel（③，推荐）**：免费套餐**无需绑卡**，Serverless Functions 原生支持 Node.js 代理，GitHub 一键导入部署，约 2 分钟。👉 见下方「三、方式 C」。
> - **Render（④）**：功能完全一致，但**免费套餐现在要求先绑信用卡做 $1 身份验证**（不扣费），不想绑卡请走 Vercel。👉 见 **[DEPLOY-RENDER.md](DEPLOY-RENDER.md)**。

---

## 一、本机运行（最稳，含服务端代理）

1. 安装 Node.js（https://nodejs.org，勾选 Add to PATH）。
2. 解压 `stock-dashboard-local.zip`，双击 `start.bat`（自动启动并打开 `http://localhost:3000`）。
   或命令行：`node server.js` → 浏览器访问 `http://localhost:3000`。
3. 手机同 WiFi 时，把 `localhost` 换成电脑局域网 IP（如 `http://192.168.1.20:3000`）。
   - 注意：必须经 `http://localhost:3000` 访问，不要直接双击 HTML 用 `file://` 打开（代理不生效，涨跌家数会变 `—`）。

`server.js` 作用：① 同源托管页面（无 CORS 限制）② 代理东方财富 `clist` 等接口（`/api/em`，这些接口不支持 JSONP 也无 CORS 头，必须服务端转发）。

---

## 二、云端静态托管（已为你部署，立即可用）

已部署一个带 HTTPS 的静态实例，手机直接打开即可“添加到主屏幕”：

> 🔗 https://d2d195ba9c794f2ab10b1ce7092ad74d.bj5.agentos-app.net

- 界面、实时行情、PWA（图标 / manifest / Service Worker）均正常；
- 「涨跌家数 / 涨停跌停」走浏览器侧 CORS 代理兜底，**正常网络下可用**，但极端网络环境可能变 `—`（这是静态托管无服务端代理的固有局限）。

如需自行重新部署静态版：把 `dist/` 目录（含 `index.html` + PWA 资源）上传到任意静态托管（CloudStudio / GitHub Pages / Vercel / Netlify 等），入口设为 `index.html` 即可。

---

## 三、云端运行 server.js（Render / VPS，最稳 + HTTPS）

适合想要「涨跌家数也最稳」且公网 HTTPS 的场景。

### 方式 A：Render 免费版
1. 把本目录（**不含 `.env`**）推到 GitHub/GitLab：
   ```bash
   git init
   git add server.js stock-dashboard.html package.json manifest.webmanifest sw.js \
           icon-192.png icon-512.png icon-maskable-512.png .gitignore
   git commit -m "stock dashboard"
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
2. 登录 [render.com](https://render.com) → **New** → **Blueprint**，选择该仓库；`render.yaml` 会被自动识别。
3. 点 **Deploy**，约 1–2 分钟拿到 `https://stock-dashboard-xxx.onrender.com`。
4. 手机打开该 HTTPS 链接即可安装。

> 免费实例空闲约 15 分钟后休眠，首次访问有约 30 秒冷启动；交易时段内页面每 5 秒轮询会保持活跃。

### 方式 B：Docker / 自有 VPS
```bash
docker build -t stock-dash .
docker run -d -p 3000:3000 --name stock-dash stock-dash
# 用 Nginx/Caddy 反代到 443 并配证书（Let's Encrypt）即获 HTTPS
```

### 方式 C：Vercel（免绑卡，推荐）
> 免费套餐**无需绑卡**，Serverless Functions 原生运行 `/api/em` 代理，涨跌家数最稳，GitHub 一键导入约 2 分钟。

1. 仓库已就绪（含 `api/em.js` 代理 + `vercel.json` 配置），直接导入：
   - 登录 [vercel.com](https://vercel.com) → **Add New…** → **Project**
   - **Import Git Repository** 选 **`jiuxiaojiu117/stock-dashboard`**（或你自己 fork 的仓库）
   - Framework Preset 选 **Other**；Build Command 已内置（`cp stock-dashboard.html index.html`）；Output 默认根目录即可
   - 点 **Deploy**，约 1–2 分钟拿到 `https://stock-dashboard-xxx.vercel.app`
2. 验证代理是否真通（决定涨跌家数是否最稳）：
   ```bash
   curl -s "https://你的地址.vercel.app/api/em?path=/api/qt/clist/get&pn=1&pz=5&fs=m:0+t:6&fields=f12,f3" | head -c 300
   ```
   返回含 `"data":{"diff":[...]}` 即代表云端服务端代理生效、涨跌家数最稳。

> Vercel 免费套餐函数有每日请求额度与冷启动（首次访问约 1–3 秒），交易时段每 5 秒轮询会保持活跃。

---

## 四、Android 添加到主屏幕（PWA 安装）

- **最省事**：直接用「二 / 三」里的 HTTPS 链接，Android Chrome 打开后点右上「⋮」→「安装应用」。
- iPhone（Safari）：分享 →「添加到主屏幕」，HTTP 也可。

---

## 五、文件清单

| 文件 | 作用 |
| --- | --- |
| `stock-dashboard.html` | 主程序（单文件，内联 CSS/JS，无外部 CDN，已适配手机） |
| `server.js` | 本地 / 云端服务：静态托管 + 东方财富 `/api/em` 代理（零依赖） |
| `start.bat` / `package.json` | 一键启动 / npm 元信息 |
| `manifest.webmanifest` | PWA 清单 |
| `sw.js` | Service Worker（缓存外壳，支持离线启动 + 安装） |
| `icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | 应用图标 |
| `dist/` | 静态部署目录（已含 `index.html` + PWA 资源） |
| `render.yaml` / `Dockerfile` / `vercel.json` | Render / Docker / Vercel 部署配置 |
| `api/em.js` | Vercel Serverless Function：`/api/em` 东方财富代理（云端代理版核心） |
| `README.md` / `DEPLOY.md` / `DEPLOY-RENDER.md` | 说明 |

数据来源：东方财富。本工具仅供个人学习研究，不构成投资建议。
