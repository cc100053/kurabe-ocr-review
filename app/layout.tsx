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
          <span className="brand">🔍 Kurabe OCR Review</span>
          <Link href="/confusion">Confusion</Link>
          <Link href="/correction-samples">Correction Samples</Link>
          <Link href="/suspicious">Suspicious Untouched</Link>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
