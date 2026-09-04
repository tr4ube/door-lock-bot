#pragma once

#include <Arduino.h>
#include <Wire.h>

struct RgbcReading {
  uint16_t red;
  uint16_t green;
  uint16_t blue;
  uint16_t clear;
};

class Tcs3472 {
 public:
  static constexpr uint8_t kDefaultAddress = 0x29;

  explicit Tcs3472(uint8_t address = kDefaultAddress);
  bool begin(TwoWire& wire);
  bool readRaw(RgbcReading& reading);
  bool setIlluminationLed(bool enabled);
  uint8_t deviceId() const;

 private:
  bool write8(uint8_t reg, uint8_t value);
  bool read8(uint8_t reg, uint8_t& value);
  bool read16(uint8_t reg, uint16_t& value);

  TwoWire* wire_ = nullptr;
  uint8_t address_;
  uint8_t device_id_ = 0;
};
