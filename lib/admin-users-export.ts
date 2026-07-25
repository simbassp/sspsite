import { dutyLocationLabel } from "@/lib/duty-location";
import { positionDisplayLabel } from "@/lib/position-ui";
import {
  unitAssignmentLabel,
  type UnitAssignmentFilter,
} from "@/lib/unit-assignment";
import type { DutyLocation, Position, UnitAssignment } from "@/lib/types";

export type AdminUsersExportFilterConfig = {
  search: string;
  position: "all" | Position;
  duty: "all" | DutyLocation;
  unit: UnitAssignmentFilter;
};

export type AdminUsersExportRow = {
  name: string;
  callsign: string;
  position: string;
  unit: string;
};

export function parseAdminUsersExportFilterConfig(raw: {
  search?: unknown;
  position?: unknown;
  duty?: unknown;
  unit?: unknown;
}): AdminUsersExportFilterConfig {
  const search = typeof raw.search === "string" ? raw.search.trim() : "";
  const positionRaw = typeof raw.position === "string" ? raw.position : "all";
  const dutyRaw = typeof raw.duty === "string" ? raw.duty : "all";
  const unitRaw = typeof raw.unit === "string" ? raw.unit : "all";

  return {
    search,
    position: positionRaw === "all" ? "all" : (positionRaw as Position),
    duty: dutyRaw === "deployment" ? "deployment" : dutyRaw === "base" ? "base" : "all",
    unit:
      unitRaw === "unset"
        ? "unset"
        : unitRaw === "all"
          ? "all"
          : (unitRaw as UnitAssignment),
  };
}

export function buildAdminUsersExportFilterLines(config: AdminUsersExportFilterConfig): string[] {
  const lines: string[] = [];

  if (config.search) {
    lines.push(`Поиск: ${config.search}`);
  }

  if (config.position === "all") {
    lines.push("Д: все");
  } else {
    lines.push(`Д: ${positionDisplayLabel(config.position)}`);
  }

  if (config.duty === "all") {
    lines.push("М: все");
  } else {
    lines.push(`М: ${dutyLocationLabel[config.duty]}`);
  }

  if (config.unit === "all") {
    lines.push("П: все");
  } else if (config.unit === "unset") {
    lines.push("П: не указано");
  } else {
    lines.push(`П: ${unitAssignmentLabel[config.unit]}`);
  }

  return lines;
}

export function mapAdminUsersExportRow(input: {
  name: string | null | undefined;
  callsign: string | null | undefined;
  position: string | null | undefined;
  unitAssignment: UnitAssignment | null | undefined;
}): AdminUsersExportRow {
  return {
    name: (input.name ?? "").trim() || "—",
    callsign: (input.callsign ?? "").trim() || "—",
    position: positionDisplayLabel(input.position ?? ""),
    unit: input.unitAssignment ? unitAssignmentLabel[input.unitAssignment] : "—",
  };
}
