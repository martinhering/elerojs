/*
 * Copyright (C) 2026 elerojs
 * Author: Martin Hering
 * Date: Feb 1 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/** Frame header */
export const HEADER = 0xaa;

/** Command bytes (host → stick) */
export const CMD_EASY_CHECK = 0x4a;
export const CMD_EASY_INFO = 0x4e;
export const CMD_EASY_SEND = 0x4c;

/** Response type bytes (stick → host) */
export const RSP_EASY_CONFIRM = 0x4b;
export const RSP_EASY_ACK = 0x4d;

/** Payload bytes for blind/drive (easy_send) */
export const PAYLOAD_TOP = 0x20;
export const PAYLOAD_BOTTOM = 0x40;
export const PAYLOAD_STOP = 0x10;
export const PAYLOAD_INTERMEDIATE = 0x44;
export const PAYLOAD_TILT = 0x24;

/** Action name → payload byte for blind */
export const ACTION_TO_PAYLOAD = {
  top: PAYLOAD_TOP,
  bottom: PAYLOAD_BOTTOM,
  stop: PAYLOAD_STOP,
  intermediate: PAYLOAD_INTERMEDIATE,
  tilt: PAYLOAD_TILT,
};

/** Status byte → semantic (blind/drive). From docs Section 8.1 */
export const STATUS_DRIVE = {
  0x00: 'no_information',
  0x01: 'top_position',
  0x02: 'bottom_position',
  0x03: 'intermediate_position',
  0x04: 'tilt_position',
  0x05: 'blocking',
  0x06: 'overheated',
  0x07: 'timeout',
  0x08: 'move_up_started',
  0x09: 'move_down_started',
  0x0a: 'moving_up',
  0x0b: 'moving_down',
  0x0d: 'stopped_in_undefined_position',
  0x0e: 'top_tilt_stop',
  0x0f: 'bottom_intermediate_stop',
  0x10: 'switching_device_off',
  0x11: 'switching_device_on',
};

/** Status byte → semantic (switch). From docs Section 8.2 */
export const STATUS_SWITCH = {
  0x00: 'no_information',
  0x01: 'off',
  0x02: 'on',
  0x03: 'dim1',
  0x04: 'dim2',
  0x10: 'off',
  0x11: 'on',
};

/**
 * Compute checksum: (256 - (sum % 256)) % 256.
 * @param {Buffer} bytes
 * @returns {number}
 */
export function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum += bytes[i];
  return (256 - (sum % 256)) % 256;
}

/**
 * Encode channel 1–15 as [high, low] bytes (single-bit bitmap).
 * @param {number} channel - 1..15
 * @returns {[number, number]} [high, low]
 */
export function channelToBytes(channel) {
  if (channel < 1 || channel > 15) throw new RangeError('channel must be 1..15');
  if (channel <= 8) {
    return [0x00, 1 << (channel - 1)];
  }
  return [1 << (channel - 9), 0x00];
}

/**
 * Decode single channel from two bytes (exactly one bit set).
 * @param {number} high
 * @param {number} low
 * @returns {number} channel 1..15, or 0 if no single bit / invalid
 */
export function bytesToChannel(high, low) {
  const word = (high << 8) | low;
  let channel = 1;
  let n = word;
  while (n !== 1 && channel <= 15) {
    n = n >>> 1;
    channel++;
  }
  return channel <= 15 && (word & (word - 1)) === 0 ? channel : 0;
}

/**
 * Decode bitmap (easy_confirm) to list of channel numbers 1..15.
 * @param {number} high
 * @param {number} low
 * @returns {number[]}
 */
export function bitmapToChannels(high, low) {
  const channels = [];
  const word = (high << 8) | low;
  for (let i = 0; i < 15; i++) {
    if (word & (1 << i)) channels.push(i + 1);
  }
  return channels;
}

/**
 * Build a frame: header, length, cmd, payload..., checksum.
 * @param {number} cmd
 * @param {number[]} [payloadBytes]
 * @returns {Buffer}
 */
export function buildFrame(cmd, payloadBytes = []) {
  const body = Buffer.from([cmd, ...payloadBytes]);
  const length = body.length + 1; // +1 for checksum
  const headerAndLength = Buffer.from([HEADER, length]);
  const all = Buffer.concat([headerAndLength, body]);
  const csum = checksum(all);
  return Buffer.concat([all, Buffer.from([csum])]);
}

/**
 * Parse a complete frame. Validates length and checksum.
 * @param {Buffer} buffer - Full frame (2 + buffer[1] bytes)
 * @returns {{ cmd: number, payload: Buffer } | null}
 */
export function parseFrame(buffer) {
  if (buffer.length < 3) return null;
  const len = buffer[1];
  const total = 2 + len;
  if (buffer.length < total) return null;
  const frame = buffer.subarray(0, total);
  const body = frame.subarray(2, total - 1);
  const receivedChecksum = frame[total - 1];
  const expectedChecksum = checksum(frame.subarray(0, total - 1));
  if (receivedChecksum !== expectedChecksum) return null;
  return { cmd: body[0], payload: body.subarray(1) };
}

/**
 * Build easy_check request.
 * @returns {Buffer}
 */
export function buildEasyCheck() {
  return buildFrame(CMD_EASY_CHECK, []);
}

/**
 * Build easy_info request for one channel.
 * @param {number} channel - 1..15
 * @returns {Buffer}
 */
export function buildEasyInfo(channel) {
  const [high, low] = channelToBytes(channel);
  return buildFrame(CMD_EASY_INFO, [high, low]);
}

/**
 * Build easy_send for one channel with payload byte.
 * @param {number} channel - 1..15
 * @param {number} payloadByte
 * @returns {Buffer}
 */
export function buildEasySend(channel, payloadByte) {
  const [high, low] = channelToBytes(channel);
  return buildFrame(CMD_EASY_SEND, [high, low, payloadByte]);
}

/**
 * Get semantic for status byte (blind/drive). Defaults to 'unknown' if not in map.
 * @param {number} statusByte
 * @returns {string}
 */
export function statusByteToDriveSemantic(statusByte) {
  return STATUS_DRIVE[statusByte] ?? 'unknown';
}

/**
 * Get semantic for status byte (switch).
 * @param {number} statusByte
 * @returns {string}
 */
export function statusByteToSwitchSemantic(statusByte) {
  return STATUS_SWITCH[statusByte] ?? 'unknown';
}
