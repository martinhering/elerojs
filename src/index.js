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

import 'dotenv/config';
import * as serial from './serial.js';
import * as state from './state.js';
import * as stick from './stick.js';
import * as scheduleRules from './scheduleRules.js';
import * as scheduler from './scheduler.js';
import { createApp } from './api.js';

const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_WS_ENABLE = true;
const DEFAULT_COMMAND_DELAY_MS = 500;

function getConfig() {
  const serialPort = process.env.SERIAL_PORT;
  if (!serialPort) {
    console.error('SERIAL_PORT is required (e.g. /dev/ttyUSB0 or COM3)');
    process.exit(1);
  }
  const httpPort = parseInt(process.env.HTTP_PORT ?? String(DEFAULT_HTTP_PORT), 10);
  const wsEnable = process.env.WS_ENABLE !== 'false' && process.env.WS_ENABLE !== '0';
  const commandDelayMs = parseInt(
    process.env.COMMAND_DELAY_MS ?? String(DEFAULT_COMMAND_DELAY_MS),
    10
  );
  let latitude = null;
  let longitude = null;
  const latStr = process.env.LATITUDE;
  const lonStr = process.env.LONGITUDE;
  if (latStr != null && lonStr != null) {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      latitude = lat;
      longitude = lon;
    }
  }
  if (latitude == null && process.env.GEO_LOCATION) {
    const parts = process.env.GEO_LOCATION.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        latitude = lat;
        longitude = lon;
      }
    }
  }
  return { serialPort, httpPort, wsEnable, commandDelayMs, latitude, longitude };
}

async function main() {
  const config = getConfig();
  stick.setCommandDelayMs(config.commandDelayMs);

  await serial.open(config.serialPort);
  stick.start();

  try {
    await stick.easyCheck();
  } catch (err) {
    console.warn('Initial easy_check failed (will retry on first GET /channels):', err.message);
  }

  const { server } = createApp({
    stick,
    state,
    wsEnable: config.wsEnable,
    latitude: config.latitude,
    longitude: config.longitude,
  });

  server.listen(config.httpPort, () => {
    console.log(`elerojs listening on http://localhost:${config.httpPort}`);
    if (config.wsEnable) console.log('WebSocket available at ws://localhost:' + config.httpPort + '/ws');
    scheduler.start(stick, scheduleRules, config.latitude, config.longitude);
  });

  function shutdown() {
    scheduler.stop();
    stick.stop();
    serial.close().then(() => process.exit(0)).catch((err) => {
      console.error(err);
      process.exit(1);
    });
    server.close();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
