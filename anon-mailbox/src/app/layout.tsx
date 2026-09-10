import type { Metadata, Viewport } from "next";
import "./globals.css";
import UpdateToast from "@/components/UpdateToast";

export const metadata: Metadata = {
  title: "匿名建议信箱",
  description: "多班级匿名建议反馈系统——身份保密，畅所欲言",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "建议信箱",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#007aff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <UpdateToast />
      </body>
    </html>
  );
}
