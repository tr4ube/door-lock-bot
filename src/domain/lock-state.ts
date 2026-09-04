import { z } from "zod";

export const lockStateSchema = z.enum(["LOCKED", "UNLOCKED", "UNKNOWN"]);
export type LockState = z.infer<typeof lockStateSchema>;

export type SensorHealth = "ONLINE" | "OFFLINE";
