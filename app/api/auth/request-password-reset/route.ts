import { NextResponse } from "next/server";
import { passwordResetRedirectUrl } from "@/lib/auth-recovery-server";
import {
  resolveActiveUserAuthEmail,
  resolvePasswordResetRedirectOrigin,
  sendSupabasePasswordResetEmail,
} from "@/lib/auth-login-email-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: "Сброс пароля не настроен на сервере." }, { status: 500 });
  }

  let body: { loginOrEmail?: string } = {};
  try {
    body = (await request.json()) as { loginOrEmail?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
  }

  const loginOrEmail = (body.loginOrEmail ?? "").trim();
  if (!loginOrEmail) {
    return NextResponse.json({ ok: false, error: "Введите логин или email." }, { status: 400 });
  }

  const email = await resolveActiveUserAuthEmail(loginOrEmail, {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  });
  if (!email) {
    return NextResponse.json(
      {
        ok: false,
        error: "Логин не найден в базе профилей. Проверьте логин или укажите email.",
      },
      { status: 404 },
    );
  }

  const origin = resolvePasswordResetRedirectOrigin(request);
  const redirectTo = passwordResetRedirectUrl(origin);
  const sent = await sendSupabasePasswordResetEmail({
    baseUrl: supabaseUrl,
    anonKey: supabaseAnonKey,
    email,
    redirectTo,
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
