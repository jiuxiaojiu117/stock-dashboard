# 盯盘工作台 + 同花顺 iFinD 代理 镜像
# 说明：server.js 仅用 Node 内置模块，无需 npm install
FROM node:20-alpine

WORKDIR /app

# 复制运行所需文件（注意：不要把 .env 打进镜像，token 应通过环境变量/挂载注入）
COPY server.js ./
COPY stock-dashboard.html ./
COPY package.json ./

# 运行时通过以下任一方式注入 token：
#   1) 环境变量： docker run -e IFIND_REFRESH_TOKEN=你的token -p 3000:3000 <image>
#   2) 挂载 .env： docker run -v $(pwd)/.env:/app/.env -p 3000:3000 <image>
# server.js 优先使用已存在的环境变量，其次读同目录 .env
EXPOSE 3000

CMD ["node", "server.js"]
