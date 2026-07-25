"use client";

import { PersonnelTestActivityBlock } from "@/components/personnel/PersonnelTestActivityBlock";
import type { ProfileTestActivityData } from "@/lib/profile-test-activity";

export function ProfileTestStatsCharts({ activity }: { activity: ProfileTestActivityData }) {
  const hasData = activity.activitySummary.some((item) => item.value > 0);

  return (
    <article className="card" style={{ marginTop: 12 }}>
      <div className="card-body">
        <h3>Статистика по тестам</h3>
        {hasData ? (
          <PersonnelTestActivityBlock
            activityByMonth={activity.activityByMonth}
            activitySummary={activity.activitySummary}
          />
        ) : (
          <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
            Нет данных по тестам.
          </p>
        )}
      </div>
    </article>
  );
}
