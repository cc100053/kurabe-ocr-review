import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kurabe OCR Review",
  description: "OCR closed-loop review dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant-HK">
      <body>
        <nav>
          <span className="brand">🔍 Kurabe OCR 審查</span>
          <Link href="/">審查佇列</Link>
          <Link href="/products">同款商品</Link>
          <Link href="/support">客服</Link>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
