import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoScript",
  description: "MoScript｜書法字搜尋、集字與後台匯入 MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
