# ESP32 CAR - BLE Gamepad Controller

Mobile gamepad controller for ESP32-CAM robots via Bluetooth Low Energy (BLE).

## Features

- **BLE Connection**: Nordic UART Service (NUS) protocol
- **D-Pad Controls**: Forward, Back, Left, Right, Stop
- **Hold-to-Move**: Continuous command sending while button pressed (120ms default)
- **Auto-Reconnect**: Automatic reconnection with exponential backoff
- **Real-time Status**: Connection state, RSSI, last command
- **Configurable**: Device name, scan mode, keep-alive interval

## Setup Instructions

### 1. Build the App

The app is configured with Capacitor for mobile deployment.

```bash
# Install dependencies
npm install

# Build the web app
npm run build

# Initialize Capacitor (first time only)
npx cap init

# Add platforms
npx cap add android
npx cap add ios

# Sync files
npx cap sync
```

### 2. Run on Device

**Android:**
```bash
npx cap run android
```

**iOS (Mac with Xcode required):**
```bash
npx cap run ios
```

### 3. Development Mode

For development with hot-reload, the Capacitor config is set to use the Lovable preview URL. This lets you test changes instantly without rebuilding.

To switch to local mode:
1. Comment out the `server` section in `capacitor.config.json`
2. Run `npx cap sync`

## BLE Protocol

### Service & Characteristics

- **Service UUID**: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- **RX Characteristic** (app → ESP32, write without response): `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`
- **TX Characteristic** (ESP32 → app, notify): `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`

### Commands (1 byte ASCII)

| Command | Action |
|---------|--------|
| `F` | Forward |
| `B` | Back |
| `L` | Left (turn) |
| `R` | Right (turn) |
| `S` | Stop |
| `U` | Forward (alternative) |
| `D` | Back (alternative) |

### Keep-Alive Behavior

- While button is pressed: send command every 120ms (configurable 80-200ms)
- On button release: send `S` once and stop keep-alive
- ESP32 fail-safe: stops if no command received for ~1.5s

## Usage

### 1. Connect Screen

1. Power on your ESP32-CAR
2. Tap "Scan & Connect"
3. Select your device from the list (shows RSSI signal strength)
4. App automatically connects

**No devices found?**
- Check ESP32 is powered on and BLE is advertising
- Try Settings → "Scan by Service UUID" toggle
- Ensure Bluetooth is enabled on your phone
- Check permissions (see Troubleshooting)

### 2. Gamepad Screen

- **Arrow buttons**: Press and hold to move continuously
- **Center button (■)**: Emergency stop
- **Status bar**: Shows connection state, last command, RSSI
- **Disconnect**: Tap to return to Connect screen

**Tips:**
- Buttons provide haptic feedback (if supported)
- Outdoor use: High-contrast design works in sunlight
- Battery: Dark theme saves battery

### 3. Settings Screen

- **Device Name**: Filter devices by name (default: ESP32-CAR)
- **Scan by Service UUID**: Search by service instead of name
- **Keep-Alive Interval**: Command frequency while holding (80-200ms)

## Troubleshooting

### Permissions Issues

**Android 12+:**
- Requires `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` permissions
- Tap "Allow" when prompted
- If denied, go to Settings → Apps → ESP32 CAR → Permissions

**Android ≤11:**
- Requires Location permission for BLE scanning
- Enable Location in device settings

**iOS:**
- Requires Bluetooth permission
- Go to Settings → ESP32 CAR → Bluetooth

### Connection Problems

**"No devices found"**
1. Verify ESP32 is powered and BLE advertising active
2. Check ESP32 advertises as "ESP32-CAR" or with NUS service UUID
3. Try Settings → toggle "Scan by Service UUID"
4. Restart ESP32 and try again

**"Failed to connect"**
1. Ensure no other app is connected to the ESP32
2. Restart Bluetooth on phone
3. Power cycle the ESP32
4. Clear pairing in phone Bluetooth settings (should not be needed)

**Disconnects frequently**
1. Check RSSI signal strength (>-80 dBm recommended)
2. Reduce distance between phone and ESP32
3. Check for BLE interference (Wi-Fi, other devices)
4. Verify ESP32 power supply is stable

### Reconnection

The app automatically attempts to reconnect with exponential backoff:
- 1s, 2s, 5s, 10s intervals
- Status shows "Reconnecting..." with attempt number
- Manual: Tap Disconnect → rescan

### Commands Not Working

1. Check "Last command" in gamepad status bar
2. Verify TX characteristic is sending echo (check logs if available)
3. Test emergency stop button - should send `S` immediately
4. Restart connection

### Build Issues

**Android build fails:**
```bash
# Update Android SDK
cd android
./gradlew clean

# Sync Capacitor
cd ..
npx cap sync android
```

**iOS build fails:**
```bash
# Update CocoaPods
cd ios/App
pod install

# Sync Capacitor
cd ../..
npx cap sync ios
```

## Technical Notes

### No Bluetooth Pairing Required

The app connects directly without OS-level pairing. All connection logic happens within the app.

### Fail-Safe Mechanisms

1. **App-side**: Sends `S` on button release
2. **Keep-alive stops**: Clears interval on disconnect
3. **ESP32-side**: Stops if no command for ~1.5s (firmware must implement)

### Battery Optimization

- Dark theme reduces OLED power consumption
- BLE Low Energy protocol is battery efficient
- Keep-alive interval affects battery (120ms default is optimal)

## Future Extensions

The app architecture supports future features:
- Speed control slider (PWM mapping)
- Turbo/slow mode buttons
- Battery telemetry from TX characteristic
- Config mode (adjust motor inversion via app)
- Multiple profiles for different robots

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review BLE logs in browser console (dev mode)
3. Verify ESP32 firmware matches protocol spec
4. Test with known working ESP32 setup

## License

Built with Lovable for ESP32-CAM robotics projects.
