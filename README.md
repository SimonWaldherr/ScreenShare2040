# ScreenShare2040 v2
## Raspberry Pi Pico W Hub75-Display Project

This project utilizes a Raspberry Pi Pico W ([Pimoroni Interstate 75 W](https://shop.pimoroni.com/products/interstate-75-w?variant=40453881299027)) to drive a 64×64 Hub75 RGB LED Matrix.

The display can show content from a web-based drawing canvas, uploaded images, screen-sharing, typed text, and animated clocks.
It connects to Wi-Fi (or runs its own access point), and exposes a REST API so any HTTP client can push content to the display.

---

## What's new in v2

| Feature | v1 | v2 |
|---|---|---|
| WiFi credentials | hardcoded in source | stored in `config.json`, configurable via web UI |
| Serves `app.js` | ❌ (bug) | ✅ streamed in chunks |
| Drawing tools | pen, eraser | pen, eraser, **fill**, **line**, **rectangle** |
| Undo / Redo | ❌ | ✅ (5 steps) |
| Touch support | ❌ | ✅ |
| Text mode | ❌ | ✅ POST `/api/text` |
| Brightness control | ❌ | ✅ POST `/api/brightness` |
| Connection status | ❌ | ✅ live indicator |
| Clock styles | 5 | 7 (+ improved analog) |
| Web UI | `<details>` dropdowns | dark-theme sidebar layout |
| Screen share | auto-trims on start | auto-trims + stops cleanly |
| HTTP API | POST `/` only | full REST API (see below) |

---

## Hardware

- [Pimoroni Interstate 75 W](https://shop.pimoroni.com/products/interstate-75-w?variant=40453881299027) (RP2040 + CYW43439)
- 64×64 HUB75 RGB LED Matrix panel

---

## Setup

1. Flash the [Pimoroni MicroPython](https://github.com/pimoroni/pimoroni-pico/releases) firmware onto your Interstate 75 W.
2. Copy `main.py`, `index.html`, and `app.js` to the root of the Pico's filesystem (e.g. via Thonny or `mpremote`).
3. **Optional – set WiFi credentials at first boot:**
   - On first boot (no `config.json` present) the Pico starts a soft access point named `pico_ap` with password `12345678`.
   - Connect to that AP, open `http://192.168.4.1`, go to *📡 WiFi Config* in the sidebar, enter your network SSID & password and click **Save & Reboot**.
   - The Pico will restart and connect to your network; its IP address is shown on the LED matrix.
4. Open a browser, navigate to the Pico's IP and start using the web UI.

---

## REST API

All endpoints support `Access-Control-Allow-Origin: *`.

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/` | – | Serves `index.html` |
| `GET` | `/app.js` | – | Serves `app.js` |
| `GET` | `/api/status` | – | JSON device status (IP, brightness, size, version) |
| `GET` | `/api/config` | – | JSON WiFi config (password omitted) |
| `POST` | `/` or `/api/pixels` | 8192 bytes raw RGB565 | Render a full 64×64 frame |
| `POST` | `/api/clear` | – | Clear the display |
| `POST` | `/api/text` | JSON | Draw text on the display |
| `POST` | `/api/brightness` | JSON `{"level": 0–255}` | Set display brightness |
| `POST` | `/api/config` | JSON `{"ssid":"…","password":"…"}` | Save WiFi config & reboot |

### `/api/text` body

```json
{
  "text":  "Hello!",
  "x":     0,
  "y":     0,
  "r":     255,
  "g":     255,
  "b":     255,
  "size":  "large",
  "clear": false
}
```

`size` is `"large"` (8×8 px glyphs) or `"small"` (5×5 px glyphs).  
`clear` clears the display before drawing when `true`.

---

## Web UI modes

| Mode | Description |
|---|---|
| ✏️ Draw | Freehand drawing with pen, eraser, flood-fill, line or rectangle tools. Undo/redo, colour picker, invert, save PNG. |
| 📁 Upload | Upload any image; it is scaled to 64×64 and sent to the display. |
| 🖥️ Screen Share | Captures your screen via `getDisplayMedia`, auto-crops non-black content, and streams it at ~30 fps. |
| 💬 Text | Type a message, choose position, colour and glyph size, then push it to the display. |
| 🕐 Clock | Seven clock styles: Analog, Digital, Abstract, Binary, Bar, Segment, Dot. Updates every 250 ms. |
| 📡 WiFi Config | Change the stored WiFi credentials on the Pico without editing source files. |
