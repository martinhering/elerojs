# Elero USB Transmitter Stick – Serial Protocol Reference

This document describes the serial protocol used to communicate with the **Elero USB Transmitter Stick** (Elero “Transmitter Stick” for blinds and compatible devices). It is independent of any particular home-automation software and is intended for implementing your own server or client.

**Reverse‑engineered from FHEM modules** (36_EleroStick, 36_EleroDrive, 36_EleroSwitch). The stick itself does not publish a formal protocol specification.

---

## Table of Contents

1. [Hardware and connection](#1-hardware-and-connection)
2. [Frame format](#2-frame-format)
3. [Checksum](#3-checksum)
4. [Channel encoding](#4-channel-encoding)
5. [Message types (host → stick)](#5-message-types-host--stick)
6. [Message types (stick → host)](#6-message-types-stick--host)
7. [Command payloads (easy_send)](#7-command-payloads-easy_send)
8. [Status byte (easy_ack)](#8-status-byte-easy_ack)
9. [Recommended behaviour](#9-recommended-behaviour)
10. [Example frames (hex)](#10-example-frames-hex)

---

## 1. Hardware and connection

| Parameter   | Value    |
|------------|----------|
| Interface  | Serial (UART over USB) |
| Baud rate  | **38400** (fixed)     |
| Data bits  | 8 (assumed)           |
| Parity     | None (assumed)        |
| Stop bits  | 1 (assumed)           |

- The stick exposes a virtual serial port (e.g. `/dev/ttyUSB0`, `COM3`). Open it at **38400 baud**.
- All communication is **binary**: bytes are sent and received as raw octets. No ASCII or line-based protocol.

---

## 2. Frame format

Every message is a single frame with the following layout:

| Byte index | Meaning   | Description |
|------------|-----------|-------------|
| 0          | Header    | Always `0xAA`. |
| 1          | Length    | Number of bytes **after** this byte (i.e. payload + checksum). Does **not** include byte 0 or 1. |
| 2          | Command   | Command or type byte (see message types). |
| 3 … N−1    | Payload   | Optional, depends on command. |
| N          | Checksum  | One byte; see [Checksum](#3-checksum). |

**Frame length:** Total frame length = 2 + *Length* (i.e. 2 + value of byte 1). For example, if byte 1 is `0x05`, the frame has 7 bytes total.

**Parsing incoming data:** Buffer incoming bytes. When you have at least 2 bytes, read *Length* from byte 1. Wait until you have received `2 + Length` bytes, then validate checksum and handle the frame. Frames are not delimited by special characters; only length defines boundaries.

---

## 3. Checksum

- **Scope:** All bytes of the frame (header, length, command, payload).
- **Algorithm:** Sum all bytes (as integers 0–255). Then:
  - *checksum* = (smallest multiple of 256 that is ≥ *sum*) − *sum*
- So: *checksum* = (256 − (*sum* mod 256)) mod 256.  
  If *sum* mod 256 = 0, checksum = 0; otherwise checksum = 256 − (*sum* mod 256).

**Example:** Frame bytes `AA 02 4A` → sum = 0xAA + 0x02 + 0x4A = 356. 356 mod 256 = 100. Checksum = 256 − 100 = 156 = `0x9C`. Full frame: `AA 02 4A 9C`.

---

## 4. Channel encoding

The stick supports **15 channels**, numbered **1–15**. In messages, a channel is encoded as two bytes (high byte, low byte) forming a 16‑bit bitmap. Only one bit is set per channel:

- **Channels 1–8:** Encoded in the **low** byte (second byte of the pair).  
  Channel *c* → bit (*c* − 1) set.  
  High byte = `0x00`.  
  Examples: channel 1 → `0x00 0x01`; channel 2 → `0x00 0x02`; channel 8 → `0x00 0x80`.
- **Channels 9–15:** Encoded in the **high** byte (first byte of the pair).  
  Channel *c* → bit (*c* − 9) set.  
  Low byte = `0x00`.  
  Examples: channel 9 → `0x01 0x00`; channel 10 → `0x02 0x00`; channel 15 → `0x40 0x00`.

**Formula:**

- If channel *c* ≤ 8: high = 0, low = 2^(*c*−1).
- If channel *c* ≥ 9: high = 2^(*c*−9), low = 0.

**Decoding:** From the two bytes, channel = 1 + index of the single set bit, where bits 0–7 are in the low byte and bits 8–14 in the high byte (bit 15 unused).

---

## 5. Message types (host → stick)

These are sent **by the host** to the stick.

### 5.1 easy_check – request learned channels

Asks the stick which channels have learned receivers (blinds, switches, etc.).

| Byte | Value   | Meaning    |
|------|---------|------------|
| 0    | `0xAA`  | Header     |
| 1    | `0x02`  | Length     |
| 2    | `0x4A`  | Command    |
| 3    | *checksum* | See [Checksum](#3-checksum). |

**Response:** easy_confirm (see [6.1](#61-easy_confirm--response-to-easy_check)).

---

### 5.2 easy_info – request status for one channel

Requests the current status of a single channel (e.g. position of a blind or state of a switch).

| Byte | Value   | Meaning    |
|------|---------|------------|
| 0    | `0xAA`  | Header     |
| 1    | `0x04`  | Length     |
| 2    | `0x4E`  | Command    |
| 3    | *channel high* | See [Channel encoding](#4-channel-encoding). |
| 4    | *channel low*  | |
| 5    | *checksum*     | |

**Response:** easy_ack (see [6.2](#62-easy_ack--response-to-easy_info-and-easy_send)).

---

### 5.3 easy_send – send command to one channel

Sends a command to one channel (move blind, switch on/off, etc.). Payload depends on device type (blind/drive vs switch); see [Section 7](#7-command-payloads-easy_send).

| Byte | Value   | Meaning    |
|------|---------|------------|
| 0    | `0xAA`  | Header     |
| 1    | `0x05`  | Length     |
| 2    | `0x4C`  | Command    |
| 3    | *channel high* | |
| 4    | *channel low*  | |
| 5    | *payload*     | One byte; see [Section 7](#7-command-payloads-easy_send). |
| 6    | *checksum*    | |

**Response:** easy_ack with the same channel and the new status.

---

## 6. Message types (stick → host)

These are received **by the host** from the stick (responses or unsolicited updates).

### 6.1 easy_confirm – response to easy_check

Sent in reply to **easy_check**. Indicates which channels are “learned” on the stick.

| Byte | Value   | Meaning    |
|------|---------|------------|
| 0    | `0xAA`  | Header     |
| 1    | `0x04`  | Length     |
| 2    | `0x4B`  | Type       |
| 3    | *channel high* | Bitmap of learned channels (bits 8–14 = channels 9–15). |
| 4    | *channel low*  | Bitmap (bits 0–7 = channels 1–8). |
| 5    | *checksum*     | |

**Decoding:** Same 16‑bit bitmap as in [Channel encoding](#4-channel-encoding). A set bit means that channel is learned. Typically only one bit is set per channel when sending commands; in easy_confirm, multiple bits can be set (all learned channels).

---

### 6.2 easy_ack – response to easy_info and easy_send

Sent in reply to **easy_info** or **easy_send**, or when the stick reports a status change. Carries channel and status.

| Byte | Value   | Meaning    |
|------|---------|------------|
| 0    | `0xAA`  | Header     |
| 1    | `0x05`  | Length     |
| 2    | `0x4D`  | Type       |
| 3    | *channel high* | Target channel (single channel encoding). |
| 4    | *channel low*  | |
| 5    | *status*      | One byte; see [Section 8](#8-status-byte-easy_ack). |
| 6    | *checksum*    | |

---

## 7. Command payloads (easy_send)

The payload (byte 5 of easy_send) selects the action. The same stick/channel can control either a **blind/drive** (motor) or a **switch**; the hardware is the same, the meaning of the payload differs by device type.

### 7.1 Blind / drive (motor)

| Payload (hex) | Meaning        | Typical use      |
|---------------|----------------|-------------------|
| `0x20`        | Top            | Blind fully open  |
| `0x40`        | Bottom         | Blind fully closed|
| `0x10`        | Stop           | Stop movement     |
| `0x44`        | Intermediate   | Preset position   |
| `0x24`        | Tilt           | Tilt position     |

### 7.2 Switch (on/off / dim)

| Payload (hex) | Meaning     |
|---------------|-------------|
| `0x20`        | On          |
| `0x10`        | Off         |
| `0x44`        | Dim 1       |
| `0x24`        | Dim 2       |

(Values match the drive payloads; interpretation depends on whether the receiver is a blind or a switch.)

---

## 8. Status byte (easy_ack)

The status byte (byte 5 of easy_ack) describes the current state of the channel. Your software can map these to positions or switch states.

### 8.1 When the channel is a blind / drive

| Status (hex) | Meaning (semantic)        | Position hint     |
|--------------|---------------------------|-------------------|
| `0x00`       | No information            | —                 |
| `0x01`       | Top position              | Open (0%)         |
| `0x02`       | Bottom position           | Closed (100%)     |
| `0x03`       | Intermediate position     | Configurable %    |
| `0x04`       | Tilt position             | Configurable %    |
| `0x05`       | Blocking                  | —                 |
| `0x06`       | Overheated                | —                 |
| `0x07`       | Timeout                   | —                 |
| `0x08`       | Move up started           | —                 |
| `0x09`       | Move down started         | —                 |
| `0x0A`       | Moving up                 | —                 |
| `0x0B`       | Moving down               | —                 |
| `0x0D`       | Stopped in undefined position | —             |
| `0x0E`       | Top tilt stop             | —                 |
| `0x0F`       | Bottom intermediate stop | —                 |
| `0x10`       | Switching device off      | —                 |
| `0x11`       | Switching device on       | —                 |

### 8.2 When the channel is a switch

| Status (hex) | Meaning        |
|--------------|----------------|
| `0x00`       | No information |
| `0x01`       | Off            |
| `0x02`       | On             |
| `0x03`       | Dim 1          |
| `0x04`       | Dim 2          |
| `0x05`–`0x0B`, `0x0D`–`0x0F` | Various / unknown |
| `0x10`       | Off            |
| `0x11`       | On             |

(Your application decides which channels are “blinds” vs “switches” and interprets the status byte accordingly.)

---

## 9. Recommended behaviour

- **Throttling:** Send one command at a time and wait for the corresponding easy_ack (or a short timeout, e.g. 5 s) before sending the next. The reference implementation used a queue with ~0.5 s delay between sends so the stick/receivers are not overwhelmed.
- **Discovery:** After opening the serial port, send **easy_check** once to get the set of learned channels. Use the easy_confirm bitmap to know which channel numbers (1–15) exist.
- **Polling:** To keep state up to date, periodically send **easy_info** for each learned channel (e.g. round‑robin with a few seconds between requests, then a longer pause before the next round). Each answer is an **easy_ack** with current status.
- **Framing:** Always buffer by length: read byte 1 (Length), then wait for `2 + Length` bytes total before parsing and checking the checksum.

---

## 10. Example frames (hex)

- **easy_check (host → stick):**  
  `AA 02 4A <checksum>`  
  Example (checksum 0x9C): `AA 02 4A 9C`

- **easy_confirm (stick → host), channels 1 and 3 learned:**  
  Low byte = 0x01 | 0x04 = 0x05, high = 0x00 → `AA 04 4B 00 05 <checksum>`

- **easy_info for channel 1 (host → stick):**  
  Channel 1 → high 0x00, low 0x01 → `AA 04 4E 00 01 <checksum>`

- **easy_send: channel 1, move to top (host → stick):**  
  Payload 0x20 → `AA 05 4C 00 01 20 <checksum>`

- **easy_ack: channel 1, top position (stick → host):**  
  `AA 05 4D 00 01 01 <checksum>`  
  (e.g. checksum 0x02 for `AA 05 4D 00 01 01 02`)

---

*This protocol description was derived from the FHEM Elero modules (36_EleroStick.pm, 36_EleroDrive.pm, 36_EleroSwitch.pm) for use with any server or client implementation.*
