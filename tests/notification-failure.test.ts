import { describe, expect, it } from "vitest";
import { buildApi } from "../src/api/server.js";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

describe("notification failure isolation", () => {
  it("keeps the saved state and returns 200 when notification fails", async () => {
    const database = createTestDatabase();
    const service = new DoorStateService(database, 900);
    const app = buildApi({
      deviceApiKey: "test-secret",
      deviceId: "door",
      stateService: service,
      onStateAccepted: async () => {
        throw new Error("Discord unavailable");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/state",
      headers: { authorization: "Bearer test-secret" },
      payload: {
        deviceId: "door",
        state: "LOCKED",
        measuredAt: "2026-09-04T15:00:00+09:00",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(database.getLatest("door")?.state).toBe("LOCKED");
  });
});
