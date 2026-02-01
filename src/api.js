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

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import SunCalc from 'suncalc';
import * as state from './state.js';
import * as stick from './stick.js';
import * as channelNames from './channelNames.js';
import * as scheduleRules from './scheduleRules.js';
import { ACTION_TO_PAYLOAD } from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHANNEL_MIN = 1;
const CHANNEL_MAX = 15;
const VALID_ACTIONS = ['top', 'bottom', 'stop', 'intermediate', 'tilt'];

/**
 * Create and return the Express app, HTTP server, and optional WebSocket server.
 * Caller must call server.listen(port) to start.
 * @param {{ stick: typeof stick, state: typeof state, wsEnable?: boolean, latitude?: number | null, longitude?: number | null }} options
 * @returns {{ app: import('express').Express, server: import('http').Server, wss: WebSocketServer | null }}
 */
export function createApp(options) {
  const { stick: stickRef, state: stateRef, wsEnable = true, latitude: lat = null, longitude: lon = null } = options;
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json());
  const server = http.createServer(app);

  function parseChannelId(id) {
    const n = parseInt(id, 10);
    if (Number.isNaN(n) || n < CHANNEL_MIN || n > CHANNEL_MAX) return null;
    return n;
  }

  /** GET /channels — list learned channels; if empty, run easy_check once */
  app.get('/channels', async (req, res) => {
    try {
      let channels = stateRef.getLearnedChannels();
      if (channels.length === 0) {
        channels = await stickRef.easyCheck();
      }
      res.json({ channels });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /channels/names — channel name map (server-stored, shared by all clients) */
  app.get('/channels/names', (req, res) => {
    res.json(channelNames.getAll());
  });

  /** PUT /channels/names — replace channel name map; body: { "1": "Living room", ... } */
  app.put('/channels/names', (req, res) => {
    try {
      const updated = channelNames.setAll(req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** GET /channels/:id or GET /channels/:id/status — channel status; if missing, run easy_info once */
  async function getChannelStatus(req, res) {
    const id = parseChannelId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Invalid channel id (1–15)' });
      return;
    }
    try {
      const learned = stateRef.getLearnedChannels();
      if (!learned.includes(id)) {
        res.status(404).json({ error: 'Channel not learned' });
        return;
      }
      let status = stateRef.getChannelStatus(id);
      if (!status) {
        await stickRef.easyInfo(id);
        status = stateRef.getChannelStatus(id);
      }
      if (!status) {
        res.status(502).json({ error: 'No status from stick' });
        return;
      }
      res.json({ channel: id, ...status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
  app.get('/channels/:id', getChannelStatus);
  app.get('/channels/:id/status', getChannelStatus);

  /** GET /schedule/rules — list schedule rules */
  app.get('/schedule/rules', (req, res) => {
    res.json(scheduleRules.getAll());
  });

  /** PUT /schedule/rules — replace rules; body: array of { channel, action, trigger, offsetMinutes, minTime?, maxTime? } */
  app.put('/schedule/rules', (req, res) => {
    try {
      const updated = scheduleRules.setAll(req.body || []);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /** GET /schedule/sun — today's sunrise/sunset (requires latitude/longitude) */
  app.get('/schedule/sun', (req, res) => {
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(503).json({ error: 'Set LATITUDE and LONGITUDE to enable sun times.' });
      return;
    }
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const times = SunCalc.getTimes(today, lat, lon);
      res.json({
        sunrise: times.sunrise.toISOString(),
        sunset: times.sunset.toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /channels/:id/command — body { action: "top" | "bottom" | "stop" | "intermediate" | "tilt" } */
  app.post('/channels/:id/command', async (req, res) => {
    const id = parseChannelId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Invalid channel id (1–15)' });
      return;
    }
    const action = req.body?.action;
    if (typeof action !== 'string' || !VALID_ACTIONS.includes(action)) {
      res.status(400).json({
        error: 'Missing or invalid "action"; must be one of: ' + VALID_ACTIONS.join(', '),
      });
      return;
    }
    try {
      const learned = stateRef.getLearnedChannels();
      if (!learned.includes(id)) {
        res.status(404).json({ error: 'Channel not learned' });
        return;
      }
      const payload = ACTION_TO_PAYLOAD[action];
      await stickRef.easySend(id, payload);
      const status = stateRef.getChannelStatus(id);
      res.json({ channel: id, ...status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  let wss = null;
  if (wsEnable) {
    wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const path = new URL(request.url ?? '', `http://${request.headers.host}`).pathname;
      if (path === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    const clients = new Set();
    stateRef.subscribe((channel, status) => {
      const msg = JSON.stringify({ channel, status });
      for (const client of clients) {
        if (client.readyState === 1) client.send(msg);
      }
    });

    wss.on('connection', (ws) => {
      clients.add(ws);
      const full = stateRef.getFullState();
      ws.send(JSON.stringify({ type: 'state', ...full }));
      ws.on('close', () => clients.delete(ws));
    });
  }

  return { app, server, wss };
}
