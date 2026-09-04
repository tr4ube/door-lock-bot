import "dotenv/config";
import { buildApi } from "./api/server.js";
import { DoorLockBot } from "./bot/client.js";
import { getDiscordConfig, loadConfig } from "./config.js";
import { DoorLockDatabase } from "./db/database.js";
import { DoorStateService, type IngestResult } from "./services/door-state-service.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new DoorLockDatabase(config.databasePath);
  const stateService = new DoorStateService(database, config.staleAfterSeconds);
  const discordConfig = getDiscordConfig(config);
  let bot =
    discordConfig === null ? null : new DoorLockBot(discordConfig, config.deviceId, stateService);

  const handleAcceptedState = async (result: IngestResult): Promise<void> => {
    const notificationFailures: unknown[] = [];
    if (result.change !== null) {
      console.info(`[INFO] state changed ${result.change.from} -> ${result.change.to}`);
      try {
        await bot?.notifyStateChanged(result.change.to, result.state.measuredAt);
      } catch (error: unknown) {
        notificationFailures.push(error);
      }
    }
    if (result.recovered && bot !== null) {
      console.info("[INFO] device recovered");
      try {
        await bot.notifySensorRecovered(result.state.state);
        stateService.acknowledgeHealthNotification(config.deviceId, "RECOVERY");
      } catch (error: unknown) {
        notificationFailures.push(error);
      }
    }
    if (notificationFailures.length > 0) {
      throw new AggregateError(notificationFailures, "One or more Discord notifications failed");
    }
  };

  const app = buildApi({
    deviceApiKey: config.deviceApiKey,
    deviceId: config.deviceId,
    stateService,
    onStateAccepted: handleAcceptedState,
    discordConnected: () => bot?.isConnected() ?? false,
    logger: true,
  });

  let checkingHealth = false;
  const healthTimer = setInterval(() => {
    if (checkingHealth || bot === null) return;
    checkingHealth = true;
    void (async () => {
      try {
        const transition = stateService.checkSensorHealth(config.deviceId);
        if (transition?.type === "went-offline") {
          console.warn("[WARN] device became stale");
          await bot.notifySensorOffline(transition.lastReceivedAt);
          stateService.acknowledgeHealthNotification(config.deviceId, "OFFLINE");
        } else if (transition?.type === "recovered") {
          console.info("[INFO] retrying sensor recovery notification");
          await bot.notifySensorRecovered(transition.state);
          stateService.acknowledgeHealthNotification(config.deviceId, "RECOVERY");
        }
      } catch (error: unknown) {
        console.error("[ERROR] sensor health check failed", error);
      } finally {
        checkingHealth = false;
      }
    })();
  }, config.healthCheckIntervalSeconds * 1000);
  healthTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[INFO] shutting down signal=${signal}`);
    clearInterval(healthTimer);
    bot?.stop();
    await app.close();
    database.close();
  };

  process.once("SIGINT", () => void shutdown("SIGINT").finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown("SIGTERM").finally(() => process.exit(0)));

  try {
    await app.listen({ host: config.host, port: config.port });
    console.info(`[INFO] API server started host=${config.host} port=${config.port}`);
    if (bot !== null) {
      try {
        await bot.start();
      } catch (error: unknown) {
        console.error("[ERROR] Discord startup failed; API will continue without Discord", error);
        bot.stop();
        bot = null;
      }
    } else {
      console.warn("[WARN] Discord integration disabled");
    }
  } catch (error: unknown) {
    clearInterval(healthTimer);
    bot?.stop();
    await app.close().catch(() => undefined);
    database.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("[ERROR] fatal startup error", error);
  process.exitCode = 1;
});
