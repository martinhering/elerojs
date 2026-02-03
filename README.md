# elerojs

HTTP/WebSocket server for the **Elero USB Transmitter Stick**, to control Elero blinds and compatible devices over a REST API and optional real-time WebSocket updates.

## Prerequisites

- **Node.js 16+**
- Elero USB Transmitter Stick connected (appears as a serial port, e.g. `/dev/ttyUSB0` on Linux, `COM3` on Windows)

## Configuration

Set the serial port before starting. Required:

- **SERIAL_PORT** – Path to the serial device (e.g. `/dev/cu.usbserial-*` on macOS, `/dev/ttyUSB0` on Linux, `COM3` on Windows)

Optional (defaults in parentheses):

- **HTTP_PORT** – Port for the HTTP API (default: `3000`)
- **WS_ENABLE** – Enable WebSocket at `/ws` (default: `true`)
- **COMMAND_DELAY_MS** – Delay in ms between queued commands (default: `500`)
- **LATITUDE** / **LONGITUDE** – GPS coordinates for sunrise/sunset (optional; required for schedule rules). Alternatively **GEO_LOCATION** = `lat,lon` (e.g. `52.52,13.405`).

You can set these in a **`.env`** file in the project root (loaded automatically). Example:

```
SERIAL_PORT=/dev/cu.usbserial-AM00SHJ3
# HTTP_PORT=3000
# WS_ENABLE=true
# COMMAND_DELAY_MS=500
# LATITUDE=52.52
# LONGITUDE=13.405
```

Or export them before starting:

```bash
export SERIAL_PORT=/dev/cu.usbserial-AM00SHJ3
npm start
```

```cmd
set SERIAL_PORT=COM3
npm start
```

A phone-friendly web UI is available at `http://<host>:3000/` when the server is running (Up/Down/Stop per channel, channel names, schedule rules, live status over WebSocket). Schedule rules (e.g. "close 1 h after sunset", "open 1 h before sunrise but not before 6 am", or "at 07:00" / "at 22:30") are configured in the web UI and stored in `schedule-rules.json`; set **LATITUDE** and **LONGITUDE** (or **GEO_LOCATION**) so the server can compute sunrise/sunset.

## API

- **GET /channels** – List learned channel numbers (1–15). If empty, triggers a discovery (easy_check) and returns the result.
- **GET /channels/names** – Channel name map (shared by all clients). Returns `{ "1": "Living room", ... }`.
- **PUT /channels/names** – Replace channel names. Body: `{ "1": "Living room", "2": "Kitchen", ... }`. Stored in `channel-names.json` on the server.
- **GET /channels/:id** or **GET /channels/:id/status** – Current status for channel `:id`. If unknown, requests status from the stick first.
- **POST /channels/:id/command** – Send a command. Body: `{ "action": "top" | "bottom" | "stop" | "intermediate" | "tilt" }`.

- **GET /schedule/rules** – List schedule rules (array of rules: `trigger` is `after_sunset`, `before_sunrise`, or `at_time`; sun rules have `offsetMinutes`; `at_time` rules have `time` (HH:mm); optional `minTime`/`maxTime`, `lastFiredDate`).
- **PUT /schedule/rules** – Replace schedule rules. Body: array of rules (without `id` for new ones; server assigns IDs and keeps `lastFiredDate`).
- **GET /schedule/sun** – Today’s sunrise and sunset (ISO strings). Returns 503 if LATITUDE/LONGITUDE are not set.

WebSocket **/ws**: On connect, receive current state; on each status change, receive `{ channel, status }`.

## Protocol

The serial protocol is documented in [docs/Elero-Blinds-USB-Stick.md](docs/Elero-Blinds-USB-Stick.md).
