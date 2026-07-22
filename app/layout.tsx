import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { normalizeThemePreference, THEME_COOKIE } from "@/lib/theme-preference";
import "./globals.css";

export const metadata: Metadata = {
  title: "ССП ПВО",
  description: "Закрытая обучающая платформа",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )ssp-theme=(dark|light)(?:;|$)/);var t=m&&(m[1]==="light"||m[1]==="dark")?m[1]:"dark";document.documentElement.setAttribute("data-theme",t);localStorage.setItem("ssp-theme",t);if(!m){document.cookie="ssp-theme="+t+"; path=/; max-age=31536000; SameSite=Lax";}}catch(e){}})();`;

const chunkReloadScript = `(function(){var reloadKey="ssp-chunk-reload";function isChunkFailure(message,target){var text=String(message||"");if(/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(text)){return true;}if(!target)return false;var src=target.src||target.href||"";return/\\/_next\\/static\\/(chunks|css)\\//.test(src);}function isHydrationFailure(message){return /Minified React error #418|Hydration failed|did not match/i.test(String(message||""));}function reloadOnce(){if(sessionStorage.getItem(reloadKey))return false;sessionStorage.setItem(reloadKey,"1");window.location.reload();return true;}window.addEventListener("error",function(event){var target=event.target;if(target&&target.tagName==="LINK"){var href=target.href||"";if(href.indexOf("/_next/static/css/")!==-1){reloadOnce();return;}}var message=event.message||(event.error&&event.error.message);if(isChunkFailure(message,target)||isHydrationFailure(message)){reloadOnce();return;}},true);window.addEventListener("unhandledrejection",function(event){var reason=event.reason;var message=reason&&(reason.message||String(reason));if(isChunkFailure(message,null)||isHydrationFailure(message)){reloadOnce();}});window.addEventListener("load",function(){sessionStorage.removeItem(reloadKey);});})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = normalizeThemePreference(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html lang="ru" data-theme={theme} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="ssp-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <Script id="ssp-chunk-reload" strategy="beforeInteractive">
          {chunkReloadScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
