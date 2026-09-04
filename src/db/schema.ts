export const schemaSql = `
CREATE TABLE IF NOT EXISTS door_state (
  device_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('LOCKED', 'UNLOCKED', 'UNKNOWN')),
  confidence REAL,
  red INTEGER,
  green INTEGER,
  blue INTEGER,
  clear_value INTEGER,
  battery_percent INTEGER,
  firmware_version TEXT,
  measured_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('LOCKED', 'UNLOCKED', 'UNKNOWN')),
  confidence REAL,
  measured_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_state_history_device_received
  ON state_history (device_id, received_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sensor_health (
  device_id TEXT PRIMARY KEY,
  health TEXT NOT NULL CHECK (health IN ('ONLINE', 'OFFLINE')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_health_notification (
  device_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('OFFLINE', 'RECOVERY')),
  created_at TEXT NOT NULL
);
`;
