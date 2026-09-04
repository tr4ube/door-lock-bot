import type { DeviceStatePayload, DoorState, StateHistoryEntry } from "../domain/door-state.js";
import type { LockState } from "../domain/lock-state.js";
import type { DoorLockDatabase, HealthNotificationKind } from "../db/database.js";

export type StateChange = { from: LockState; to: LockState };

export type IngestResult = {
  state: DoorState;
  change: StateChange | null;
  recovered: boolean;
  ignored: boolean;
};

export type EffectiveState = {
  state: LockState;
  reason: "stale" | "never-received" | null;
  stored: DoorState | null;
  staleAfterSeconds: number;
};

export type SensorHealthTransition =
  | { type: "went-offline"; lastReceivedAt: string }
  | { type: "recovered"; state: LockState };

export class DoorStateService {
  constructor(
    private readonly database: DoorLockDatabase,
    private readonly staleAfterSeconds: number,
  ) {}

  ingest(payload: DeviceStatePayload, receivedAt = new Date()): IngestResult {
    const current = this.database.getLatest(payload.deviceId);
    if (current !== null) {
      const incomingTime = new Date(payload.measuredAt).getTime();
      const currentTime = new Date(current.measuredAt).getTime();
      if (incomingTime < currentTime || (incomingTime === currentTime && payload.state !== current.state)) {
        return { state: current, change: null, recovered: false, ignored: true };
      }
    }

    const receivedAtIso = receivedAt.toISOString();
    const priorHealth = this.database.getSensorHealth(payload.deviceId);
    const previousState = this.database.saveState(payload, receivedAtIso);
    this.database.setSensorHealth(payload.deviceId, "ONLINE", receivedAtIso);
    if (priorHealth === "OFFLINE") {
      this.database.setPendingHealthNotification(payload.deviceId, "RECOVERY", receivedAtIso);
    }

    const state = this.database.getLatest(payload.deviceId);
    if (state === null) throw new Error("State was not persisted");
    return {
      state,
      change:
        previousState !== null && previousState !== payload.state
          ? { from: previousState, to: payload.state }
          : null,
      recovered: this.database.getPendingHealthNotification(payload.deviceId) === "RECOVERY",
      ignored: false,
    };
  }

  getEffectiveState(deviceId: string, now = new Date()): EffectiveState {
    const stored = this.database.getLatest(deviceId);
    if (stored === null) {
      return {
        state: "UNKNOWN",
        reason: "never-received",
        stored: null,
        staleAfterSeconds: this.staleAfterSeconds,
      };
    }

    const ageMilliseconds = now.getTime() - new Date(stored.receivedAt).getTime();
    if (ageMilliseconds > this.staleAfterSeconds * 1000) {
      return {
        state: "UNKNOWN",
        reason: "stale",
        stored,
        staleAfterSeconds: this.staleAfterSeconds,
      };
    }
    return { state: stored.state, reason: null, stored, staleAfterSeconds: this.staleAfterSeconds };
  }

  checkSensorHealth(deviceId: string, now = new Date()): SensorHealthTransition | null {
    const effective = this.getEffectiveState(deviceId, now);
    if (effective.stored === null) return null;

    const pending = this.database.getPendingHealthNotification(deviceId);
    if (effective.reason === "stale") {
      if (this.database.getSensorHealth(deviceId) !== "OFFLINE" || pending === "RECOVERY") {
        this.database.setSensorHealth(deviceId, "OFFLINE", now.toISOString());
        this.database.setPendingHealthNotification(deviceId, "OFFLINE", now.toISOString());
      }
      return this.database.getPendingHealthNotification(deviceId) === "OFFLINE"
        ? { type: "went-offline", lastReceivedAt: effective.stored.receivedAt }
        : null;
    }

    return pending === "RECOVERY"
      ? { type: "recovered", state: effective.stored.state }
      : null;
  }

  acknowledgeHealthNotification(deviceId: string, kind: HealthNotificationKind): void {
    this.database.acknowledgeHealthNotification(deviceId, kind);
  }

  getHistory(deviceId: string, limit = 10): StateHistoryEntry[] {
    return this.database.getHistory(deviceId, Math.min(Math.max(limit, 1), 10));
  }

  isDatabaseHealthy(): boolean {
    return this.database.isHealthy();
  }
}
