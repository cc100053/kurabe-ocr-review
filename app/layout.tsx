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
    <html lang="en">
      <body>
        <nav>
          <span className="brand">🔍 Kurabe OCR 審查</span>
          <Link href="/">審查佇列</Link>
          <Link href="/stats">統計</Link>
          <Link href="/receipt">收據</Link>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
