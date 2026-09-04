import "dotenv/config";
import { lockStateSchema, type LockState } from "../src/domain/lock-state.js";
import type { DeviceStatePayload } from "../src/domain/door-state.js";

const mockSensorByState = {
  LOCKED: { r: 1200, g: 12540, b: 900, clear: 19600 },
  UNLOCKED: { r: 12540, g: 1800, b: 1300, clear: 19600 },
  UNKNOWN: { r: 0, g: 0, b: 0, clear: 0 },
} satisfies Record<LockState, { r: number; g: number; b: number; clear: number }>;

export function buildMockPayload(
  state: LockState,
  deviceId: string,
  measuredAt: Date,
): DeviceStatePayload {
  return {
    deviceId,
    state,
    confidence: state === "UNKNOWN" ? 0 : 0.97,
    sensor: mockSensorByState[state],
    batteryPercent: 83,
    firmwareVersion: "mock",
    measuredAt: measuredAt.toISOString(),
  };
}

export async function sendMockState(state: LockState): Promise<void> {
  const apiKey = process.env.DEVICE_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("DEVICE_API_KEY is required");
  }
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
  const deviceId = process.env.DEVICE_ID ?? "circle-room-door-01";
  const response = await fetch(`${baseUrl}/api/v1/device/state`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildMockPayload(state, deviceId, new Date())),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Mock request failed with HTTP ${response.status}`);
  console.info(`Mock ${state} sent`, body);
}

export function readMockState(): LockState {
  return lockStateSchema.parse(process.env.MOCK_STATE ?? "LOCKED");
}
