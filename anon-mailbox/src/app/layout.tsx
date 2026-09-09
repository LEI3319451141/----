import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "匿名建议信箱",
  description: "多班级匿名建议反馈系统——身份保密，畅所欲言",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
