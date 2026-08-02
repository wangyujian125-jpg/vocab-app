import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出模式，生成纯静态文件，可部署到 Cloudflare Pages 等平台
  output: 'export',
  // 图片优化在静态导出时需要禁用
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
