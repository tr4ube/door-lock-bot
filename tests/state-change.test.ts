import { describe, expect, it } from "vitest";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

const measuredAt = "2026-09-04T15:00:00+09:00";
const laterMeasuredAt = "2026-09-04T15:01:00+09:00";

describe("state change persistence", () => {
  it("stores the first state without adding history", () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    const result = service.ingest(
      { deviceId: "door", state: "LOCKED", measuredAt },
      new Date("2026-09-04T06:00:01Z"),
    );
    expect(result.change).toBeNull();
    expect(database.getLatest("door")?.state).toBe("LOCKED");
    expect(database.getHistory("door", 10)).toHaveLength(0);
  });

  it("does not add history for a same-state heartbeat", () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    service.ingest({ deviceId: "door", state: "LOCKED", measuredAt });
    const result = service.ingest({ deviceId: "door", state: "LOCKED", measuredAt });
    expect(result.change).toBeNull();
    expect(database.getHistory("door", 10)).toHaveLength(0);
  });

  it("adds one history row for LOCKED -> UNLOCKED", () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    service.ingest({ deviceId: "door", state: "LOCKED", measuredAt });
    const result = service.ingest({
      deviceId: "door",
      state: "UNLOCKED",
      measuredAt: laterMeasuredAt,
    });
    expect(result.change).toEqual({ from: "LOCKED", to: "UNLOCKED" });
    expect(database.getHistory("door", 10)).toHaveLength(1);
  });

  it("ignores an older delayed payload instead of rolling state backward", () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    service.ingest({
      deviceId: "door",
      state: "UNLOCKED",
      measuredAt: "2026-09-04T15:30:00+09:00",
    });

    const delayed = service.ingest({
      deviceId: "door",
      state: "LOCKED",
      measuredAt: "2026-09-04T15:00:00+09:00",
    });

    expect(delayed.ignored).toBe(true);
    expect(database.getLatest("door")?.state).toBe("UNLOCKED");
    expect(database.getHistory("door", 10)).toHaveLength(0);
  });

  it("adds one additional history row for UNLOCKED -> LOCKED", () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    service.ingest({ deviceId: "door", state: "UNLOCKED", measuredAt });
    service.ingest({ deviceId: "door", state: "LOCKED", measuredAt: laterMeasuredAt });
    expect(database.getHistory("door", 10)).toHaveLength(1);
    expect(database.getHistory("door", 10)[0]?.state).toBe("LOCKED");
  });
});
