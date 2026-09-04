import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { DiscordConfig } from "../config.js";
import type { LockState } from "../domain/lock-state.js";
import type { DoorStateService } from "../services/door-state-service.js";
import { formatDebug, formatHistory, formatLock, stateLabel } from "./formatters.js";
import { commandDefinitions } from "./commands.js";
import { formatJstTime } from "../utils/time.js";

export class DoorLockBot {
  private readonly client = new Client({ intents: [GatewayIntentBits.Guilds] });

  constructor(
    private readonly config: DiscordConfig,
    private readonly deviceId: string,
    private readonly stateService: DoorStateService,
  ) {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      void this.handleCommand(interaction);
    });
  }

  async start(): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(this.config.token);
    await rest.put(Routes.applicationGuildCommands(this.config.clientId, this.config.guildId), {
      body: commandDefinitions,
    });
    await this.client.login(this.config.token);
    console.info(`[INFO] Discord bot logged in user=${this.client.user?.tag ?? "unknown"}`);
  }

  stop(): void {
    this.client.destroy();
  }

  isConnected(): boolean {
    return this.client.isReady();
  }

  async notifyStateChanged(state: LockState, measuredAt: string): Promise<void> {
    if (state === "UNKNOWN") {
      await this.sendNotification(`⚠️ サークルルームの施錠状態が不明になりました\n${formatJstTime(measuredAt)}`);
      return;
    }
    const message =
      state === "LOCKED"
        ? `🔒 サークルルームが施錠されました\n${formatJstTime(measuredAt)}`
        : `🔓 サークルルームが解錠されました\n${formatJstTime(measuredAt)}`;
    await this.sendNotification(message);
  }

  async notifySensorOffline(lastReceivedAt: string): Promise<void> {
    await this.sendNotification(
      `⚠️ サークルルームの鍵センサーから応答がありません\n最終受信: ${formatJstTime(lastReceivedAt)}`,
    );
  }

  async notifySensorRecovered(state: LockState): Promise<void> {
    await this.sendNotification(`✅ 鍵センサーが復帰しました\n現在状態: ${stateLabel(state)}`);
  }

  private async sendNotification(content: string): Promise<void> {
    const channel = await this.client.channels.fetch(this.config.notificationChannelId);
    if (channel === null || !channel.isSendable()) {
      throw new Error("Configured notification channel is not sendable");
    }
    await channel.send({ content });
    console.info("[INFO] Discord notification sent");
  }

  private canUseDebug(interaction: ChatInputCommandInteraction): boolean {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true) return true;
    return (
      this.config.adminRoleId !== undefined &&
      interaction.inCachedGuild() &&
      interaction.member.roles.cache.has(this.config.adminRoleId)
    );
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      switch (interaction.commandName) {
        case "lock": {
          await interaction.reply(formatLock(this.stateService.getEffectiveState(this.deviceId)));
          return;
        }
        case "lock-history": {
          await interaction.reply(`**施錠状態の変化履歴**\n${formatHistory(this.stateService.getHistory(this.deviceId, 10))}`);
          return;
        }
        case "lock-debug": {
          if (!this.canUseDebug(interaction)) {
            await interaction.reply({ content: "このコマンドを使う権限がありません。", flags: MessageFlags.Ephemeral });
            return;
          }
          const effective = this.stateService.getEffectiveState(this.deviceId);
          await interaction.reply({
            content: `\`\`\`text\n${formatDebug(effective.stored, effective)}\n\`\`\``,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        default:
          await interaction.reply({ content: "不明なコマンドです。", flags: MessageFlags.Ephemeral });
      }
    } catch (error: unknown) {
      console.error("[ERROR] Discord command failed", error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "処理中にエラーが発生しました。",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: "処理中にエラーが発生しました。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
