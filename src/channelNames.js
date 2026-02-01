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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.join(__dirname, '..', 'channel-names.json');

/** @type {Record<string, string>} */
let map = {};

function load() {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      map = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && /^[1-9]|1[0-5]$/.test(k)) map[k] = v;
      }
    }
  } catch {
    map = {};
  }
}

function save() {
  fs.writeFileSync(FILE_PATH, JSON.stringify(map, null, 2), 'utf8');
}

load();

/**
 * Get all channel names (key = channel number as string, value = name).
 * @returns {Record<string, string>}
 */
export function getAll() {
  return { ...map };
}

/**
 * Replace all channel names. Keys must be channel numbers 1-15 as strings; values are strings.
 * @param {Record<string, string>} newMap
 * @returns {Record<string, string>}
 */
export function setAll(newMap) {
  if (!newMap || typeof newMap !== 'object' || Array.isArray(newMap)) {
    return getAll();
  }
  map = {};
  for (const [k, v] of Object.entries(newMap)) {
    if (/^[1-9]|1[0-5]$/.test(String(k)) && typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) map[String(k)] = trimmed;
    }
  }
  save();
  return getAll();
}
