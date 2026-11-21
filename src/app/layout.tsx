import type { Metadata } from "next";
import "./globals.css";

// 앱 화면은 public/index.html(tools/build-web.mjs가 만듦). 이 레이아웃은 없는 주소(404) 같은 Next.js 기본 화면에만 쓰인다.
export const metadata: Metadata = {
  title: "일상 매니저",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ background: "#0d0a22", color: "#f7f4ff" }}>
        {children}
      </body>
    </html>
  );
}
