#pragma once

#include <Arduino.h>

namespace RuntimeConfig {
constexpr int kSeeedSdaPin = 1;
constexpr int kSeeedSclPin = 2;
constexpr int kM5SdaPin = 2;
constexpr int kM5SclPin = 1;
constexpr uint32_t kI2cFrequency = 400000;
constexpr uint32_t kSampleIntervalMs = 1000;
constexpr uint8_t kStableSampleCount = 3;
constexpr uint32_t kHeartbeatIntervalMs = 5UL * 60UL * 1000UL;
constexpr uint32_t kFailedPostRetryMs = 15UL * 1000UL;
constexpr uint32_t kWifiRetryMs = 30UL * 1000UL;
constexpr uint32_t kSensorRetryMs = 30UL * 1000UL;

// Initial safe defaults only. Recalibrate from diagnostic CSV at the real panel.
constexpr uint16_t kMinimumClear = 100;
constexpr float kDominanceRatio = 1.50F;
}  // namespace RuntimeConfig
