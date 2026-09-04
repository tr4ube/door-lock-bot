import { describe, expect, it } from "vitest";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

const base = new Date("2026-09-04T06:00:00Z");

describe("sensor health transitions", () => {
  it("emits ONLINE -> OFFLINE once and OFFLINE -> ONLINE once", () => {
    const service = new DoorStateService(createTestDatabase(), 900);
    service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: base.toISOString() },
      base,
    );

    const offline = {
      type: "went-offline" as const,
      lastReceivedAt: base.toISOString(),
    };
    expect(service.checkSensorHealth("door", new Date("2026-09-04T06:15:01Z"))).toEqual(offline);
    expect(service.checkSensorHealth("door", new Date("2026-09-04T06:20:00Z"))).toEqual(offline);
    service.acknowledgeHealthNotification("door", "OFFLINE");
    expect(service.checkSensorHealth("door", new Date("2026-09-04T06:20:00Z"))).toBeNull();

    const recovery = service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: "2026-09-04T06:20:01Z" },
      new Date("2026-09-04T06:20:01Z"),
    );
    expect(recovery.recovered).toBe(true);

    const retryHeartbeat = service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: "2026-09-04T06:21:01Z" },
      new Date("2026-09-04T06:21:01Z"),
    );
    expect(retryHeartbeat.recovered).toBe(true);
    service.acknowledgeHealthNotification("door", "RECOVERY");

    const acknowledgedHeartbeat = service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt: "2026-09-04T06:22:01Z" },
      new Date("2026-09-04T06:22:01Z"),
    );
    expect(acknowledgedHeartbeat.recovered).toBe(false);
  });
});
