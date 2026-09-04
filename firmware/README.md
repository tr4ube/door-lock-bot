# AtomS3 Lite + Grove I2C Color Sensor V2.0

到着直後にセンサー認識と生RGBCを確認し、その後に既存Backendへ状態を送るためのfirmwareです。PlatformIO projectはWindows・macOS・Linux/WSL共通です。

## 推奨する開発環境

- チーム標準: **WSL2 Ubuntu**
- Backend、firmware build、upload、Serial monitorをWSL内で統一
- WindowsからWSLへAtomS3 Liteを渡す部分だけ`usbipd-win`を使用
- Windows/macOSネイティブPlatformIOは予備経路

このメインPCには`usbipd-win`を入れず、実機を使うlaptopへ到着後に導入する前提です。firmwareのcompileは実機なしで先に完了できます。

## 確定しているハードウェア

- M5Stack AtomS3 Lite（SKU C124）
- Grove 4-pin cable
- Seeed Grove - I2C Color Sensor V2.0（SKU 101020341）
- V2.0のセンサーIC: TCS34725FN（TCS3472 family）
- I²C address: `0x29`
- Grove V2.0動作電圧: 3.3–6.0V

AtomS3 LiteのHY2.0-4P配線:

- 黒: GND
- 赤: 5V
- 黄: GPIO2
- 白: GPIO1

Seeed Grove標準は黄=SCL/白=SDAですが、M5の外部I²Cサンプルは逆の割当を使うため、firmwareは両方を試し、`0x29`と正しいIDが返った配線を自動採用します。

コネクタを抜き差しするときはAtomS3 LiteのUSB給電を外してください。対象は発光表示なので、firmwareはTCS34725のINT制御を使って補助白色LEDをOFFにします。

## PlatformIO

VS CodeのPlatformIO IDE extension、またはPlatformIO Coreをインストールします。Repoのnpm scriptsは次を順に探索します。

1. このPCで準備済みのRepo-local PlatformIO
2. PlatformIO既定のuser install
3. PATH上の`pio` / `platformio`

WSLでRepo-local PlatformIOをsudoなしで揃える場合:

```bash
npm run firmware:setup:wsl
```

このsetupは公式`get-pip.py`をHTTPS取得し、固定SHA-256を照合してから、無視対象の`.pio-python/`へPlatformIO Core 6.1.19を入れます。

確認:

```bash
npm run firmware:devices
```

## 1. 到着日の診断

Groveケーブルで直結し、秘密値不要の診断firmwareをbuildします。

```bash
cd path/to/door-lock-bot
npm run firmware:build:diagnostic
```

### WSL2（チーム標準）

実機を接続するlaptopのWindows側に`usbipd-win 5.0+`を入れます。管理者PowerShellで最初の1回だけ:

```powershell
usbipd list
usbipd bind --busid <BUSID>
```

WSLを開いたまま、通常のPowerShellで:

```powershell
usbipd attach --wsl --busid <BUSID>
```

WSL内でportを確認してupload・monitorします。

```bash
npm run firmware:devices
npm run firmware:upload:diagnostic -- --upload-port /dev/ttyACM0
npm run firmware:monitor -- --port /dev/ttyACM0
```

### Windowsネイティブ（予備）

```powershell
npm run firmware:devices
npm run firmware:upload:diagnostic -- --upload-port COM5
npm run firmware:monitor -- --port COM5
```

### macOSネイティブ（予備）

```bash
npm run firmware:devices
npm run firmware:upload:diagnostic -- --upload-port /dev/cu.usbmodemXXXX
npm run firmware:monitor -- --port /dev/cu.usbmodemXXXX
```

port名は`firmware:devices`の実際の表示へ置き換えます。upload modeに入らない場合は、AtomS3 Liteのボタンを約2秒長押しし、内部の緑LEDが点灯したら離します。

成功条件:

1. I²C scanに`0x29`が出る
2. IDが通常`0x44`（互換TCS3472 familyの`0x4D`も受理）
3. `red,green,blue,clear`が1秒ごとにCSV出力される
4. パネルの赤表示と緑表示で値の優勢関係が変わる

## 2. 校正

診断CSVを次の各状態で10–20秒ずつ採取します。

- 緑表示（`LOCKED`）
- 赤表示（`UNLOCKED`）
- センサーを表示から外した状態（`UNKNOWN`の境界）

センサーを表示から数mm〜1cmで固定し、黒いスポンジやフードで外光を遮ってから測ります。実測に合わせて`firmware/include/runtime_config.h`の次を調整します。

- `kMinimumClear`
- `kDominanceRatio`

初期値は仮値です。実機データなしに本番判定値として採用しないでください。

## 3. API送信版

秘密値はcommitせず、ローカル専用headerへ設定します。

```bash
cp firmware/include/secrets.example.h firmware/include/secrets.h
```

macOS/Linux/WSLでは追加で:

```bash
chmod 600 firmware/include/secrets.h
```

設定項目:

- Wi-Fi SSID/password
- Backendの`DEVICE_API_KEY`
- `DEVICE_ID`
- `DEVICE_STATE_URL`

AtomS3 Liteから`localhost`は使えません。同じWi-Fi/LANから到達できるPCのIPv4を使います。

```text
http://192.168.x.x:3000/api/v1/device/state
```

BackendはWSL内で`HOST=0.0.0.0`として起動します。同じLANの別端末から`http://<laptopのIPv4>:3000/health`が開けることを先に確認してください。届かない場合だけ、Windows FirewallのPrivate network許可とWSLのnetworking modeを確認します。

秘密値なしのcompile check:

```bash
npm run firmware:build:runtime-check
```

`secrets.h`設定後のbuild/upload:

```bash
npm run firmware:build:runtime
npm run firmware:upload:runtime -- --upload-port <PORT>
```

runtime動作:

- 1秒ごとにRGBCを測定
- Seeed/M5のSDA・SCL割当を起動時に自動検出
- 補助白色LEDをOFF
- 緑優勢=`LOCKED`、赤優勢=`UNLOCKED`、それ以外=`UNKNOWN`
- 3回連続（約3秒）で状態確定
- 状態変化時に即POST
- 通常時は5分ごとにheartbeat
- POST失敗時は15秒ごとに再試行
- `measuredAt`はNTP同期後のUTC ISO 8601

現状は同一LAN内のHTTP bring-up用です。インターネットへ直接公開しないでください。本番配備前にHTTPS終端と証明書検証を追加します。

## 公式資料

- Seeed V2.0/TCS3472: https://wiki.seeedstudio.com/Grove-I2C_Color_Sensor
- Seeed V2.0 library: https://github.com/Seeed-Studio/Grove_I2C_Color_Sensor_TCS3472
- M5Stack AtomS3 Lite pin map: https://docs.m5stack.com/en/core/AtomS3%20Lite
- Microsoft WSL USB接続: https://learn.microsoft.com/windows/wsl/connect-usb
