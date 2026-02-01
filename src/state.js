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

import { statusByteToDriveSemantic } from './protocol.js';

/** @type {number[]} */
let learnedChannels = [];

/** @type {Map<number, { statusByte: number, semantic: string }>} */
const channelStatus = new Map();

/** @type {Array<(channel: number, status: { statusByte: number, semantic: string }) => void>} */
const subscribers = [];

/**
 * Set the list of learned channel numbers (1–15).
 * @param {number[]} channels
 */
export function setLearnedChannels(channels) {
  learnedChannels = [...channels].sort((a, b) => a - b);
}

/**
 * Get the list of learned channel numbers.
 * @returns {number[]}
 */
export function getLearnedChannels() {
  return [...learnedChannels];
}

/**
 * Set status for one channel (from easy_ack). Uses drive semantic by default.
 * @param {number} channel - 1..15
 * @param {number} statusByte
 */
export function setChannelStatus(channel, statusByte) {
  const semantic = statusByteToDriveSemantic(statusByte);
  const status = { statusByte, semantic };
  channelStatus.set(channel, status);
  for (const cb of subscribers) {
    try {
      cb(channel, status);
    } catch (e) {
      console.error('State subscriber error:', e);
    }
  }
}

/**
 * Get last known status for one channel.
 * @param {number} channel
 * @returns {{ statusByte: number, semantic: string } | undefined}
 */
export function getChannelStatus(channel) {
  return channelStatus.get(channel);
}

/**
 * Subscribe to status changes. Callback receives (channel, status).
 * @param {(channel: number, status: { statusByte: number, semantic: string }) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    const i = subscribers.indexOf(callback);
    if (i !== -1) subscribers.splice(i, 1);
  };
}

/**
 * Get full state for WebSocket snapshot: learned channels + last status per channel.
 * @returns {{ channels: number[], status: Record<number, { statusByte: number, semantic: string }> }}
 */
export function getFullState() {
  const status = {};
  for (const ch of learnedChannels) {
    const s = channelStatus.get(ch);
    if (s) status[ch] = s;
  }
  return { channels: getLearnedChannels(), status };
}
