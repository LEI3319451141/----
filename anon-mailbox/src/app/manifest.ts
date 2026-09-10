import type { MetadataRoute } from "next";

/** PWA Web App Manifest —— 让手机浏览器可以"添加到主屏幕"安装为应用 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "匿名建议信箱",
    short_name: "建议信箱",
    description: "多班级匿名建议反馈系统——身份保密，畅所欲言",
    start_url: "/login",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f7",
    theme_color: "#007aff",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
