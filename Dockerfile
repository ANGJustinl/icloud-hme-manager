# ==========================================================
# iCloud HME 管理器 - 多阶段 Dockerfile
# ==========================================================
# 阶段 1：deps —— 安装依赖（better-sqlite3 在此阶段从源码编译原生模块）
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# 阶段 2：builder —— 编译 Next.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期不需要真实密钥；Next.js build 不读取运行时密钥
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 阶段 3：runner —— 精简运行时
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 数据目录（SQLite 文件），对应 docker-compose 挂载卷
ENV DATA_DIR=/app/data

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# better-sqlite3 是原生模块，standalone 不一定带上，从 deps 拷过来更稳妥
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# 数据目录
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# 健康检查：探 /api/health（探 SQLite 连通性）。用 node 自带 http，免装 curl/wget。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# standalone server 入口（由 next.config 的 output: standalone 生成）
CMD ["node", "server.js"]
