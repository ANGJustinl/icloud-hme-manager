import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 带原生编译/复杂依赖的包，排除出 webpack 打包，由 Node 运行时加载
  serverExternalPackages: ["better-sqlite3", "imapflow"],
  // 生成 standalone 产物，配合 Docker multi-stage 做最小化运行时镜像
  output: "standalone",
  // 禁用图片优化（无需），减少部署体积
  images: { unoptimized: true },
};

export default nextConfig;
