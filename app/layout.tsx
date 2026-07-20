import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ССП ПВО",
  description: "Закрытая обучающая платформа",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="dark">
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

              (function () {
                var reloadKey = 'ssp-chunk-reload';
                function isChunkFailure(message, target) {
                  var text = String(message || '');
                  if (/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(text)) {
                    return true;
                  }
                  if (!target) return false;
                  var src = target.src || target.href || '';
                  return /\\/_next\\/static\\/chunks\\//.test(src);
                }
                function reloadOnce() {
                  if (sessionStorage.getItem(reloadKey)) return false;
                  sessionStorage.setItem(reloadKey, '1');
                  window.location.reload();
                  return true;
                }
                window.addEventListener('error', function (event) {
                  if (isChunkFailure(event.message || (event.error && event.error.message), event.target)) {
                    reloadOnce();
                  }
                });
                window.addEventListener('unhandledrejection', function (event) {
                  var reason = event.reason;
                  var message = reason && (reason.message || String(reason));
                  if (isChunkFailure(message, null)) {
                    reloadOnce();
                  }
                });
                window.addEventListener('load', function () {
                  sessionStorage.removeItem(reloadKey);
                });
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
