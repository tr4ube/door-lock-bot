import type { DoorState, StateHistoryEntry } from "../domain/door-state.js";
import type { EffectiveState } from "../services/door-state-service.js";
import { formatAge, formatJstTime } from "../utils/time.js";

const labels = {
  LOCKED: "🔒 施錠",
  UNLOCKED: "🔓 解錠",
  UNKNOWN: "⚠️ 不明",
} as const;

export function formatLock(effective: EffectiveState, now = new Date()): string {
  const lines = ["**サークルルーム**", `施錠状態: ${labels[effective.state]}`];
  if (effective.stored === null) {
    lines.push("センサーからまだ状態を受信していません");
  } else if (effective.reason === "stale") {
    lines.push(`最終受信: ${formatJstTime(effective.stored.receivedAt)}`);
    lines.push(`センサーから${Math.ceil(effective.staleAfterSeconds / 60)}分以上応答がありません`);
  } else {
    lines.push(`最終確認: ${formatJstTime(effective.stored.measuredAt)}`);
    lines.push(`更新: ${formatAge(effective.stored.receivedAt, now)}`);
  }
  return lines.join("\n");
}

export function formatDebug(state: DoorState | null, effective: EffectiveState): string {
  if (state === null) return "状態データはまだありません。";
  return [
    `deviceId: ${state.deviceId}`,
    `raw state: ${state.state}`,
    `effective state: ${effective.state}`,
    `confidence: ${state.confidence ?? "null"}`,
    `R: ${state.red ?? "null"}`,
    `G: ${state.green ?? "null"}`,
    `B: ${state.blue ?? "null"}`,
    `Clear: ${state.clear ?? "null"}`,
    `measuredAt: ${state.measuredAt}`,
    `receivedAt: ${state.receivedAt}`,
    `batteryPercent: ${state.batteryPercent ?? "null"}`,
    `firmwareVersion: ${state.firmwareVersion ?? "null"}`,
  ].join("\n");
}

export function formatHistory(history: StateHistoryEntry[]): string {
  if (history.length === 0) return "状態変化履歴はまだありません。";
  return history
    .map((entry) => `${formatJstTime(entry.measuredAt).slice(0, 5)} ${entry.state === "LOCKED" ? "施錠" : entry.state === "UNLOCKED" ? "解錠" : "不明"}`)
    .join("\n");
}

export function stateLabel(state: DoorState["state"]): string {
  return labels[state];
}
