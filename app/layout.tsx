import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ET Image Studio — Etsy 帽子图片工作台",
  description: "上传产品参考图，先生成低清预览，确认后输出统一风格的 Etsy 高清商品图片组。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
