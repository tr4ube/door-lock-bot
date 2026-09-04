import { describe, expect, it } from "vitest";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

const receivedAt = new Date("2026-09-04T06:00:00Z");

describe("effective state", () => {
  it("uses the stored state inside the stale threshold", () => {
    const service = new DoorStateService(createTestDatabase(), 900);
    service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: receivedAt.toISOString() },
      receivedAt,
    );
    expect(service.getEffectiveState("door", new Date("2026-09-04T06:15:00Z"))).toMatchObject({
      state: "LOCKED",
      reason: null,
    });
  });

  it("returns UNKNOWN after the stale threshold", () => {
    const service = new DoorStateService(createTestDatabase(), 900);
    service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: receivedAt.toISOString() },
      receivedAt,
    );
    expect(service.getEffectiveState("door", new Date("2026-09-04T06:15:01Z"))).toMatchObject({
      state: "UNKNOWN",
      reason: "stale",
    });
  });
});
