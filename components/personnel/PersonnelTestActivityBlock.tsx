"use client";

import { useMemo } from "react";
import {
  filterPersonnelActivityByMonth,
  filterPersonnelActivitySummary,
  PersonnelActivityLegend,
  PersonnelMiniBarChart,
  PersonnelPieChart,
  personnelActivityPieData,
  PersonnelStackedBarChart,
  type PersonnelActivityMonth,
  type PersonnelActivitySegment,
} from "@/components/personnel/PersonnelIcons";

export function PersonnelTestActivityBlock({
  activityByMonth,
  activitySummary,
}: {
  activityByMonth: PersonnelActivityMonth[];
  activitySummary: PersonnelActivitySegment[];
}) {
  const testSummary = useMemo(
    () => filterPersonnelActivitySummary(activitySummary, "test"),
    [activitySummary],
  );
  const testByMonth = useMemo(() => filterPersonnelActivityByMonth(activityByMonth, "test"), [activityByMonth]);
  const hasData = testSummary.some((item) => item.value > 0);

  if (!hasData) return null;

  return (
    <>
      <div className="grid-two personnel-test-activity-charts" style={{ marginTop: 12 }}>
        <article className="card">
          <div className="card-body">
            <h4 style={{ marginTop: 0, marginBottom: 0 }}>Тесты — по месяцам</h4>
            <PersonnelStackedBarChart data={testByMonth} />
            <PersonnelActivityLegend segments={testSummary} />
          </div>
        </article>
        <article className="card">
          <div className="card-body">
            <h4 style={{ marginTop: 0, marginBottom: 0 }}>Тесты — общая статистика</h4>
            <PersonnelPieChart data={personnelActivityPieData(testSummary)} />
          </div>
        </article>
      </div>
      <div className="personnel-activity-mini-grid personnel-test-activity-mini" style={{ marginTop: 12 }}>
        {testSummary
          .filter((item) => item.value > 0)
          .map((item) => (
            <article key={item.key} className="card personnel-activity-mini-card">
              <div className="card-body">
                <p className="label" style={{ margin: 0 }}>
                  {item.label}
                </p>
                <strong style={{ fontSize: 20 }}>{item.value}</strong>
                <PersonnelMiniBarChart
                  color={item.color}
                  data={testByMonth.map((month) => ({
                    month: month.month,
                    value: month.segments.find((seg) => seg.key === item.key)?.value ?? 0,
                  }))}
                />
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
