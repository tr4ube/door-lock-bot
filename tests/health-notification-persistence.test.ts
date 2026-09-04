import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DoorLockDatabase } from "../src/db/database.js";
import { DoorStateService } from "../src/services/door-state-service.js";

describe("health notification persistence", () => {
  it("retries an unacknowledged offline notification after a database reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "door-lock-health-"));
    const path = join(directory, "state.sqlite");
    try {
      const firstDatabase = new DoorLockDatabase(path);
      const firstService = new DoorStateService(firstDatabase, 900);
      firstService.ingest(
        { deviceId: "door", state: "LOCKED", measuredAt: "2026-09-04T06:00:00Z" },
        new Date("2026-09-04T06:00:00Z"),
      );
      expect(firstService.checkSensorHealth("door", new Date("2026-09-04T06:15:01Z"))).not.toBeNull();
      firstDatabase.close();

      const reopenedDatabase = new DoorLockDatabase(path);
      const reopenedService = new DoorStateService(reopenedDatabase, 900);
      expect(reopenedService.checkSensorHealth("door", new Date("2026-09-04T06:16:00Z"))).toEqual({
        type: "went-offline",
        lastReceivedAt: "2026-09-04T06:00:00.000Z",
      });
      reopenedService.acknowledgeHealthNotification("door", "OFFLINE");
      expect(reopenedService.checkSensorHealth("door", new Date("2026-09-04T06:16:00Z"))).toBeNull();
      reopenedDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
