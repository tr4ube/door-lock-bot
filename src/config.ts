import { resolve } from "node:path";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z
  .object({
    DISCORD_ENABLED: z.enum(["true", "false"]).default("true"),
    DISCORD_BOT_TOKEN: optionalString,
    DISCORD_CLIENT_ID: optionalString,
    DISCORD_GUILD_ID: optionalString,
    DISCORD_NOTIFICATION_CHANNEL_ID: optionalString,
    DISCORD_ADMIN_ROLE_ID: optionalString,
    DEVICE_API_KEY: z.string().min(1),
    DEVICE_ID: z.string().min(1).default("circle-room-door-01"),
    DEVICE_STALE_AFTER_SECONDS: z.coerce.number().int().positive().default(900),
    HEALTH_CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    DATABASE_PATH: z.string().min(1).default("./data/door-lock.sqlite"),
  })
  .superRefine((value, context) => {
    if (value.DISCORD_ENABLED !== "true") return;
    const required = [
      "DISCORD_BOT_TOKEN",
      "DISCORD_CLIENT_ID",
      "DISCORD_GUILD_ID",
      "DISCORD_NOTIFICATION_CHANNEL_ID",
    ] as const;
    for (const key of required) {
      if (value[key] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when DISCORD_ENABLED=true`,
        });
      }
    }
  });

export type AppConfig = {
  discordEnabled: boolean;
  discordBotToken?: string;
  discordClientId?: string;
  discordGuildId?: string;
  discordNotificationChannelId?: string;
  discordAdminRoleId?: string;
  deviceApiKey: string;
  deviceId: string;
  staleAfterSeconds: number;
  healthCheckIntervalSeconds: number;
  port: number;
  host: string;
  databasePath: string;
};

export type DiscordConfig = {
  token: string;
  clientId: string;
  guildId: string;
  notificationChannelId: string;
  adminRoleId?: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(environment);
  return {
    discordEnabled: parsed.DISCORD_ENABLED === "true",
    ...(parsed.DISCORD_BOT_TOKEN === undefined ? {} : { discordBotToken: parsed.DISCORD_BOT_TOKEN }),
    ...(parsed.DISCORD_CLIENT_ID === undefined ? {} : { discordClientId: parsed.DISCORD_CLIENT_ID }),
    ...(parsed.DISCORD_GUILD_ID === undefined ? {} : { discordGuildId: parsed.DISCORD_GUILD_ID }),
    ...(parsed.DISCORD_NOTIFICATION_CHANNEL_ID === undefined
      ? {}
      : { discordNotificationChannelId: parsed.DISCORD_NOTIFICATION_CHANNEL_ID }),
    ...(parsed.DISCORD_ADMIN_ROLE_ID === undefined
      ? {}
      : { discordAdminRoleId: parsed.DISCORD_ADMIN_ROLE_ID }),
    deviceApiKey: parsed.DEVICE_API_KEY,
    deviceId: parsed.DEVICE_ID,
    staleAfterSeconds: parsed.DEVICE_STALE_AFTER_SECONDS,
    healthCheckIntervalSeconds: parsed.HEALTH_CHECK_INTERVAL_SECONDS,
    port: parsed.PORT,
    host: parsed.HOST,
    databasePath: resolve(parsed.DATABASE_PATH),
  };
}

export function getDiscordConfig(config: AppConfig): DiscordConfig | null {
  if (!config.discordEnabled) return null;
  const { discordBotToken, discordClientId, discordGuildId, discordNotificationChannelId } = config;
  if (
    discordBotToken === undefined ||
    discordClientId === undefined ||
    discordGuildId === undefined ||
    discordNotificationChannelId === undefined
  ) {
    throw new Error("Discord configuration is incomplete");
  }
  return {
    token: discordBotToken,
    clientId: discordClientId,
    guildId: discordGuildId,
    notificationChannelId: discordNotificationChannelId,
    ...(config.discordAdminRoleId === undefined ? {} : { adminRoleId: config.discordAdminRoleId }),
  };
}
