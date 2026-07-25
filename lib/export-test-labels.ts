export const EXPORT_TRIAL_PASSED_LABEL = "Пробный сдал";
export const EXPORT_TRIAL_FAILED_LABEL = "Пробный не сдал";
export const EXPORT_FINAL_PASSED_LABEL = "Итоговый сдал";
export const EXPORT_FINAL_FAILED_LABEL = "Итоговый не сдал";

export const PROFILE_TEST_ACTIVITY_LABELS = {
  trialPassed: EXPORT_TRIAL_PASSED_LABEL,
  trialFailed: EXPORT_TRIAL_FAILED_LABEL,
  finalPassed: EXPORT_FINAL_PASSED_LABEL,
  finalFailed: EXPORT_FINAL_FAILED_LABEL,
} as const;

export type ProfileTestActivityKey = keyof typeof PROFILE_TEST_ACTIVITY_LABELS;
