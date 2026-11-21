import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하루 대시보드",
  description: "루틴, 할 일, 지출을 한눈에 관리하는 개인 대시보드",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
