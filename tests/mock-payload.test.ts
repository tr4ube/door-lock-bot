import { describe, expect, it } from "vitest";
import { buildMockPayload } from "../scripts/send-mock-state.js";

describe("mock sensor color mapping", () => {
  it("uses green-dominant sensor data for LOCKED", () => {
    const payload = buildMockPayload("LOCKED", "door", new Date("2026-09-04T06:00:00Z"));
    expect(payload.sensor.g).toBeGreaterThan(payload.sensor.r);
  });

  it("uses red-dominant sensor data for UNLOCKED", () => {
    const payload = buildMockPayload("UNLOCKED", "door", new Date("2026-09-04T06:00:00Z"));
    expect(payload.sensor.r).toBeGreaterThan(payload.sensor.g);
  });
});
