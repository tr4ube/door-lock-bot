import { describe, expect, it } from "vitest";
import { formatLock } from "../src/bot/formatters.js";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

describe("Discord lock formatter", () => {
  it("shows the configured stale duration", () => {
    const service = new DoorStateService(createTestDatabase(), 600);
    service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: "2026-09-04T06:00:00Z" },
      new Date("2026-09-04T06:00:00Z"),
    );
    const message = formatLock(
      service.getEffectiveState("door", new Date("2026-09-04T06:10:01Z")),
      new Date("2026-09-04T06:10:01Z"),
    );
    expect(message).toContain("施錠状態: ⚠️ 不明");
    expect(message).toContain("10分以上応答がありません");
  });
});
