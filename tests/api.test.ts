import { describe, expect, it } from "vitest";
import { buildApi } from "../src/api/server.js";
import { DoorStateService } from "../src/services/door-state-service.js";
import { createTestDatabase } from "./test-helpers.js";

const validPayload = {
  deviceId: "circle-room-door-01",
  state: "LOCKED",
  measuredAt: "2026-09-04T15:00:00+09:00",
};

function setup() {
  const database = createTestDatabase();
  const service = new DoorStateService(database, 900);
  const app = buildApi({
    deviceApiKey: "test-secret",
    deviceId: "circle-room-door-01",
    stateService: service,
    onStateAccepted: async () => undefined,
  });
  return { app, database };
}

describe("POST /api/v1/device/state", () => {
  it("accepts a valid payload", async () => {
    const { app, database } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/state",
      headers: { authorization: "Bearer test-secret" },
      payload: validPayload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(database.getLatest("circle-room-door-01")?.state).toBe("LOCKED");
  });

  it.each([
    ["missing", undefined],
    ["invalid", "Bearer wrong-secret"],
  ])("returns 401 for a %s API key", async (_label, authorization) => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/state",
      headers: authorization === undefined ? {} : { authorization },
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for an invalid state", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/state",
      headers: { authorization: "Bearer test-secret" },
      payload: { ...validPayload, state: "OPEN" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 for an unknown device", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/state",
      headers: { authorization: "Bearer test-secret" },
      payload: { ...validPayload, deviceId: "unknown" },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /health", () => {
  it("reports API and database health", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, database: "ok" });
  });
});
