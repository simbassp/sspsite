import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ССП ПВО",
  description: "Закрытая обучающая платформа",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="dark" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('ssp-theme');
                if (saved === 'light' || saved === 'dark') {
                  document.documentElement.setAttribute('data-theme', saved);
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
