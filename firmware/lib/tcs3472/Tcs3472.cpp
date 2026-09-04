#include "Tcs3472.h"

namespace {
constexpr uint8_t kCommandBit = 0x80;
constexpr uint8_t kAutoIncrement = 0x20;
constexpr uint8_t kEnable = 0x00;
constexpr uint8_t kIntegrationTime = 0x01;
constexpr uint8_t kControl = 0x0F;
constexpr uint8_t kId = 0x12;
constexpr uint8_t kStatus = 0x13;
constexpr uint8_t kClearData = 0x14;
constexpr uint8_t kRedData = 0x16;
constexpr uint8_t kGreenData = 0x18;
constexpr uint8_t kBlueData = 0x1A;
constexpr uint8_t kPowerOn = 0x01;
constexpr uint8_t kAdcEnable = 0x02;
constexpr uint8_t kInterruptEnable = 0x10;
constexpr uint8_t kDataValid = 0x01;
constexpr uint8_t kIntegration154Ms = 0xC0;
constexpr uint8_t kGain4x = 0x01;
}  // namespace

Tcs3472::Tcs3472(uint8_t address) : address_(address) {}

bool Tcs3472::begin(TwoWire& wire) {
  wire_ = &wire;
  if (!read8(kId, device_id_)) return false;
  if (device_id_ != 0x44 && device_id_ != 0x4D) return false;
  if (!write8(kIntegrationTime, kIntegration154Ms)) return false;
  if (!write8(kControl, kGain4x)) return false;
  if (!write8(kEnable, kPowerOn)) return false;
  delay(3);
  if (!write8(kEnable, kPowerOn | kAdcEnable)) return false;
  delay(160);
  return setIlluminationLed(false);
}

bool Tcs3472::readRaw(RgbcReading& reading) {
  uint8_t status = 0;
  if (!read8(kStatus, status) || (status & kDataValid) == 0) return false;
  return read16(kRedData, reading.red) && read16(kGreenData, reading.green) &&
         read16(kBlueData, reading.blue) && read16(kClearData, reading.clear);
}

bool Tcs3472::setIlluminationLed(bool enabled) {
  uint8_t enable = 0;
  if (!read8(kEnable, enable)) return false;
  if (enabled) {
    enable &= static_cast<uint8_t>(~kInterruptEnable);
  } else {
    enable |= kInterruptEnable;
  }
  return write8(kEnable, enable);
}

uint8_t Tcs3472::deviceId() const { return device_id_; }

bool Tcs3472::write8(uint8_t reg, uint8_t value) {
  if (wire_ == nullptr) return false;
  wire_->beginTransmission(address_);
  wire_->write(kCommandBit | reg);
  wire_->write(value);
  return wire_->endTransmission() == 0;
}

bool Tcs3472::read8(uint8_t reg, uint8_t& value) {
  if (wire_ == nullptr) return false;
  wire_->beginTransmission(address_);
  wire_->write(kCommandBit | reg);
  if (wire_->endTransmission(false) != 0) return false;
  if (wire_->requestFrom(address_, static_cast<uint8_t>(1)) != 1) return false;
  value = wire_->read();
  return true;
}

bool Tcs3472::read16(uint8_t reg, uint16_t& value) {
  if (wire_ == nullptr) return false;
  wire_->beginTransmission(address_);
  wire_->write(kCommandBit | kAutoIncrement | reg);
  if (wire_->endTransmission(false) != 0) return false;
  if (wire_->requestFrom(address_, static_cast<uint8_t>(2)) != 2) return false;
  const uint8_t low = wire_->read();
  const uint8_t high = wire_->read();
  value = static_cast<uint16_t>(low) | (static_cast<uint16_t>(high) << 8);
  return true;
}
