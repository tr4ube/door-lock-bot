import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import type { DeviceStatePayload, DoorState, StateHistoryEntry } from "../domain/door-state.js";
import { lockStateSchema, type LockState, type SensorHealth } from "../domain/lock-state.js";
import { schemaSql } from "./schema.js";

const doorStateRowSchema = z.object({
  device_id: z.string(),
  state: lockStateSchema,
  confidence: z.number().nullable(),
  red: z.number().int().nullable(),
  green: z.number().int().nullable(),
  blue: z.number().int().nullable(),
  clear_value: z.number().int().nullable(),
  battery_percent: z.number().int().nullable(),
  firmware_version: z.string().nullable(),
  measured_at: z.string(),
  received_at: z.string(),
});

const historyRowSchema = z.object({
  id: z.number().int(),
  device_id: z.string(),
  state: lockStateSchema,
  confidence: z.number().nullable(),
  measured_at: z.string(),
  received_at: z.string(),
});

const healthRowSchema = z.object({ health: z.enum(["ONLINE", "OFFLINE"]) });
const healthNotificationRowSchema = z.object({ kind: z.enum(["OFFLINE", "RECOVERY"]) });

export type HealthNotificationKind = z.infer<typeof healthNotificationRowSchema>["kind"];

type DoorStateRow = z.infer<typeof doorStateRowSchema>;
type HistoryRow = z.infer<typeof historyRowSchema>;

function mapDoorState(row: DoorStateRow): DoorState {
  return {
    deviceId: row.device_id,
    state: row.state,
    confidence: row.confidence,
    red: row.red,
    green: row.green,
    blue: row.blue,
    clear: row.clear_value,
    batteryPercent: row.battery_percent,
    firmwareVersion: row.firmware_version,
    measuredAt: row.measured_at,
    receivedAt: row.received_at,
  };
}

function mapHistory(row: HistoryRow): StateHistoryEntry {
  return {
    id: row.id,
    deviceId: row.device_id,
    state: row.state,
    confidence: row.confidence,
    measuredAt: row.measured_at,
    receivedAt: row.received_at,
  };
}

export class DoorLockDatabase {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(schemaSql);
  }

  close(): void {
    this.database.close();
  }

  isHealthy(): boolean {
    return z
      .object({ ok: z.literal(1) })
      .safeParse(this.database.prepare("SELECT 1 AS ok").get()).success;
  }

  getLatest(deviceId: string): DoorState | null {
    const row = this.database.prepare("SELECT * FROM door_state WHERE device_id = ?").get(deviceId);
    return row === undefined ? null : mapDoorState(doorStateRowSchema.parse(row));
  }

  saveState(payload: DeviceStatePayload, receivedAt: string): LockState | null {
    const transaction = this.database.transaction(() => {
      const previous = this.getLatest(payload.deviceId);
      this.database
        .prepare(`
          INSERT INTO door_state (
            device_id, state, confidence, red, green, blue, clear_value,
            battery_percent, firmware_version, measured_at, received_at
          ) VALUES (
            @deviceId, @state, @confidence, @red, @green, @blue, @clearValue,
            @batteryPercent, @firmwareVersion, @measuredAt, @receivedAt
          )
          ON CONFLICT(device_id) DO UPDATE SET
            state = excluded.state,
            confidence = excluded.confidence,
            red = excluded.red,
            green = excluded.green,
            blue = excluded.blue,
            clear_value = excluded.clear_value,
            battery_percent = excluded.battery_percent,
            firmware_version = excluded.firmware_version,
            measured_at = excluded.measured_at,
            received_at = excluded.received_at
        `)
        .run({
          deviceId: payload.deviceId,
          state: payload.state,
          confidence: payload.confidence ?? null,
          red: payload.sensor?.r ?? null,
          green: payload.sensor?.g ?? null,
          blue: payload.sensor?.b ?? null,
          clearValue: payload.sensor?.clear ?? null,
          batteryPercent: payload.batteryPercent ?? null,
          firmwareVersion: payload.firmwareVersion ?? null,
          measuredAt: payload.measuredAt,
          receivedAt,
        });

      if (previous !== null && previous.state !== payload.state) {
        this.database
          .prepare(`
            INSERT INTO state_history (
              device_id, state, confidence, measured_at, received_at
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            payload.deviceId,
            payload.state,
            payload.confidence ?? null,
            payload.measuredAt,
            receivedAt,
          );
      }
      return previous?.state ?? null;
    });
    return transaction();
  }

  getHistory(deviceId: string, limit: number): StateHistoryEntry[] {
    const rows = historyRowSchema.array().parse(
      this.database
        .prepare(`
          SELECT id, device_id, state, confidence, measured_at, received_at
          FROM state_history
          WHERE device_id = ?
          ORDER BY received_at DESC, id DESC
          LIMIT ?
        `)
        .all(deviceId, limit),
    );
    return rows.map(mapHistory);
  }

  getSensorHealth(deviceId: string): SensorHealth | null {
    const row = this.database
      .prepare("SELECT health FROM sensor_health WHERE device_id = ?")
      .get(deviceId);
    return row === undefined ? null : healthRowSchema.parse(row).health;
  }

  setSensorHealth(deviceId: string, health: SensorHealth, updatedAt: string): void {
    this.database
      .prepare(`
        INSERT INTO sensor_health (device_id, health, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          health = excluded.health,
          updated_at = excluded.updated_at
      `)
      .run(deviceId, health, updatedAt);
  }

  getPendingHealthNotification(deviceId: string): HealthNotificationKind | null {
    const row = this.database
      .prepare("SELECT kind FROM sensor_health_notification WHERE device_id = ?")
      .get(deviceId);
    return row === undefined ? null : healthNotificationRowSchema.parse(row).kind;
  }

  setPendingHealthNotification(
    deviceId: string,
    kind: HealthNotificationKind,
    createdAt: string,
  ): void {
    this.database
      .prepare(`
        INSERT INTO sensor_health_notification (device_id, kind, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          kind = excluded.kind,
          created_at = excluded.created_at
      `)
      .run(deviceId, kind, createdAt);
  }

  acknowledgeHealthNotification(deviceId: string, kind: HealthNotificationKind): void {
    this.database
      .prepare("DELETE FROM sensor_health_notification WHERE device_id = ? AND kind = ?")
      .run(deviceId, kind);
  }
}
