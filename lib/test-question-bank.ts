import { TestQuestion } from "@/lib/types";

/**
 * Резервный банк для режима без Supabase: вопросы теста строятся из карточек БПЛА (`generateUavTtxQuestionBank`).
 * Ручные вопросы при необходимости добавляются через админку в БД.
 */
export function createDefaultQuestionBank(): TestQuestion[] {
  return [];
}
