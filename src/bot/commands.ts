import { SlashCommandBuilder } from "discord.js";

export const commandDefinitions = [
  new SlashCommandBuilder().setName("lock").setDescription("現在の施錠状態を表示します"),
  new SlashCommandBuilder()
    .setName("lock-history")
    .setDescription("直近10件の状態変化履歴を表示します"),
  new SlashCommandBuilder()
    .setName("lock-debug")
    .setDescription("管理者向けのセンサー詳細を表示します"),
].map((command) => command.toJSON());
