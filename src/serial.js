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

import { SerialPort } from 'serialport';

const DEFAULT_BAUD = 38400;

/** @type {import('serialport').SerialPort | null} */
let port = null;

/**
 * Open the serial port.
 * @param {string} path - Serial device path (e.g. /dev/ttyUSB0, COM3)
 * @param {{ baudRate?: number }} [options] - Optional; baudRate defaults to 38400
 * @returns {Promise<void>}
 */
export function open(path, options = {}) {
  const baudRate = options.baudRate ?? DEFAULT_BAUD;
  return new Promise((resolve, reject) => {
    if (port) {
      reject(new Error('Serial port already open'));
      return;
    }
    port = new SerialPort(
      {
        path,
        baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
      },
      (err) => {
        if (err) {
          port = null;
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Close the serial port.
 * @returns {Promise<void>}
 */
export function close() {
  if (!port) return Promise.resolve();
  return new Promise((resolve, reject) => {
    port.close((err) => {
      port = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Write raw bytes to the serial port.
 * @param {Buffer} buffer
 * @returns {Promise<void>}
 */
export function write(buffer) {
  if (!port) return Promise.reject(new Error('Serial port not open'));
  return new Promise((resolve, reject) => {
    port.write(buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Register a callback for incoming data. Callback receives Buffer chunks.
 * @param {(data: Buffer) => void} callback
 */
export function onData(callback) {
  if (!port) throw new Error('Serial port not open');
  port.on('data', callback);
}

/**
 * Remove all data listeners (e.g. before closing).
 */
export function removeDataListeners() {
  if (port) port.removeAllListeners('data');
}

/**
 * Check if the port is open.
 * @returns {boolean}
 */
export function isOpen() {
  return port !== null && port.isOpen;
}
