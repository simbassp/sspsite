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
    accessToken: search.get("access_token") || hash.get("access_token"),
    refreshToken: search.get("refresh_token") || hash.get("refresh_token"),
    code: search.get("code"),
    tokenHash: search.get("token_hash") || search.get("token"),
    type: search.get("type") || hash.get("type"),
  };
}

export function readRecoveryErrorFromQuery() {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("recovery_error");
  return raw ? decodeURIComponent(raw) : "";
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

/** До React: hash → reset-password; code/token → серверный /auth/recovery (мобильная почта). */
export function recoveryRedirectScript() {
  return `(function(){try{var path=window.location.pathname||"/";if(path==="/reset-password"||path==="/auth/recovery")return;var hash=window.location.hash||"";var search=window.location.search||"";var params=new URLSearchParams(hash.replace(/^#/,""));var searchParams=new URLSearchParams(search);var hashRecovery=params.get("type")==="recovery"||params.has("access_token");var queryRecovery=searchParams.get("type")==="recovery"||searchParams.has("code")||searchParams.has("token_hash")||searchParams.has("token")||(searchParams.has("access_token")&&searchParams.has("refresh_token"));if(!hashRecovery&&!queryRecovery)return;if(queryRecovery&&(searchParams.has("code")||searchParams.has("token_hash")||searchParams.has("token"))){window.location.replace("/auth/recovery"+search);return;}window.location.replace("/reset-password"+search+hash);}catch(e){}})();`;
}
