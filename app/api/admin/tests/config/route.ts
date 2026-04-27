import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type Body = {
  trialQuestionCount?: unknown;
  finalQuestionCount?: unknown;
  timePerQuestionSec?: unknown;
  uavAutoGeneration?: unknown;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function normalizeInput(body: Body) {
  const trial = Math.max(1, Number(body.trialQuestionCount || 10));
  const final = Math.max(1, Number(body.finalQuestionCount || 15));
  const time = Math.max(5, Number(body.timePerQuestionSec || 10));
  const uav = body.uavAutoGeneration !== false;
  return { trialQuestionCount: trial, finalQuestionCount: final, timePerQuestionSec: time, uavAutoGeneration: uav };
}

async function readCurrentConfig(supabase: ReturnType<typeof getServerSupabaseServiceClient>) {
  let q = await supabase
    .from("test_settings")
    .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((q.error || !q.data) && isMissingColumnError(q.error?.message)) {
    q = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (q.error || !q.data) {
    q = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .eq("id", 1)
      .limit(1)
      .maybeSingle();
  }
  if ((q.error || !q.data) && isMissingColumnError(q.error?.message)) {
    q = await supabase
      .from("test_settings")
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  return q;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Body;
    const input = normalizeInput(body);
    const supabase = getServerSupabaseServiceClient();

    const fullPayload = {
      id: 1,
      trial_question_count: input.trialQuestionCount,
      final_question_count: input.finalQuestionCount,
      time_per_question_sec: input.timePerQuestionSec,
      uav_auto_generation: input.uavAutoGeneration,
      updated_at: new Date().toISOString(),
    };

    let saveQ = await supabase
      .from("test_settings")
      .upsert(fullPayload, { onConflict: "id" })
      .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
      .single();

    if (saveQ.error && isMissingColumnError(saveQ.error.message)) {
      const withoutUpdatedAt = {
        id: 1,
        trial_question_count: input.trialQuestionCount,
        final_question_count: input.finalQuestionCount,
        time_per_question_sec: input.timePerQuestionSec,
        uav_auto_generation: input.uavAutoGeneration,
      };
      saveQ = await supabase
        .from("test_settings")
        .upsert(withoutUpdatedAt, { onConflict: "id" })
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .single();
    }

    if (saveQ.error && isMissingColumnError(saveQ.error.message)) {
      const noIdPayload = {
        trial_question_count: input.trialQuestionCount,
        final_question_count: input.finalQuestionCount,
        time_per_question_sec: input.timePerQuestionSec,
        uav_auto_generation: input.uavAutoGeneration,
      };
      let updated = await supabase
        .from("test_settings")
        .update(noIdPayload)
        .gt("trial_question_count", -1)
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .limit(1);
      if (!updated.error && (!updated.data || updated.data.length === 0)) {
        updated = await supabase
          .from("test_settings")
          .insert(noIdPayload)
          .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
          .limit(1);
      } else if ((updated.error || !updated.data || updated.data.length === 0) && isMissingColumnError(updated.error?.message)) {
        updated = await supabase
          .from("test_settings")
          .insert(noIdPayload)
          .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
          .limit(1);
      }
      if (!updated.error && updated.data && updated.data.length > 0) {
        const row = updated.data[0];
        return Response.json({
          ok: true,
          config: {
            trialQuestionCount: Number(row.trial_question_count ?? input.trialQuestionCount),
            finalQuestionCount: Number(row.final_question_count ?? input.finalQuestionCount),
            timePerQuestionSec: Number(row.time_per_question_sec ?? input.timePerQuestionSec),
            uavAutoGeneration:
              typeof row.uav_auto_generation === "boolean" ? row.uav_auto_generation : input.uavAutoGeneration,
          },
        });
      }
    }

    if (saveQ.error && isMissingColumnError(saveQ.error.message)) {
      const withoutUav = {
        id: 1,
        trial_question_count: input.trialQuestionCount,
        final_question_count: input.finalQuestionCount,
        time_per_question_sec: input.timePerQuestionSec,
      };
      saveQ = await supabase
        .from("test_settings")
        .upsert(withoutUav, { onConflict: "id" })
        .select("trial_question_count,final_question_count,time_per_question_sec")
        .single();
    }

    if (saveQ.error && isMissingColumnError(saveQ.error.message)) {
      const legacy = {
        id: 1,
        trial_question_count: input.trialQuestionCount,
        final_question_count: input.finalQuestionCount,
      };
      const legacyQ = await supabase
        .from("test_settings")
        .upsert(legacy, { onConflict: "id" })
        .select("trial_question_count,final_question_count")
        .single();
      if (legacyQ.error) return Response.json({ ok: false, error: legacyQ.error.message || "save_config_failed" }, { status: 500 });
      return Response.json({
        ok: true,
        config: {
          trialQuestionCount: Number(legacyQ.data?.trial_question_count ?? input.trialQuestionCount),
          finalQuestionCount: Number(legacyQ.data?.final_question_count ?? input.finalQuestionCount),
          timePerQuestionSec: input.timePerQuestionSec,
          uavAutoGeneration: input.uavAutoGeneration,
        },
      });
    }

    if (saveQ.error) return Response.json({ ok: false, error: saveQ.error.message || "save_config_failed" }, { status: 500 });
    const currentQ = await readCurrentConfig(supabase);
    const current = currentQ.data || saveQ.data;
    return Response.json({
      ok: true,
      config: {
        trialQuestionCount: Number(current?.trial_question_count ?? input.trialQuestionCount),
        finalQuestionCount: Number(current?.final_question_count ?? input.finalQuestionCount),
        timePerQuestionSec: Number(current?.time_per_question_sec ?? input.timePerQuestionSec),
        uavAutoGeneration:
          typeof current?.uav_auto_generation === "boolean" ? current.uav_auto_generation : input.uavAutoGeneration,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "save_config_exception" },
      { status: 500 },
    );
  }
}
