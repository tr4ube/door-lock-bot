# サークルルーム施錠状態 Discord Bot

ATOMS3などのセンサーデバイスから施錠状態を受け取り、SQLiteへ保存し、Discordコマンドと自動通知で確認できるMVPです。Discord Gateway・HTTP API・状態管理は1つのNode.jsプロセスで動きます。

## 機能

- `POST /api/v1/device/state`（Bearer API key）
- SQLiteへの最新状態・状態変化履歴・sensor health保存
- `/lock`、`/lock-history`、管理者向け `/lock-debug`
- `LOCKED` / `UNLOCKED` / `UNKNOWN` の3値
- 同一状態heartbeatを履歴・通知から除外
- heartbeat停止時のeffective `UNKNOWN`、停止通知1回、復帰通知
- 実機不要のmock scripts
- VitestによるAPI・状態変化・stale・healthテスト

## 必要環境

- Node.js 22以上
- npm
- WSL2 Ubuntu 22.04以降を推奨（Windows上で開発する場合）
- Discord Botを接続する場合はDiscord Application

## WSLでのセットアップ

```bash
cd /home/traube/door-lock-bot
cp .env.example .env
chmod 600 .env
npm install
```

`.env` の `DEVICE_API_KEY` は開発用でも十分長いランダム値へ変更してください。`.env` とSQLiteファイルはGit管理外です。

APIだけ先に試す場合:

```env
DISCORD_ENABLED=false
DEVICE_API_KEY=dev-secret-change-me
```

## Discord Applicationの準備

1. [Discord Developer Portal](https://discord.com/developers/applications) でApplicationを作成する。
2. **Bot** ページでBotを追加し、tokenを再発行して `DISCORD_BOT_TOKEN` に設定する。
3. **General Information** のApplication IDを `DISCORD_CLIENT_ID` に設定する。
4. DiscordのDeveloper Modeを有効化し、対象サーバーIDを `DISCORD_GUILD_ID`、通知チャンネルIDを `DISCORD_NOTIFICATION_CHANNEL_ID` に設定する。
5. OAuth2 URL Generatorで `bot` と `applications.commands` scopeを選ぶ。
6. Bot権限は `View Channels`、`Send Messages`、`Embed Links`、`Use Application Commands` のみにする。
7. 生成URLから対象サーバーへBotを追加する。

Message Content Intentは不要です。コマンドは起動時にGuild Commandとして自動登録されます。

`/lock-debug` は次のどちらかだけが利用できます。

- `Manage Server` 権限を持つユーザー
- `DISCORD_ADMIN_ROLE_ID` に指定したRoleを持つユーザー

## 環境変数

`.env.example` を参照してください。主要項目:

- `DEVICE_ID`: 許可するデバイスID。異なるIDは404。
- `DEVICE_STALE_AFTER_SECONDS`: 最終受信からUNKNOWNにする秒数。既定900秒。
- `HEALTH_CHECK_INTERVAL_SECONDS`: stale監視間隔。既定30秒。
- `DATABASE_PATH`: SQLiteファイル。親ディレクトリとテーブルは起動時に自動作成。
- `DISCORD_ENABLED=false`: Discord資格情報なしでAPIのみ起動。

## 開発起動

```bash
npm run dev
```

ヘルスチェック:

```bash
curl http://localhost:3000/health
```

Discord接続済みなら `discord` は `connected`、API-onlyでは `disconnected` です。

## Device API契約

### Endpoint

```http
POST /api/v1/device/state
Content-Type: application/json
Authorization: Bearer <DEVICE_API_KEY>
```

最小payload:

```json
{
  "deviceId": "circle-room-door-01",
  "state": "LOCKED",
  "measuredAt": "2026-09-04T15:00:00+09:00"
}
```

全payload:

```json
{
  "deviceId": "circle-room-door-01",
  "state": "LOCKED",
  "confidence": 0.97,
  "sensor": { "r": 12540, "g": 3220, "b": 2810, "clear": 19600 },
  "batteryPercent": 83,
  "firmwareVersion": "0.1.0",
  "measuredAt": "2026-09-04T15:00:00+09:00"
}
```

- 正常: `200 {"ok":true}`
- API keyなし・不正: `401`
- payload不正: `400`
- `DEVICE_ID` と異なるdevice: `404`

`receivedAt` はサーバー時刻で記録します。APIはRGB値から状態を推測しません。
現在値より古い `measuredAt` の遅延payloadと、同一測定時刻なのに状態が異なる矛盾payloadは、状態を巻き戻さず `200 {"ok":true}` で冪等に無視します。

## 実機の色判定との対応

今回確認した表示に合わせ、ATOMS3側では次の意味で判定します。

- 緑表示: `LOCKED`
- 赤表示: `UNLOCKED`
- 消灯・曖昧・センサー異常: `UNKNOWN`

この色判定はファームウェア側の責務です。Backendは受信した状態をそのまま保存し、RGB値から再判定しません。mock scriptsのRGB値もこの対応に合わせています。

## 実機なしでの確認

サーバー起動中に別ターミナルから:

```bash
npm run mock:locked
npm run mock:unlocked
MOCK_STATE=UNLOCKED npm run mock:heartbeat
```

最初の状態は保存のみです。同じ状態のheartbeatでは履歴もDiscord通知も増えません。状態が変わると履歴が1件追加され、通知チャンネルへ投稿されます。

## テスト・ビルド・本番起動

```bash
npm test
npm run build
npm start
```

`npm start` はコンパイル済みの `dist/src/index.js` を起動します。

## SQLiteの扱い

初回起動時に次のテーブルを作ります。

- `door_state`: deviceごとの最新状態
- `state_history`: 状態が変わった時だけ追加
- `sensor_health`: `ONLINE` / `OFFLINE` を永続化し、再起動後の停止通知重複を防止
- `sensor_health_notification`: 未送達の停止・復帰通知。Discord一時障害時は次の監視周期またはheartbeatで再試行

heartbeat timeoutでは `door_state.state` を書き換えず、表示時だけeffective `UNKNOWN` にします。

## Firmware

AtomS3 Lite + Grove I2C Color Sensor V2.0の診断・校正・API送信手順は [`firmware/README.md`](firmware/README.md) にあります。V2.0はTCS34725FN（TCS3472 family、I²C `0x29`）で、緑=`LOCKED`、赤=`UNLOCKED`として3秒連続判定します。

## 運用上の注意

- `DEVICE_API_KEY`、Discord token、`.env` をcommit・Discord投稿・ログ出力しない。
- インターネット公開時はNode.jsを直接公開せず、HTTPS reverse proxyやクラウド側TLSを置く。
- 通知失敗でも先に保存済みの状態はrollbackしない。失敗はログへ記録する。
- Discordへの初回ログインに失敗してもAPIとSQLiteは縮退運転を続ける。資格情報修正後にプロセスを再起動する。
- M5Stack側は状態変化時に即時POSTし、通常時は5分ごとのheartbeatを推奨。
