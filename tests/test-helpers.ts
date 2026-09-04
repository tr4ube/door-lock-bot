import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { DoorLockDatabase } from "../src/db/database.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

export function createTestDatabase(): DoorLockDatabase {
  const directory = mkdtempSync(join(tmpdir(), "door-lock-bot-"));
  const database = new DoorLockDatabase(join(directory, "test.sqlite"));
  cleanups.push(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return database;
}
