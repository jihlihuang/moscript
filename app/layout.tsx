import type { Metadata } from "next";
import { Toaster } from "sonner";
import { BackToTopButton } from "@/components/BackToTopButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "墨跡字帖",
  description: "墨跡字帖｜從字形到心境，重新認識書法之美",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-stone-50 text-stone-900 antialiased">
        {children}
        <Toaster position="bottom-right" />
        <BackToTopButton />
      </body>
    </html>
  );
}
