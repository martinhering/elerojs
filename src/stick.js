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

import * as serial from './serial.js';
import * as protocol from './protocol.js';
import * as state from './state.js';

const RESPONSE_TIMEOUT_MS = 5000;
const DEFAULT_DELAY_MS = 500;

/** @type {number} */
let commandDelayMs = DEFAULT_DELAY_MS;

/** @type {Array<{ type: 'easy_check' | 'easy_info' | 'easy_send', channel?: number, payload?: number, resolve: (value: any) => void, reject: (err: Error) => void }>} */
const queue = [];

/** @type {Buffer} */
let readBuffer = Buffer.alloc(0);

/** @type {NodeJS.Timeout | null} */
let responseTimer = null;

/** @type {boolean} */
let processing = false;

/**
 * Configure delay between queue items (ms).
 * @param {number} ms
 */
export function setCommandDelayMs(ms) {
  commandDelayMs = ms;
}

function clearResponseTimer() {
  if (responseTimer) {
    clearTimeout(responseTimer);
    responseTimer = null;
  }
}

function failPending(reject, err) {
  clearResponseTimer();
  if (reject) reject(err);
}

function onSerialData(data) {
  readBuffer = Buffer.concat([readBuffer, data]);
  while (readBuffer.length >= 2) {
    const len = readBuffer[1];
    const total = 2 + len;
    if (readBuffer.length < total) break;
    const frame = readBuffer.subarray(0, total);
    readBuffer = readBuffer.subarray(total);
    const parsed = protocol.parseFrame(frame);
    if (!parsed) continue;
    if (parsed.cmd === protocol.RSP_EASY_CONFIRM) {
      const high = parsed.payload[0];
      const low = parsed.payload[1];
      const channels = protocol.bitmapToChannels(high, low);
      state.setLearnedChannels(channels);
      clearResponseTimer();
      const item = queue[0];
      if (item && item.type === 'easy_check') {
        queue.shift();
        item.resolve(channels);
        processing = false;
        setTimeout(() => processNext(), commandDelayMs);
      }
    } else if (parsed.cmd === protocol.RSP_EASY_ACK) {
      const high = parsed.payload[0];
      const low = parsed.payload[1];
      const channel = protocol.bytesToChannel(high, low);
      const statusByte = parsed.payload[2];
      if (channel >= 1 && channel <= 15) {
        state.setChannelStatus(channel, statusByte);
      }
      clearResponseTimer();
      const item = queue[0];
      if (item && (item.type === 'easy_info' || item.type === 'easy_send')) {
        queue.shift();
        item.resolve(undefined);
        processing = false;
        setTimeout(() => processNext(), commandDelayMs);
      }
    }
  }
}

function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const item = queue[0];
  let buffer;
  try {
    if (item.type === 'easy_check') {
      buffer = protocol.buildEasyCheck();
    } else if (item.type === 'easy_info' && item.channel != null) {
      buffer = protocol.buildEasyInfo(item.channel);
    } else if (item.type === 'easy_send' && item.channel != null && item.payload != null) {
      buffer = protocol.buildEasySend(item.channel, item.payload);
    } else {
      queue.shift();
      item.reject(new Error('Invalid queue item'));
      processing = false;
      setTimeout(() => processNext(), commandDelayMs);
      return;
    }
  } catch (e) {
    queue.shift();
    item.reject(e);
    processing = false;
    setTimeout(() => processNext(), commandDelayMs);
    return;
  }

  serial.write(buffer).then(
    () => {
      responseTimer = setTimeout(() => {
        responseTimer = null;
        if (queue[0] === item) {
          queue.shift();
          item.reject(new Error('Response timeout'));
        }
        processing = false;
        setTimeout(() => processNext(), commandDelayMs);
      }, RESPONSE_TIMEOUT_MS);
    },
    (err) => {
      queue.shift();
      item.reject(err);
      processing = false;
      setTimeout(() => processNext(), commandDelayMs);
    }
  );
}

function enqueue(item) {
  return new Promise((resolve, reject) => {
    queue.push({ ...item, resolve, reject });
    if (queue.length === 1 && !processing) {
      setTimeout(() => processNext(), 0);
    }
  });
}

/**
 * Send easy_check and return learned channel numbers.
 * @returns {Promise<number[]>}
 */
export function easyCheck() {
  return enqueue({ type: 'easy_check' });
}

/**
 * Send easy_info for one channel; state is updated when easy_ack is received.
 * @param {number} channel - 1..15
 * @returns {Promise<void>}
 */
export function easyInfo(channel) {
  return enqueue({ type: 'easy_info', channel });
}

/**
 * Send easy_send for one channel with payload byte; state is updated when easy_ack is received.
 * @param {number} channel - 1..15
 * @param {number} payloadByte
 * @returns {Promise<void>}
 */
export function easySend(channel, payloadByte) {
  return enqueue({ type: 'easy_send', channel, payload: payloadByte });
}

/**
 * Start the stick: register serial data listener and begin processing.
 * Call after serial port is open.
 */
export function start() {
  serial.onData(onSerialData);
}

/**
 * Stop the stick: remove serial listener and clear queue.
 */
export function stop() {
  serial.removeDataListeners();
  clearResponseTimer();
  readBuffer = Buffer.alloc(0);
  processing = false;
  for (const item of queue) {
    item.reject(new Error('Stick stopped'));
  }
  queue.length = 0;
}
