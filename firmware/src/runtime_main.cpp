#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <time.h>

#include "Tcs3472.h"
#include "runtime_config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#elif defined(DOOR_LOCK_USE_EXAMPLE_SECRETS)
#include "secrets.example.h"
#else
#error "Copy firmware/include/secrets.example.h to secrets.h and set local values"
#endif

namespace {
enum class LockState { kLocked, kUnlocked, kUnknown };

struct WiringProfile {
  const char* name;
  int sda;
  int scl;
};

constexpr WiringProfile kWiringProfiles[] = {
    {"Seeed Grove standard", RuntimeConfig::kSeeedSdaPin, RuntimeConfig::kSeeedSclPin},
    {"M5 external-I2C convention", RuntimeConfig::kM5SdaPin, RuntimeConfig::kM5SclPin},
};

Tcs3472 sensor;
bool sensor_ready = false;
LockState candidate_state = LockState::kUnknown;
LockState stable_state = LockState::kUnknown;
uint8_t candidate_count = 0;
bool stable_state_ready = false;
bool pending_post = false;
uint32_t last_sample_ms = 0;
uint32_t last_post_attempt_ms = 0;
uint32_t last_successful_post_ms = 0;
uint32_t last_wifi_attempt_ms = 0;
uint32_t last_sensor_attempt_ms = 0;
RgbcReading latest_reading{};

const char* stateName(LockState state) {
  switch (state) {
    case LockState::kLocked:
      return "LOCKED";
    case LockState::kUnlocked:
      return "UNLOCKED";
    case LockState::kUnknown:
      return "UNKNOWN";
  }
  return "UNKNOWN";
}

void ensureSensor() {
  if (sensor_ready) return;
  const uint32_t now = millis();
  if (last_sensor_attempt_ms != 0 &&
      now - last_sensor_attempt_ms < RuntimeConfig::kSensorRetryMs) {
    return;
  }
  last_sensor_attempt_ms = now;
  for (const WiringProfile& profile : kWiringProfiles) {
    Wire.end();
    delay(20);
    Wire.begin(profile.sda, profile.scl, RuntimeConfig::kI2cFrequency);
    if (sensor.begin(Wire)) {
      sensor_ready = true;
      Serial.printf("TCS34725 ready with %s: SDA=%d SCL=%d; illumination LED OFF\n",
                    profile.name, profile.sda, profile.scl);
      return;
    }
  }
  Serial.println("TCS34725 not detected; retrying in 30 seconds");
}

LockState classify(const RgbcReading& reading) {
  if (reading.clear < RuntimeConfig::kMinimumClear) return LockState::kUnknown;
  const float red = static_cast<float>(reading.red);
  const float green = static_cast<float>(reading.green);
  if (green > red * RuntimeConfig::kDominanceRatio) return LockState::kLocked;
  if (red > green * RuntimeConfig::kDominanceRatio) return LockState::kUnlocked;
  return LockState::kUnknown;
}

bool measuredAt(char* output, size_t output_size) {
  const time_t now = time(nullptr);
  if (now < 1700000000) return false;
  tm utc{};
  gmtime_r(&now, &utc);
  return strftime(output, output_size, "%Y-%m-%dT%H:%M:%SZ", &utc) > 0;
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  const uint32_t now = millis();
  if (last_wifi_attempt_ms != 0 && now - last_wifi_attempt_ms < RuntimeConfig::kWifiRetryMs) return;
  last_wifi_attempt_ms = now;
  Serial.println("Wi-Fi connect attempt");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

bool postState() {
  if (WiFi.status() != WL_CONNECTED) return false;
  char measured_at[25]{};
  if (!measuredAt(measured_at, sizeof(measured_at))) {
    Serial.println("POST skipped: clock is not synchronized");
    return false;
  }

  JsonDocument document;
  document["deviceId"] = DEVICE_ID;
  document["state"] = stateName(stable_state);
  document["measuredAt"] = measured_at;
  document["sensor"]["r"] = latest_reading.red;
  document["sensor"]["g"] = latest_reading.green;
  document["sensor"]["b"] = latest_reading.blue;
  document["sensor"]["clear"] = latest_reading.clear;
  document["firmwareVersion"] = "0.1.0";

  String payload;
  serializeJson(document, payload);
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, DEVICE_STATE_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_API_KEY);
  const int status_code = http.POST(payload);
  http.end();
  Serial.printf("POST state=%s status=%d\n", stateName(stable_state), status_code);
  return status_code >= 200 && status_code < 300;
}

void updateStableState(LockState observed) {
  if (observed == candidate_state) {
    if (candidate_count < RuntimeConfig::kStableSampleCount) ++candidate_count;
  } else {
    candidate_state = observed;
    candidate_count = 1;
  }
  if (candidate_count < RuntimeConfig::kStableSampleCount) return;
  if (!stable_state_ready || stable_state != candidate_state) {
    stable_state = candidate_state;
    stable_state_ready = true;
    pending_post = true;
    Serial.printf("Stable state changed: %s\n", stateName(stable_state));
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("Door lock sensor runtime starting");
  ensureSensor();
  WiFi.setAutoReconnect(true);
  ensureWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  ensureSensor();
  ensureWifi();
  const uint32_t now = millis();
  if (now - last_sample_ms >= RuntimeConfig::kSampleIntervalMs) {
    last_sample_ms = now;
    RgbcReading reading{};
    const bool read_ok = sensor_ready && sensor.readRaw(reading);
    if (read_ok) latest_reading = reading;
    const LockState observed = read_ok ? classify(reading) : LockState::kUnknown;
    Serial.printf("sample state=%s r=%u g=%u b=%u c=%u\n", stateName(observed), reading.red,
                  reading.green, reading.blue, reading.clear);
    updateStableState(observed);
  }

  if (stable_state_ready &&
      now - last_successful_post_ms >= RuntimeConfig::kHeartbeatIntervalMs) {
    pending_post = true;
  }
  if (pending_post &&
      (last_post_attempt_ms == 0 || now - last_post_attempt_ms >= RuntimeConfig::kFailedPostRetryMs)) {
    last_post_attempt_ms = now;
    if (postState()) {
      pending_post = false;
      last_successful_post_ms = now;
    }
  }
  delay(10);
}
