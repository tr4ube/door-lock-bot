#include <Arduino.h>
#include <Wire.h>

#include "Tcs3472.h"

namespace {
constexpr uint32_t kI2cFrequency = 400000;

struct WiringProfile {
  const char* name;
  int sda;
  int scl;
};

constexpr WiringProfile kProfiles[] = {
    {"Seeed Grove standard", 1, 2},
    {"M5 external-I2C convention", 2, 1},
};

Tcs3472 sensor;
bool sensor_ready = false;

void scanI2c() {
  uint8_t found = 0;
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.printf("I2C device: 0x%02X\n", address);
      ++found;
    }
  }
  Serial.printf("I2C scan done: %u device(s)\n", found);
}

bool initializeSensor() {
  for (const WiringProfile& profile : kProfiles) {
    Wire.end();
    delay(20);
    Serial.printf("Trying %s: SDA=GPIO%d SCL=GPIO%d\n", profile.name, profile.sda,
                  profile.scl);
    Wire.begin(profile.sda, profile.scl, kI2cFrequency);
    scanI2c();
    if (sensor.begin(Wire)) {
      Serial.printf("Selected wiring: %s\n", profile.name);
      return true;
    }
  }
  return false;
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("AtomS3 Lite + Grove I2C Color Sensor V2.0 diagnostic");
  Serial.println("Auto-detecting Seeed and M5 SDA/SCL conventions");
  sensor_ready = initializeSensor();

  if (!sensor_ready) {
    Serial.println("ERROR: TCS34725 not detected at 0x29 (expected ID 0x44; 0x4D accepted)");
    return;
  }
  Serial.printf("TCS34725 ready: address=0x29 id=0x%02X\n", sensor.deviceId());
  Serial.println("Onboard illumination LED commanded OFF");
  Serial.println("CSV: millis,red,green,blue,clear,r_over_c,g_over_c,b_over_c");
}

void loop() {
  if (!sensor_ready) {
    delay(1000);
    return;
  }

  RgbcReading reading{};
  if (!sensor.readRaw(reading)) {
    Serial.println("READ_ERROR");
    delay(1000);
    return;
  }

  const float denominator = reading.clear == 0 ? 1.0F : static_cast<float>(reading.clear);
  Serial.printf("%lu,%u,%u,%u,%u,%.4f,%.4f,%.4f\n", millis(), reading.red,
                reading.green, reading.blue, reading.clear, reading.red / denominator,
                reading.green / denominator, reading.blue / denominator);
  delay(1000);
}
