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

import SunCalc from 'suncalc';
import { ACTION_TO_PAYLOAD } from './protocol.js';

/** @type {ReturnType<setInterval> | null} */
let intervalId = null;

/**
 * Parse "HH:mm" to minutes since midnight (local).
 * @param {string} hhmm
 * @returns {number | null}
 */
function parseTime(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Build a Date for today at HH:mm (server local).
 * @param {Date} today
 * @param {string} hhmm
 * @returns {Date}
 */
function todayAt(today, hhmm) {
  const minutes = parseTime(hhmm);
  if (minutes == null) return new Date(0);
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/**
 * Clamp target to [minDate, maxDate] when both exist.
 * @param {Date} target
 * @param {Date} minDate
 * @param {Date} maxDate
 * @param {boolean} hasMin
 * @param {boolean} hasMax
 * @returns {Date}
 */
function clamp(target, minDate, maxDate, hasMin, hasMax) {
  if (hasMin && target < minDate) return minDate;
  if (hasMax && target > maxDate) return maxDate;
  return target;
}

/**
 * Get today's date string (YYYY-MM-DD) in server local time.
 * @returns {string}
 */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {import('./stick.js')} stick
 * @param {import('./scheduleRules.js')} scheduleRules
 * @param {number | null} lat
 * @param {number | null} lon
 */
export function start(stick, scheduleRules, lat, lon) {
  if (intervalId) clearInterval(intervalId);
  const hasLocation = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  intervalId = setInterval(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateStr = todayStr();
    let sunrise = null;
    let sunset = null;
    if (hasLocation) {
      try {
        const times = SunCalc.getTimes(today, lat, lon);
        sunrise = times.sunrise;
        sunset = times.sunset;
      } catch {
        // skip sun-based rules this tick
      }
    }
    const rules = scheduleRules.getAll();
    for (const rule of rules) {
      if (rule.lastFiredDate === dateStr) continue;
      let target;
      if (rule.trigger === 'at_time' && rule.time) {
        target = todayAt(today, rule.time);
      } else if (rule.trigger === 'after_sunset' && sunset) {
        target = new Date(sunset.getTime() + (rule.offsetMinutes || 0) * 60 * 1000);
      } else if (rule.trigger === 'before_sunrise' && sunrise) {
        target = new Date(sunrise.getTime() + (rule.offsetMinutes || 0) * 60 * 1000);
      } else {
        continue;
      }
      const hasMin = rule.minTime != null && parseTime(rule.minTime) != null;
      const hasMax = rule.maxTime != null && parseTime(rule.maxTime) != null;
      const minDate = hasMin ? todayAt(today, rule.minTime) : new Date(0);
      const maxDate = hasMax ? todayAt(today, rule.maxTime) : new Date(today.getTime() + 24 * 60 * 60 * 1000);
      target = clamp(target, minDate, maxDate, hasMin, hasMax);
      if (now >= target) {
        const payload = ACTION_TO_PAYLOAD[rule.action];
        if (payload != null) {
          stick.easySend(rule.channel, payload).catch((err) => console.error('Schedule rule fire failed:', err));
          scheduleRules.markFired(rule.id, dateStr);
        }
      }
    }
  }, 60_000);
}

export function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
