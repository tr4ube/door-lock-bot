import { z } from "zod";
import { lockStateSchema, type LockState } from "./lock-state.js";

const sensorSchema = z
  .object({
    r: z.number().int().nonnegative(),
    g: z.number().int().nonnegative(),
    b: z.number().int().nonnegative(),
    clear: z.number().int().nonnegative(),
  })
  .strict();

export const deviceStatePayloadSchema = z
  .object({
    deviceId: z.string().trim().min(1).max(100),
    state: lockStateSchema,
    confidence: z.number().min(0).max(1).optional(),
    sensor: sensorSchema.optional(),
    batteryPercent: z.number().int().min(0).max(100).optional(),
    firmwareVersion: z.string().trim().min(1).max(100).optional(),
    measuredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type DeviceStatePayload = z.infer<typeof deviceStatePayloadSchema>;

export type DoorState = {
  deviceId: string;
  state: LockState;
  confidence: number | null;
  red: number | null;
  green: number | null;
  blue: number | null;
  clear: number | null;
  measuredAt: string;
  receivedAt: string;
  batteryPercent: number | null;
  firmwareVersion: string | null;
};

export type StateHistoryEntry = {
  id: number;
  deviceId: string;
  state: LockState;
  confidence: number | null;
  measuredAt: string;
  receivedAt: string;
};
