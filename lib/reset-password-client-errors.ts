export type RecoveryUrlParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
};

export function readRecoveryUrlParams(): RecoveryUrlParams {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, code: null, tokenHash: null, type: null };
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return {
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    code: search.get("code"),
    tokenHash: search.get("token_hash") || search.get("token"),
    type: search.get("type") || hash.get("type"),
  };
}

export function hasRecoveryUrlParams(params: RecoveryUrlParams) {
  return Boolean(
    (params.accessToken && params.refreshToken) || params.code || params.tokenHash,
  );
}

export function mapRecoveryLinkError(raw: string) {
  const msg = raw.toLowerCase();
  if (msg.includes("pkce") || msg.includes("code verifier")) {
    return "Откройте ссылку в том же браузере, где запрашивали сброс, или запросите новую ссылку.";
  }
  if (msg.includes("expired") || msg.includes("invalid") || msg.includes("otp")) {
    return "Ссылка устарела или уже использована. Запросите новую.";
  }
  return raw.trim() || "Не удалось подтвердить ссылку сброса.";
}

/** Сохраняет hash/query ссылки до загрузки React (главная и /login иначе теряют #access_token). */
export function recoveryRedirectScript() {
  return `(function(){try{var path=window.location.pathname||"/";if(path==="/reset-password")return;var hash=window.location.hash||"";var search=window.location.search||"";var params=new URLSearchParams(hash.replace(/^#/,""));var searchParams=new URLSearchParams(search);var hashRecovery=params.get("type")==="recovery"||params.has("access_token");var queryRecovery=searchParams.get("type")==="recovery"||searchParams.has("code")||searchParams.has("token_hash")||searchParams.has("token");if(!hashRecovery&&!queryRecovery)return;window.location.replace("/reset-password"+search+hash);}catch(e){}})();`;
}
