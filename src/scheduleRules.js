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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.join(__dirname, '..', 'schedule-rules.json');

const TRIGGERS = ['after_sunset', 'before_sunrise', 'at_time'];
const ACTIONS = ['top', 'bottom'];
const TIME_RE = /^\d{1,2}:\d{2}$/;

/** @type {Array<{ id: string, channel: number, action: string, trigger: string, offsetMinutes?: number, time?: string, minTime?: string, maxTime?: string, lastFiredDate?: string }>} */
let rules = [];

function load() {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      rules = parsed.filter((r) => r && typeof r === 'object' && r.id && r.channel >= 1 && r.channel <= 15 && ACTIONS.includes(r.action) && TRIGGERS.includes(r.trigger) && (r.trigger === 'at_time' ? r.time && TIME_RE.test(String(r.time).trim()) : typeof r.offsetMinutes === 'number'));
    }
  } catch {
    rules = [];
  }
}

function save() {
  fs.writeFileSync(FILE_PATH, JSON.stringify(rules, null, 2), 'utf8');
}

load();

/**
 * @param {unknown} r
 * @returns {boolean}
 */
function isValidRule(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const ch = Number(r.channel);
  if (!Number.isInteger(ch) || ch < 1 || ch > 15) return false;
  if (!ACTIONS.includes(r.action)) return false;
  if (!TRIGGERS.includes(r.trigger)) return false;
  if (r.trigger === 'at_time') {
    if (r.time == null || typeof r.time !== 'string' || !TIME_RE.test(r.time.trim())) return false;
  } else {
    const offset = Number(r.offsetMinutes);
    if (!Number.isInteger(offset)) return false;
  }
  if (r.minTime != null && typeof r.minTime !== 'string') return false;
  if (r.maxTime != null && typeof r.maxTime !== 'string') return false;
  return true;
}

/**
 * @returns {Array<{ id: string, channel: number, action: string, trigger: string, offsetMinutes: number, minTime?: string, maxTime?: string, lastFiredDate?: string }>}
 */
export function getAll() {
  return rules.map((r) => ({ ...r }));
}

/**
 * @param {Array<unknown>} newRules
 * @returns {Array<{ id: string, channel: number, action: string, trigger: string, offsetMinutes: number, minTime?: string, maxTime?: string, lastFiredDate?: string }>}
 */
export function setAll(newRules) {
  if (!Array.isArray(newRules)) return getAll();
  const existingById = new Map(rules.map((r) => [r.id, r]));
  rules = [];
  for (const r of newRules) {
    if (!isValidRule(r)) continue;
    const id = r.id && existingById.has(r.id) ? r.id : randomUUID();
    const existing = existingById.get(id);
    const entry = {
      id,
      channel: Number(r.channel),
      action: r.action,
      trigger: r.trigger,
      minTime: r.minTime ? String(r.minTime).trim() || undefined : undefined,
      maxTime: r.maxTime ? String(r.maxTime).trim() || undefined : undefined,
      lastFiredDate: (r.lastFiredDate ? String(r.lastFiredDate) : undefined) ?? existing?.lastFiredDate,
    };
    if (r.trigger === 'at_time') {
      entry.time = String(r.time).trim();
    } else {
      entry.offsetMinutes = Number(r.offsetMinutes);
    }
    rules.push(entry);
  }
  save();
  return getAll();
}

/**
 * @param {string} ruleId
 * @param {string} dateStr
 */
export function markFired(ruleId, dateStr) {
  const r = rules.find((x) => x.id === ruleId);
  if (r) {
    r.lastFiredDate = dateStr;
    save();
  }
}
