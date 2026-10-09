/**
 * xTool Laser dashboard card and tile features.
 *
 * Tile features (they work in any tile card for an xTool entity, and in the
 * xTool card):
 * - custom:xtool-job          Start or Resume, Pause and Cancel, following the job
 * - custom:xtool-peripherals  power, the exhaust fan, fill lights (drag to dim), red dot
 *                             and other parts; a fan's icon turns while it runs
 * - custom:xtool-safety       the safety checks; turning one off asks first
 * - custom:xtool-settings     buzzer reminders, device sleep and the IF2's buzzer
 * - custom:xtool-camera       a camera's picture, with buttons to switch cameras
 * - custom:xtool-if2-fan      the SafetyPro IF2 inline fan: Auto, Off, gears 1 to 4
 * Each finds its entities on the same device as the card's entity (the IF2
 * on the laser's accessory device).
 *
 * custom:xtool-card is Home Assistant's tile card, wrapped: the tile card
 * still draws the name, state, actions and features. The xTool card adds:
 * - a picture of the machine's state in place of the icon (an engraving
 *   trail while it works, burned-in pause bars, a burned-in check when it
 *   finishes, and so on), shown through the tile card's "show entity
 *   picture" option. The picture is built in memory; no files are written,
 * - one badge on the picture for the most urgent safety state,
 * - a progress edge along one side of the card, or around it,
 * - an optional xTool style: the machine's window behind the title and its
 *   body behind the rest, with the features on the body in the Match, Flat
 *   or Console style, and
 * - an option to show or hide the features with a tap on the card, so it
 *   can collapse to the title,
 * - the job's progress, elapsed time and last job time, and the state of
 *   parts such as the exhaust and the red dot, as attributes the tile card's
 *   "State content" can show (see JOB_ATTRIBUTES).
 *
 * Every corner, size and text color comes from the theme's variables.
 */

const VERSION = "0.1.0";
const DOMAIN = "xtool";
const CARD_TYPE = "xtool-card";
const EDITOR_TYPE = "xtool-card-editor";
const TILE_EDITOR_TYPE = "xtool-tile-card-editor";

// ---------------------------------------------------------------------------
// The laser's entities
// ---------------------------------------------------------------------------

// The entities the card and the features look for on the laser, by
// translation key (the first one found wins), and the domains they may be in
const ROLES = {
  status: [["status"], ["sensor"]],
  progress: [["task_progress"], ["sensor"]],
  task_time: [["task_time"], ["sensor"]],
  pause: [["pause_job"], ["button"]],
  resume: [["resume_job"], ["button"]],
  cancel: [["cancel_job"], ["button"]],
  exhaust: [["smoking_fan"], ["switch"]],
  cooling_fan: [["cooling_fan"], ["switch"]],
  fill_light: [["fill_light"], ["light"]],
  fill_light_front: [["fill_light_front"], ["light"]],
  fill_light_back: [["fill_light_back"], ["light"]],
  red_dot: [["ir_led", "ir_led_global"], ["switch"]],
  cover_lock: [["digital_lock"], ["switch"]],
  flame_alarm: [["flame_alarm_v2", "flame_alarm"], ["switch"]],
  enclosure_stop: [["gap_check"], ["switch"]],
  moved_stop: [["stops_when_moved", "move_stop"], ["switch"]],
  auto_mode: [["md_mode"], ["switch"]],
  alarm: [["alarm"], ["binary_sensor"]],
  cover_open: [["cover_open"], ["binary_sensor"]],
  safety_key: [["machine_lock"], ["binary_sensor"]],
  firmware: [["firmware"], ["update"]],
  power: [["power_switch"], ["switch"]],
  buzzer: [["beep_enable", "buzzer"], ["switch"]],
  device_sleep: [["device_sleep"], ["switch"]],
  exhaust_running: [["smoking_fan_running"], ["binary_sensor"]],
};
// The same, on the laser's accessory devices (the SafetyPro IF2 2.0)
const ACCESSORY_ROLES = {
  if2_fan: [["accessory_ductfanv3_mode_speed"], ["select"]],
  if2_buzzer: [["accessory_ductfanv3_buzzer", "accessory_ductfan_buzzer"], ["switch"]],
  if2_speed: [["accessory_ductfanv3_current_speed"], ["sensor"]],
};
// The cameras, in the order the camera feature offers them
const CAMERAS = [
  ["camera_main", "Main"], ["camera_deep", "Deep"], ["camera_overview", "Overview"], ["camera_closeup", "Close-up"],
  ["camera_far", "Far"], ["camera_near", "Near"], ["camera_side", "Side"], ["camera_fire_record", "Fire record"],
];

const domainOf = (entityId) => entityId.split(".")[0];

// The xTool entities of each device, rebuilt when Home Assistant's entity list changes
const byDeviceCache = new WeakMap();
function deviceEntities(hass, device) {
  const entities = hass?.entities;
  if (!entities || !device) return [];
  let byDevice = byDeviceCache.get(entities);
  if (!byDevice) {
    byDevice = new Map();
    for (const e of Object.values(entities)) {
      if (e.platform !== DOMAIN || !e.device_id) continue;
      if (!byDevice.has(e.device_id)) byDevice.set(e.device_id, []);
      byDevice.get(e.device_id).push(e);
    }
    byDeviceCache.set(entities, byDevice);
  }
  return byDevice.get(device) ?? [];
}

function findRole(candidates, [keys, domains]) {
  for (const key of keys) {
    const found = candidates.find((e) => e.translation_key === key && domains.includes(domainOf(e.entity_id)));
    if (found) return found.entity_id;
  }
  return undefined;
}

/**
 * The entity with this role on the same device as entityId (or, for an
 * accessory's role, on one of the laser's accessory devices), or undefined.
 */
function sibling(hass, entityId, role) {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device) return undefined;
  if (ROLES[role]) return findRole(deviceEntities(hass, device), ROLES[role]);
  if (!ACCESSORY_ROLES[role] || !hass.devices) return undefined;
  for (const d of Object.values(hass.devices)) {
    if (d.via_device_id !== device) continue;
    const found = findRole(deviceEntities(hass, d.id), ACCESSORY_ROLES[role]);
    if (found) return found;
  }
  return undefined;
}

const if2Fan = (hass, entityId) => sibling(hass, entityId, "if2_fan");

/** The laser's cameras: [entity_id, label], in CAMERAS order. */
function camerasOf(hass, entityId) {
  const entities = deviceEntities(hass, hass?.entities?.[entityId]?.device_id);
  return CAMERAS.map(([key, label]) => [entities.find((e) => e.translation_key === key && domainOf(e.entity_id) === "camera")?.entity_id, label])
    .filter(([id]) => id);
}

const isXtool = (hass, entityId) => hass?.entities?.[entityId]?.platform === DOMAIN;

/** The laser's status sensor: the entity itself, or the one on its device. */
function statusOf(hass, entityId) {
  return hass?.entities?.[entityId]?.translation_key === "status" ? entityId : sibling(hass, entityId, "status");
}

// The status sensor's states, grouped into what the card shows
const PHASES = {
  processing: ["processing", "working_api", "working_button"],
  paused: ["paused"],
  framing: ["framing", "measuring", "measure_area"],
  finished: ["finished"],
  sleeping: ["sleeping"],
  fire: ["error_fire_warning"],
  error: ["error_limit", "error_laser_control", "error_laser_module", "error_tilt", "error_moving"],
  firmware: ["firmware_update"],
  off: ["off", "unavailable", "unknown"],
};
function phaseOf(state) {
  if (state === undefined) return "off";
  for (const [phase, states] of Object.entries(PHASES)) if (states.includes(state)) return phase;
  return "idle";
}

/**
 * What kind of machine the device is, from its model name: the laser (UV,
 * CO2 or diode, for the working color), whether it is a galvo (the
 * F-series: random strokes) or moves a gantry (a raster), and the xTool
 * style its body and window match.
 */
function machineOf(hass, entityId) {
  const model = `${hass?.devices?.[hass?.entities?.[entityId]?.device_id]?.model ?? ""}`;
  const fSeries = /\bF[12]\b/i.test(model);
  const pSeries = /\bP[123]S?\b/i.test(model);
  return {
    laser: /\bUV\b/i.test(model) ? "uv" : pSeries || /\bCO2\b/i.test(model) ? "co2" : "diode",
    galvo: fSeries,
    style: fSeries ? "champagne" : pSeries ? "graphite" : "none",
  };
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

// Home Assistant's named colors (the tile card's color picker)
const HA_COLORS = [
  "primary", "accent", "red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan",
  "teal", "green", "light-green", "lime", "yellow", "amber", "orange", "deep-orange", "brown",
  "light-grey", "grey", "dark-grey", "blue-grey", "black", "white", "disabled",
];
const cssColor = (color) => (HA_COLORS.includes(color) ? `var(--${color}-color)` : color);

// The working color by laser, and the color of every other state
const LASER_COLORS = { uv: "#9b7bff", co2: "#ff7043", diode: "#42a5f5" };
const PHASE_COLORS = {
  idle: "#9aa0a6", framing: "#29a3e0", paused: "#f5a623", finished: "#3fbf6a", sleeping: "#90a4ae",
  error: "#ef5350", fire: "#ff3d00", off: "#8a8a8a", firmware: "#4fc3f7",
};
const phaseColor = (phase, laser) => (phase === "processing" ? LASER_COLORS[laser] : PHASE_COLORS[phase]);

/**
 * Text that reads on a filled button: dark on a light color, white on a dark
 * one. The color is the one the button actually shows (a theme variable,
 * resolved by the browser). Null while the element is not on the page.
 */
let colorProbe;
function textOn(el, cssValue) {
  const resolved = cssValue.startsWith("var(")
    ? getComputedStyle(el).getPropertyValue(cssValue.slice(4, -1).split(",")[0].trim()).trim()
    : cssValue;
  if (!resolved) return null;
  colorProbe ??= document.createElement("canvas").getContext("2d");
  colorProbe.fillStyle = "#000";
  colorProbe.fillStyle = resolved;
  const value = colorProbe.fillStyle;
  const rgb = value.startsWith("#")
    ? value.slice(1).match(/../g).map((h) => parseInt(h, 16))
    : (value.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
  const luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luma > 0.6 ? "rgba(0, 0, 0, .85)" : "#fff";
}

// ---------------------------------------------------------------------------
// The state picture, in place of the tile card's icon
// ---------------------------------------------------------------------------

// Animations inside the picture. They stop for anyone who has reduced motion
// turned on (the card also draws a still picture for them).
const PICTURE_CSS = `
.h{stroke-dasharray:2.5 300;animation:r3 3.2s linear infinite}
.m{stroke-dasharray:10 300;animation:r10 3.2s linear infinite}
.t{stroke-dasharray:26 300;animation:r26 3.2s linear infinite}
.s{animation-duration:7s}
@keyframes r3{from{stroke-dashoffset:2.5}to{stroke-dashoffset:-97.5}}
@keyframes r10{from{stroke-dashoffset:10}to{stroke-dashoffset:-90}}
@keyframes r26{from{stroke-dashoffset:26}to{stroke-dashoffset:-74}}
.f{stroke-dasharray:6 300;animation:fr 2.4s linear infinite}
@keyframes fr{from{stroke-dashoffset:6}to{stroke-dashoffset:-94}}
.u{stroke-dasharray:100 100;animation:bu 4s ease-out infinite}
@keyframes bu{0%{stroke-dashoffset:100}30%{stroke-dashoffset:0}100%{stroke-dashoffset:0}}
.e{animation:em 4s linear infinite}
@keyframes em{0%,28%{opacity:0}31%{opacity:1}45%{opacity:.6}60%,100%{opacity:0}}
.z{transform-box:fill-box;transform-origin:center;animation:zz 3.6s ease-in infinite;opacity:0}
.z2{animation-delay:1.2s}.z3{animation-delay:2.4s}
@keyframes zz{0%{opacity:0;transform:translate(0,3px) scale(.7)}20%{opacity:1}80%{opacity:.8}100%{opacity:0;transform:translate(2px,-5px) scale(1.1)}}
.b{transform-box:fill-box;transform-origin:center;animation:br 3.2s ease-in-out infinite}
@keyframes br{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:.9;transform:scale(1.12)}}
.k{transform-box:fill-box;transform-origin:50% 100%;animation:fl 1.1s ease-in-out infinite}
@keyframes fl{0%,100%{transform:scaleY(1) skewX(0)}30%{transform:scaleY(1.06) skewX(-3deg)}60%{transform:scaleY(.95) skewX(2deg)}}
.w{animation:fw 2s ease-in-out infinite}
@keyframes fw{0%{transform:translateY(-2px);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateY(2px);opacity:0}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.z{opacity:1}.u{stroke-dashoffset:0}}`;

// A small seeded random generator: the same job draws the same path
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A galvo's engraving path: short strokes that turn at random, inside the
 * circle, never crossing or touching an earlier stroke.
 */
function galvoPath(seed) {
  const rand = seeded(seed);
  const side = (a, b, c) => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
  const crosses = (p1, p2, p3, p4) =>
    (side(p3, p4, p1) > 0) !== (side(p3, p4, p2) > 0) && (side(p1, p2, p3) > 0) !== (side(p1, p2, p4) > 0);
  const distance = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
  };
  const points = [[6 + rand() * 4, 7 + rand() * 3]];
  let angle = rand() * Math.PI * 2;
  for (let i = 0; i < 22; i++) {
    const last = points[points.length - 1];
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const turn = angle + (rand() - 0.5) * 2.8;
      const length = 2.4 + rand() * 3.4;
      const next = [last[0] + Math.cos(turn) * length, last[1] + Math.sin(turn) * length];
      if (Math.hypot(next[0] - 12, next[1] - 12) > 9.2) continue;
      const mid = [(last[0] + next[0]) / 2, (last[1] + next[1]) / 2];
      let clear = true;
      for (let j = 0; j < points.length - 2 && clear; j++) {
        const a = points[j], b = points[j + 1];
        if (crosses(last, next, a, b) || distance(next, a, b) < 1.6 || distance(mid, a, b) < 1.6) clear = false;
      }
      if (clear) {
        points.push(next);
        angle = turn;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")}`;
}

// A raster: all the way across, down a step, back the other way
const RASTER = (() => {
  let d = "M3.5 4";
  for (let row = 0, y = 4; y <= 20; row++, y += 1.6) {
    d += ` H${row % 2 ? 3.5 : 20.5}`;
    if (y + 1.6 <= 20) d += ` V${(y + 1.6).toFixed(1)}`;
  }
  return d;
})();

const FLAME = "M12 22.5c-4.6 0-7.6-3-7.6-7.1 0-3.7 2.6-5.9 4.1-8.4.8 1.8 1.8 2.8 3 3.3-.2-3.4 1-6.4 3.6-8.8.4 3.6 2 5.6 3.3 7.5.9 1.4 1.3 2.9 1.3 4.3 0 5.1-3.2 9.2-7.7 9.2z";

/**
 * The picture for a state, as an image address. It is drawn on a 24-unit
 * grid, scaled to fill most of the tile card's round icon.
 */
function statePicture(phase, color, { galvo = false, seed = 1, backing = false, motion = true } = {}) {
  const c = (name) => (motion ? ` class="${name}"` : "");
  const burn = (d, ember) =>
    `<path d="${d}" pathLength="100" stroke="#3b2a16" stroke-width="4.2" opacity=".45"${c("u")}/>` +
    `<path d="${d}" pathLength="100" stroke-width="2.3"${c("u")}/>` +
    (motion ? `<circle cx="${ember[0]}" cy="${ember[1]}" r="1.6" fill="#ffb74d" stroke="none" class="e"/>` : "");
  let body;
  switch (phase) {
    case "processing": {
      const d = galvo ? galvoPath(seed) : RASTER;
      const slow = galvo ? "" : " s";
      body = motion
        ? `<path d="${d}" pathLength="100" stroke-width="1.1" opacity=".2" class="t${slow}"/>` +
          `<path d="${d}" pathLength="100" stroke-width="1.4" opacity=".5" class="m${slow}"/>` +
          `<path d="${d}" pathLength="100" stroke-width="2.4" class="h${slow}"/>`
        : `<path d="${d}" stroke-width="1.3" opacity=".6"/>`;
      break;
    }
    case "paused":
      body = burn("M8.5 4.5v15M15.5 4.5v15", [15.5, 19.5]);
      break;
    case "finished":
      body = burn("M3.8 12.8 9.3 18.2 20.2 6.4", [20.2, 6.4]);
      break;
    case "framing":
      body = `<rect x="3" y="3" width="18" height="18" rx=".5" stroke-width="1" stroke-dasharray="1.6 1.9" opacity=".45"/>` +
        (motion ? `<path d="M3 3h18v18H3z" pathLength="100" stroke-width="2.2" class="f"/>` : "");
      break;
    case "sleeping":
      body = `<path d="M2.5 15.5h6l-6 6h6" stroke-width="1.8"${c("z")}/>` +
        `<path d="M9.5 8.5h5l-5 5h5" stroke-width="1.7"${c("z z2")}/>` +
        `<path d="M16.5 2.5h4.5l-4.5 4.5h4.5" stroke-width="1.6"${c("z z3")}/>`;
      break;
    case "error":
      body = `<path d="M12 2.5 22.5 21H1.5z" stroke-width="1.7"/><path d="M12 9v5.6M12 17.6h.01" stroke-width="2.1"/>`;
      break;
    case "fire":
      body = `<path d="${FLAME}" stroke-width="1.6"${c("k")}/>`;
      break;
    case "off":
      body = `<path d="M12 2.5v9" stroke-width="1.9"/><path d="M6 5.8a9 9 0 1 0 12 0" stroke-width="1.9"/>`;
      break;
    case "firmware":
      body = `<path d="M3.5 21h17" stroke-width="1.9"/><g${c("w")}><path d="M12 3v13M6.5 10.5 12 16l5.5-5.5" stroke-width="1.9"/></g>`;
      break;
    default:
      body = `<circle cx="12" cy="12" r="8.5" stroke-width="1.1"${c("b")}/><circle cx="12" cy="12" r="2.6" fill="${color}" stroke="none"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">` +
    (motion ? `<style>${PICTURE_CSS}</style>` : "") +
    (backing ? `<circle cx="18" cy="18" r="18" fill="#000" fill-opacity=".38"/>` : "") +
    `<circle cx="18" cy="18" r="18" fill="${color}" fill-opacity=".22"/>` +
    `<g transform="translate(3 3) scale(1.25)" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Seconds as 1:02:03 or 12:08. */
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

// The parts the card reports as attributes for the tile card's State
// content: [attribute, role, text when on, text when off]
const PART_ATTRIBUTES = [
  ["exhaust", "exhaust_running", "Exhaust running", "Exhaust off"],
  ["red_dot", "red_dot", "Red dot on", "Red dot off"],
  ["power", "power", "Power on", "Power off"],
  ["buzzer_reminders", "buzzer", "Buzzer on", "Buzzer off"],
  ["device_sleep", "device_sleep", "Sleep on", "Sleep off"],
  ["auto_mode", "auto_mode", "Auto mode on", "Auto mode off"],
  ["safety_key", "safety_key", "Safety key in", "Safety key out"],
  ["if2_buzzer", "if2_buzzer", "IF2 buzzer on", "IF2 buzzer off"],
];

// The attributes the card adds for the tile card's State content, with
// examples the editor shows so they can be chosen at any time
const JOB_ATTRIBUTES = {
  progress: "42 %", elapsed: "12:08", job_time: "18:52",
  ...Object.fromEntries(PART_ATTRIBUTES.map(([name, , on]) => [name, on])),
};

// ---------------------------------------------------------------------------
// Shared feature parts
// ---------------------------------------------------------------------------

const fire = (el, type, detail) =>
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

/**
 * Keep taps on a control from reaching the cards around it, such as an
 * expander card whose header opens and closes on a tap.
 */
function keepTaps(el) {
  for (const type of ["click", "touchstart", "touchend", "mousedown", "mouseup"]) {
    el.addEventListener(type, (ev) => ev.stopPropagation());
  }
}

// Console (the xtool-console attribute): the buttons become keys that press in
const KEY_CSS = `
  :host([xtool-console]) .key {
    background-image: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(0,0,0,.18));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 2px rgba(0,0,0,.3), 0 2px 3px rgba(0,0,0,.5);
    transition: transform 120ms ease-in-out, box-shadow 120ms ease-in-out;
  }
  :host([xtool-console]) .key:active,
  :host([xtool-console]) .key[aria-pressed="true"] {
    transform: translateY(1px) scale(.96);
    background-image: linear-gradient(180deg, rgba(0,0,0,.22), rgba(0,0,0,0) 55%, rgba(255,255,255,.08));
    box-shadow: inset 0 2px 4px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.2);
  }
`;

// A row of buttons, each tinted in its color, the ones that are on filled.
// On the xTool card, Match dims the style under each button (a scrim) and
// Flat and Console give each button a solid backing.
const FEATURE_CSS = `
  :host { display: block; }
  .row { display: flex; gap: var(--feature-button-spacing, 12px); height: var(--feature-height, 42px); }
  .key {
    flex: 1 1 0; min-width: 0; height: 100%; padding: 0 6px; border: 0; cursor: pointer;
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--feature-border-radius, 12px);
    background: var(--xtool-feature-backing, var(--xtool-feature-scrim, transparent));
    color: var(--xtool-text, var(--primary-text-color)); font: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: 500;
  }
  .key::before { content: ""; position: absolute; inset: 0; background: var(--c, var(--feature-color)); opacity: .2; transition: opacity 180ms ease-in-out; }
  .key:hover::before { opacity: .35; }
  .key[aria-pressed="true"]::before { opacity: 1; }
  .key[aria-pressed="true"] { color: var(--xtool-on-color, #fff); }
  .key:focus-visible { outline: 2px solid var(--c, var(--feature-color)); outline-offset: 2px; }
  .key:disabled { cursor: default; opacity: .45; }
  .key:disabled::before { opacity: .12; }
  .key > * { position: relative; }
  /* A dimmable light: the fill shows its brightness; drag across to change it */
  .key.dimmable { touch-action: pan-y; }
  .key.dimmable[aria-pressed="true"]::before {
    background: linear-gradient(to right,
      var(--c, var(--feature-color)) calc(var(--level, 1) * 100%),
      color-mix(in srgb, var(--c, var(--feature-color)) 35%, transparent) calc(var(--level, 1) * 100%));
  }
  .key.dragging::before { transition: none; }
  ha-icon { --mdc-icon-size: 22px; }
  /* A fan's icon turns while it runs, faster at a higher speed */
  .spin { animation: xtool-spin var(--spin, 1.2s) linear infinite; }
  @keyframes xtool-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .warn {
    position: absolute; top: 5px; right: 6px; width: 8px; height: 8px; border-radius: 50%;
    background: var(--warning-color, #ffa600); box-shadow: 0 0 0 1.5px rgba(0, 0, 0, .35);
  }
  dialog {
    border: 0; padding: 24px; box-sizing: border-box; width: min(400px, calc(100vw - 32px));
    border-radius: var(--ha-dialog-border-radius, var(--ha-border-radius-3xl, 24px));
    background: var(--ha-dialog-surface-background, var(--card-background-color, #fff));
    color: var(--primary-text-color); font-family: var(--ha-font-family-body, inherit); text-shadow: none;
  }
  dialog::backdrop { background: rgba(0, 0, 0, .5); }
  dialog h2 { margin: 0 0 12px; font-size: var(--ha-font-size-xl, 20px); font-weight: 400; }
  dialog p { margin: 0 0 20px; font-size: var(--ha-font-size-m, 14px); line-height: 1.45; color: var(--secondary-text-color); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .actions button {
    height: 40px; padding: 0 16px; border: 0; border-radius: 20px; cursor: pointer;
    font: inherit; font-weight: 500; background: transparent; color: var(--primary-color);
  }
  .actions .go { background: var(--error-color, #db4437); color: #fff; }
  ${KEY_CSS}
`;

/**
 * Ask before an action that cannot be taken back, or that turns a safety
 * check off. Resolves true to go ahead. The dialog is the browser's own, so
 * it sits above the dashboard and closes with Escape.
 */
function confirmAction(host, { title, text, action }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<h2></h2><p></p><div class="actions"><button type="button" class="keep"></button><button type="button" class="go"></button></div>`;
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector("p").textContent = text;
    dialog.querySelector(".keep").textContent = "Keep it";
    dialog.querySelector(".go").textContent = action;
    const done = (ok) => {
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(ok);
    };
    dialog.querySelector(".keep").addEventListener("click", () => done(false));
    dialog.querySelector(".go").addEventListener("click", () => done(true));
    dialog.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      done(false);
    });
    host.shadowRoot.append(dialog);
    if (dialog.showModal) dialog.showModal();
    else resolve(window.confirm(`${title}\n\n${text}`));
    dialog.querySelector(".keep").focus();
  });
}

/**
 * A row of buttons for one feature. Subclasses list the buttons in
 * _buttons(): { key, label, icon, text, color, pressed, disabled, warn,
 * action, spin (seconds per turn of the icon), level and dim (a dimmable
 * light: its brightness from 0 to 1, and what to do with a new one) }.
 */
class XtoolFeature extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${FEATURE_CSS}</style><div class="row" role="group"></div>`;
    this._row = this.shadowRoot.querySelector(".row");
    keepTaps(this);
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  set context(context) {
    this._context = context;
    this._render();
  }

  get _entityId() {
    return this._context?.entity_id;
  }

  _render() {
    if (!this._hass || !this._config || !this._context) return;
    // A light being dimmed keeps its button until the finger lifts
    if (this._dragging) return;
    const buttons = this._buttons();
    const colors = buttons.map((b) => (b.color ? textOn(this, cssColor(b.color)) : ""));
    if (colors.includes(null)) {
      // Not on the page yet: the button text colors are found once it is
      if (!this._retry) {
        this._retry = true;
        requestAnimationFrame(() => {
          this._retry = false;
          this._render();
        });
      }
    }
    const key = JSON.stringify([buttons.map(({ action, ...b }) => b), colors]);
    if (key === this._key) return;
    this._key = key;
    this._row.setAttribute("aria-label", this.constructor.label);
    this._row.replaceChildren(...buttons.map((b, i) => this._button(b, colors[i])));
  }

  _button(b, onColor) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key";
    button.dataset.key = b.key;
    button.title = b.label;
    button.setAttribute("aria-label", b.label);
    if (b.pressed !== undefined) button.setAttribute("aria-pressed", String(!!b.pressed));
    button.disabled = !!b.disabled;
    if (b.color) button.style.setProperty("--c", cssColor(b.color));
    if (onColor) button.style.setProperty("--xtool-on-color", onColor);
    if (b.icon) {
      const icon = document.createElement("ha-icon");
      icon.icon = b.icon;
      icon.setAttribute("icon", b.icon);
      if (b.spin) {
        icon.classList.add("spin");
        icon.style.setProperty("--spin", `${b.spin}s`);
      }
      button.append(icon);
    }
    if (b.text) {
      const span = document.createElement("span");
      span.textContent = b.text;
      button.append(span);
    }
    if (b.warn) {
      const dot = document.createElement("i");
      dot.className = "warn";
      button.append(dot);
    }
    if (b.dim) this._dimmable(button, b);
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // A drag that dimmed the light is not also a tap
      if (button.dataset.dragged) {
        delete button.dataset.dragged;
        return;
      }
      b.action?.();
    });
    return button;
  }

  /**
   * A dimmable light's button: a tap turns it on or off; a drag across the
   * button sets the brightness where the finger lifts; the left and right
   * arrow keys change it in steps of 10%.
   */
  _dimmable(button, b) {
    button.classList.add("dimmable");
    button.style.setProperty("--level", String(b.level ?? 1));
    const show = (level) => {
      button.style.setProperty("--level", String(level));
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-label", `${b.label}: ${Math.round(level * 100)}%`);
    };
    const levelAt = (x) => {
      const r = button.getBoundingClientRect();
      return Math.max(0.01, Math.min(1, Math.round(((x - r.left) / r.width) * 100) / 100));
    };
    let start, level;
    button.addEventListener("pointerdown", (ev) => {
      if (button.disabled) return;
      start = ev.clientX;
      level = undefined;
    });
    button.addEventListener("pointermove", (ev) => {
      if (start === undefined) return;
      if (level === undefined) {
        if (Math.abs(ev.clientX - start) < 8) return;
        try {
          button.setPointerCapture(ev.pointerId);
        } catch (err) {
          // Not capturable (the pointer already left): the drag still works over the button
        }
        this._dragging = true;
        button.classList.add("dragging");
      }
      level = levelAt(ev.clientX);
      show(level);
    });
    const end = () => {
      if (start === undefined) return;
      start = undefined;
      button.classList.remove("dragging");
      this._dragging = false;
      if (level === undefined) return;
      button.dataset.dragged = "1";
      setTimeout(() => delete button.dataset.dragged, 400);
      b.dim(level);
      this._key = undefined;
    };
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      b.level = Math.max(0.01, Math.min(1, Math.round(((b.level ?? 0) + (ev.key === "ArrowRight" ? 0.1 : -0.1)) * 100) / 100));
      show(b.level);
      b.dim(b.level);
    });
  }

  _usable(entityId) {
    const stateObj = entityId ? this._hass.states[entityId] : undefined;
    return !!stateObj && stateObj.state !== "unavailable";
  }
}

// ---------------------------------------------------------------------------
// Feature: the job
// ---------------------------------------------------------------------------
class XtoolJob extends XtoolFeature {
  static label = "Job";

  static getStubConfig() {
    return { type: "custom:xtool-job" };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass, id = this._entityId;
    const status = statusOf(hass, id);
    const phase = phaseOf(status ? hass.states[status]?.state : undefined);
    const pause = sibling(hass, id, "pause"), resume = sibling(hass, id, "resume"), cancel = sibling(hass, id, "cancel");
    const press = (entityId) => () => hass.callService("button", "press", { entity_id: entityId });
    const running = phase === "processing" || phase === "framing";
    const buttons = [];
    if (running) {
      buttons.push({ key: "pause", label: "Pause the job", icon: "mdi:pause", text: "Pause", color: "amber",
        disabled: !this._usable(pause) || phase !== "processing", action: press(pause) });
    } else {
      const paused = phase === "paused";
      buttons.push({ key: "resume", label: paused ? "Resume the job" : "Start the job", icon: "mdi:play",
        text: paused ? "Resume" : "Start", color: "green",
        disabled: !this._usable(resume) || ["off", "sleeping", "firmware"].includes(phase), action: press(resume) });
    }
    buttons.push({ key: "cancel", label: "Cancel the job", icon: "mdi:stop", text: "Cancel", color: "red",
      disabled: !this._usable(cancel) || !(running || phase === "paused"), action: () => this._cancel(cancel) });
    return buttons;
  }

  async _cancel(entityId) {
    if (this._config.confirm_cancel !== false) {
      const ok = await confirmAction(this, {
        title: "Cancel the job?",
        text: "The job stops and cannot be resumed.",
        action: "Cancel the job",
      });
      if (!ok) return;
    }
    this._hass.callService("button", "press", { entity_id: entityId });
  }
}

// ---------------------------------------------------------------------------
// Feature: peripherals
// ---------------------------------------------------------------------------
const PERIPHERALS = [
  {
    role: "power", label: "Power", icon: "mdi:power", color: "green",
    // Asked only while a job runs: cutting the power stops it at once
    warning: "A job is running. Turning the power off stops it at once and it cannot be resumed.",
  },
  { role: "exhaust", label: "Exhaust fan", icon: "mdi:fan", color: "blue", fan: true },
  { role: "fill_light_front", label: "Fill light (front)", icon: "mdi:dome-light", color: "amber" },
  { role: "fill_light_back", label: "Fill light (back)", icon: "mdi:dome-light", color: "amber" },
  { role: "fill_light", label: "Fill light", icon: "mdi:dome-light", color: "amber" },
  { role: "red_dot", label: "Red dot", icon: "mdi:laser-pointer", color: "red" },
  { role: "cooling_fan", label: "Cooling fan", icon: "mdi:fan-chevron-up", color: "cyan", fan: true },
  { role: "cover_lock", label: "Cover lock", icon: "mdi:lock", color: "indigo" },
];

/** The controls of a list the device has, in the order chosen (all by default). */
function chosen(hass, entityId, list, roles) {
  const present = list.filter((item) => sibling(hass, entityId, item.role));
  if (!Array.isArray(roles)) return present;
  return roles.map((role) => present.find((item) => item.role === role)).filter(Boolean);
}

// The machine's and the IF2's own settings
const SETTINGS = [
  { role: "buzzer", label: "Buzzer reminders", icon: "mdi:volume-high", color: "teal" },
  { role: "device_sleep", label: "Device sleep", icon: "mdi:power-sleep", color: "indigo" },
  { role: "if2_buzzer", label: "IF2 buzzer", icon: "mdi:bell-ring", color: "teal" },
];

/** A row of on/off buttons for the parts in the class's list. */
class XtoolToggles extends XtoolFeature {
  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass, id = this._entityId;
    return chosen(hass, id, this.constructor.list, this._config.controls).map((item) => {
      const entityId = sibling(hass, id, item.role);
      const stateObj = hass.states[entityId];
      const on = stateObj?.state === "on";
      // A light that has a brightness can be dimmed (on by default)
      const dimmable = domainOf(entityId) === "light" && this._config.dim_lights !== false &&
        (stateObj?.attributes.supported_color_modes ?? []).some((mode) => mode !== "onoff");
      const level = on ? (stateObj.attributes.brightness ?? 255) / 255 : 0;
      return {
        key: item.role, label: dimmable && on ? `${item.label}: ${Math.round(level * 100)}%` : item.label,
        icon: item.icon, text: this._config.show_names ? item.label : "",
        color: item.color, pressed: on, disabled: !this._usable(entityId),
        // A fan that is on turns (on by default); these fans have no speed
        spin: item.fan && on && this._config.animate_fan !== false ? 1.2 : undefined,
        level: dimmable ? Math.round(level * 100) / 100 : undefined,
        dim: dimmable
          ? (value) => hass.callService("light", "turn_on", { entity_id: entityId, brightness_pct: Math.max(1, Math.round(value * 100)) })
          : undefined,
        action: () => this._toggle(item, entityId, on),
      };
    });
  }

  async _toggle(item, entityId, on) {
    if (on && item.warning) {
      const status = statusOf(this._hass, this._entityId);
      const phase = phaseOf(status ? this._hass.states[status]?.state : undefined);
      if (phase === "processing" || phase === "paused") {
        const ok = await confirmAction(this, { title: `Turn off ${item.label.toLowerCase()}?`, text: item.warning, action: "Turn off" });
        if (!ok) return;
      }
    }
    this._hass.callService(domainOf(entityId), on ? "turn_off" : "turn_on", { entity_id: entityId });
  }
}

class XtoolPeripherals extends XtoolToggles {
  static label = "Peripherals";
  static list = PERIPHERALS;

  static getStubConfig() {
    return { type: "custom:xtool-peripherals" };
  }
}

class XtoolSettings extends XtoolToggles {
  static label = "Settings";
  static list = SETTINGS;

  static getStubConfig() {
    return { type: "custom:xtool-settings" };
  }
}

// ---------------------------------------------------------------------------
// Feature: a camera, with a switch between the laser's cameras
// ---------------------------------------------------------------------------
class XtoolCamera extends XtoolFeature {
  static label = "Camera";

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = `
      .shot {
        position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; padding: 0; border: 0; cursor: pointer;
        border-radius: var(--feature-border-radius, 12px); overflow: hidden; background: #111;
        margin-bottom: var(--feature-button-spacing, 12px);
      }
      .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .shot .empty { position: absolute; inset: 0; display: grid; place-items: center; color: #aaa; font-size: var(--ha-font-size-s, 12px); }
      .row:empty { display: none; }`;
    this._shot = document.createElement("button");
    this._shot.type = "button";
    this._shot.className = "shot";
    this._shot.innerHTML = `<img alt=""><span class="empty"></span>`;
    this._img = this._shot.querySelector("img");
    this._empty = this._shot.querySelector(".empty");
    this._shot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (this._camera) fire(this, "hass-more-info", { entityId: this._camera });
    });
    this.shadowRoot.prepend(style);
    this._row.before(this._shot);
  }

  static getStubConfig() {
    return { type: "custom:xtool-camera" };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  connectedCallback() {
    this._restart();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  get _cameras() {
    return camerasOf(this._hass, this._entityId);
  }

  _buttons() {
    const cameras = this._cameras;
    const current = this._currentCamera(cameras);
    if (current !== this._camera) {
      this._camera = current;
      this._refresh();
    }
    if (this._config.show_switch === false || cameras.length < 2) return [];
    return cameras.map(([entityId, label]) => ({
      key: entityId, label: `${label} camera`, text: label, color: "primary", pressed: entityId === current,
      disabled: !this._usable(entityId),
      action: () => {
        this._picked = entityId;
        this._key = undefined;
        this._render();
      },
    }));
  }

  _currentCamera(cameras) {
    const ids = cameras.map(([id]) => id);
    if (this._picked && ids.includes(this._picked)) return this._picked;
    const configured = cameras.find(([, label]) => label === this._config.camera)?.[0];
    return configured ?? ids[0];
  }

  // A new snapshot every few seconds while the card is on screen
  _restart() {
    clearInterval(this._timer);
    const seconds = Math.max(1, Number(this._config?.refresh) || 2);
    this._timer = setInterval(() => this._refresh(), seconds * 1000);
    this._refresh();
  }

  setConfig(config) {
    super.setConfig(config);
    if (this.isConnected) this._restart();
  }

  _refresh() {
    if (!this._hass) return;
    const stateObj = this._camera ? this._hass.states[this._camera] : undefined;
    const picture = stateObj?.attributes.entity_picture;
    const live = picture && stateObj.state !== "unavailable";
    this._empty.textContent = live ? "" : "No camera picture";
    this._img.hidden = !live;
    if (!live || document.hidden) return;
    this._img.src = `${picture}${picture.includes("?") ? "&" : "?"}t=${Date.now()}`;
    this._shot.setAttribute("aria-label", `${this._cameras.find(([id]) => id === this._camera)?.[1] ?? ""} camera: open`);
  }
}

// ---------------------------------------------------------------------------
// Feature: safety checks
// ---------------------------------------------------------------------------
const SAFETY = [
  {
    role: "flame_alarm", label: "Flame alarm", icon: "mdi:fire-alert",
    warning: "No flame alarm will be triggered while it is off. Fires may cause serious injuries and property damage.",
  },
  {
    role: "enclosure_stop", label: "Stops when enclosure opened", icon: "mdi:window-shutter-alert",
    warning: "The laser keeps working when the enclosure is opened. Laser light can injure eyes and skin.",
  },
  {
    role: "moved_stop", label: "Stops when moved", icon: "mdi:vibrate",
    warning: "The laser keeps working if the machine is moved or tilted during a job.",
  },
  {
    role: "auto_mode", label: "Auto mode (access control)", icon: "mdi:key-variant",
    warning: "The machine no longer requires the safety key to start a job.",
    optional: true,
  },
];

class XtoolSafety extends XtoolFeature {
  static label = "Safety checks";

  static getStubConfig() {
    return { type: "custom:xtool-safety" };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass, id = this._entityId;
    return chosen(hass, id, SAFETY, this._config.controls).map((item) => {
      const entityId = sibling(hass, id, item.role);
      const state = hass.states[entityId]?.state;
      const on = state === "on";
      return {
        key: item.role, label: `${item.label}: ${on ? "on" : "off"}`, icon: item.icon,
        text: this._config.show_names ? item.label : "", color: "green", pressed: on,
        warn: state === "off" && !item.optional, disabled: !this._usable(entityId),
        action: () => this._toggle(item, entityId, on),
      };
    });
  }

  async _toggle(item, entityId, on) {
    if (on) {
      const ok = await confirmAction(this, { title: `Turn off ${item.label.toLowerCase()}?`, text: item.warning, action: "Turn off" });
      if (!ok) return;
    }
    this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: entityId });
  }
}

// ---------------------------------------------------------------------------
// Feature: the SafetyPro IF2 inline fan
// ---------------------------------------------------------------------------
const AUTO_OPTIONS = ["Auto Regular", "Auto Quiet"];

class XtoolIf2Fan extends XtoolFeature {
  static label = "SafetyPro IF2 fan";

  static getStubConfig() {
    return { type: "custom:xtool-if2-fan" };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass;
    const entityId = if2Fan(hass, this._entityId);
    const stateObj = entityId ? hass.states[entityId] : undefined;
    const options = stateObj?.attributes.options ?? [];
    const state = stateObj?.state;
    const disabled = !this._usable(entityId);
    const select = (option) => () => hass.callService("select", "select_option", { entity_id: entityId, option });
    // The button that is on shows the fan, turning at its speed (on by default)
    const animate = this._config.animate_fan !== false;
    const fan = (pressed, option) => {
      if (!pressed) return {};
      if (option === "Off") return { icon: "mdi:fan-off" };
      return { icon: "mdi:fan", spin: animate ? this._turn(option) : undefined };
    };
    const buttons = [];
    // The IF2 reports Auto Regular and Auto Quiet the same way: one Auto button
    if (options.some((o) => AUTO_OPTIONS.includes(o))) {
      const auto = AUTO_OPTIONS.includes(this._config.auto) ? this._config.auto : "Auto Regular";
      const pressed = AUTO_OPTIONS.includes(state);
      buttons.push({ key: "auto", label: auto, text: "Auto", color: "blue", pressed, disabled, action: select(auto), ...fan(pressed, "auto") });
    }
    for (const option of options.filter((o) => !AUTO_OPTIONS.includes(o))) {
      const pressed = state === option;
      buttons.push({ key: option, label: option === "Off" ? "Fan off" : `Gear ${option}`, text: option, color: "blue",
        pressed, disabled, action: select(option), ...fan(pressed, option) });
    }
    return buttons;
  }

  /**
   * Seconds per turn of the fan icon: from 2.4 at gear 1 to 0.6 at gear 4.
   * In Auto, from the IF2's current speed (a gear, or a 0 to 100 duty cycle).
   */
  _turn(option) {
    let gear = Number(option);
    if (!Number.isFinite(gear)) {
      const speedId = sibling(this._hass, this._entityId, "if2_speed");
      const speed = speedId ? Number(this._hass.states[speedId]?.state) : NaN;
      gear = !Number.isFinite(speed) ? 2 : speed > 4 ? speed / 25 : speed;
    }
    gear = Math.max(1, Math.min(4, gear));
    return Math.round((2.4 - (gear - 1) * 0.6) * 10) / 10;
  }
}

const FEATURES = {
  "xtool-job": XtoolJob,
  "xtool-peripherals": XtoolPeripherals,
  "xtool-safety": XtoolSafety,
  "xtool-settings": XtoolSettings,
  "xtool-camera": XtoolCamera,
  "xtool-if2-fan": XtoolIf2Fan,
};
const FEATURE_TAGS = Object.keys(FEATURES);

// ---------------------------------------------------------------------------
// Feature editors (one element; the form follows the feature's type)
// ---------------------------------------------------------------------------
const controlOptions = (hass, entityId, list) =>
  list.filter((item) => sibling(hass, entityId, item.role)).map((item) => ({ value: item.role, label: item.label }));

const FEATURE_FORMS = {
  "custom:xtool-job": () => ({
    schema: [{ name: "confirm_cancel", label: "Ask before cancelling a job", selector: { boolean: {} } }],
    data: (c) => ({ confirm_cancel: c.confirm_cancel !== false }),
  }),
  "custom:xtool-peripherals": (hass, entityId) => ({
    schema: [
      { name: "controls", label: "Controls", selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, PERIPHERALS) } } },
      { name: "show_names", label: "Show names", selector: { boolean: {} } },
      {
        name: "dim_lights", label: "Dim lights",
        helper: "Drag across a dimmable light's button to set its brightness; a tap still turns it on or off.",
        selector: { boolean: {} },
      },
      { name: "animate_fan", label: "Animate fan", helper: "A fan's icon turns while it runs.", selector: { boolean: {} } },
    ],
    data: (c) => ({
      controls: c.controls ?? controlOptions(hass, entityId, PERIPHERALS).map((o) => o.value), show_names: !!c.show_names,
      dim_lights: c.dim_lights !== false, animate_fan: c.animate_fan !== false,
    }),
  }),
  "custom:xtool-safety": (hass, entityId) => ({
    schema: [
      {
        name: "controls", label: "Safety checks",
        helper: "Turning a check off always asks first. A check that is off shows an amber dot.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, SAFETY) } },
      },
      { name: "show_names", label: "Show names", selector: { boolean: {} } },
    ],
    data: (c) => ({ controls: c.controls ?? controlOptions(hass, entityId, SAFETY).map((o) => o.value), show_names: !!c.show_names }),
  }),
  "custom:xtool-settings": (hass, entityId) => ({
    schema: [
      { name: "controls", label: "Settings", selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, SETTINGS) } } },
      { name: "show_names", label: "Show names", selector: { boolean: {} } },
    ],
    data: (c) => ({ controls: c.controls ?? controlOptions(hass, entityId, SETTINGS).map((o) => o.value), show_names: !!c.show_names }),
  }),
  "custom:xtool-camera": (hass, entityId) => {
    const labels = camerasOf(hass, entityId).map(([, label]) => label);
    return {
      schema: [
        { name: "camera", label: "Camera", selector: { select: { mode: "dropdown", options: labels } } },
        {
          name: "refresh", label: "New picture every (seconds)",
          helper: "The laser sends about one picture a second at most.",
          selector: { number: { mode: "box", min: 1, max: 60, step: 1 } },
        },
        { name: "show_switch", label: "Buttons to switch cameras", selector: { boolean: {} } },
      ],
      data: (c) => ({ camera: labels.includes(c.camera) ? c.camera : labels[0], refresh: Number(c.refresh) || 2, show_switch: c.show_switch !== false }),
    };
  },
  "custom:xtool-if2-fan": () => ({
    schema: [{
      name: "auto", label: "The Auto button sets",
      helper: "The IF2 reports both auto modes the same way, so one Auto button sets the one you choose.",
      selector: { select: { mode: "dropdown", options: AUTO_OPTIONS } },
    }, {
      name: "animate_fan", label: "Animate fan",
      helper: "The fan icon turns faster at a higher gear; in Auto, at the IF2's current speed.",
      selector: { boolean: {} },
    }],
    data: (c) => ({ auto: AUTO_OPTIONS.includes(c.auto) ? c.auto : "Auto Regular", animate_fan: c.animate_fan !== false }),
  }),
};

class XtoolFeatureEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  set context(context) {
    this._context = context;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const form = FEATURE_FORMS[this._config.type]?.(this._hass, this._context?.entity_id);
    if (!form) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => s.label ?? s.name;
      this._form.computeHelper = (s) => s.helper;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { type: this._config.type, ...ev.detail.value };
        this._config = config;
        fire(this, "config-changed", { config });
      });
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = form.schema;
    this._form.data = form.data(this._config);
  }
}

// ---------------------------------------------------------------------------
// Console styling for Home Assistant's own toggle feature: a slide with a
// beveled tab. This styles parts inside Home Assistant's controls; if an
// update renames them, they keep their usual look.
// ---------------------------------------------------------------------------
const HA_CONTROL_SHEET = `
  :host([xtool-slide]) .switch .background,
  :host([xtool-slide]) .switch:hover .background,
  :host([xtool-slide]) .switch:focus-visible .background { opacity: 0 !important; }
  :host([xtool-slide]) { --control-switch-padding: 0px !important; }
  :host([xtool-slide]) .switch { padding: 0 !important; }
  :host([xtool-slide]) .switch .button {
    position: relative;
    background-color: var(--control-switch-on-color);
    background-image: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.05) 40%, rgba(0,0,0,.05) 60%, rgba(0,0,0,.3));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.6), inset 0 -1px 0 rgba(0,0,0,.35),
      inset 1px 0 0 rgba(255,255,255,.25), inset -1px 0 0 rgba(0,0,0,.25),
      0 1px 2px rgba(0,0,0,.55);
  }
  :host([xtool-slide]) .switch .button ha-svg-icon,
  :host([xtool-slide]) .switch .button slot { display: none; }
`;
let haControlSheet;
function styleHaControl(control, on) {
  const root = control.shadowRoot;
  if (!root) return;
  if (!haControlSheet) {
    haControlSheet = new CSSStyleSheet();
    haControlSheet.replaceSync(HA_CONTROL_SHEET);
  }
  if (!root.adoptedStyleSheets.includes(haControlSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, haControlSheet];
  control.toggleAttribute("xtool-slide", on);
}

/** All elements matching selector inside root and its shadow roots, a few deep. */
function findAllDeep(root, selector, depth = 5, out = []) {
  if (!root || depth < 0) return out;
  out.push(...(root.querySelectorAll?.(selector) ?? []));
  for (const el of root.querySelectorAll?.("*") ?? []) {
    if (el.shadowRoot) findAllDeep(el.shadowRoot, selector, depth - 1, out);
  }
  return out;
}

/** The first element matching selector inside root and its shadow roots. */
function findDeep(root, selector, depth = 5) {
  if (!root || depth < 0) return null;
  const found = root.querySelector?.(selector);
  if (found) return found;
  for (const el of root.querySelectorAll?.("*") ?? []) {
    const hit = el.shadowRoot && findDeep(el.shadowRoot, selector, depth - 1);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

// The xTool styles: a body and a window, light or dark (for the text on the
// body), and the body's base color without grain (for Flat)
const STYLES = [["none", "None (the theme's card)"], ["champagne", "xTool Champagne"], ["graphite", "xTool Graphite"]];
const TONE = { champagne: "light", graphite: "dark" };
const FLAT = { champagne: "#c4a191", graphite: "#2d3136" };
// The same keys and values as the SVS and Lampster cards
const FEATURES_STYLES = [["match", "Match style"], ["flat", "Flat"], ["console", "Console"]];
const BADGES = [
  ["alarm", "Alarm or fire warning"],
  ["connection", "Not connected"],
  ["safety_key", "Safety key removed"],
  ["lid", "Lid open"],
  ["safety_off", "A safety check is off"],
  ["firmware", "Firmware update available"],
];
const DEFAULT_BADGES = ["alarm", "connection", "safety_key", "lid", "safety_off"];
const EDGES = [["none", "None"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["around", "Around the card"]];
const DIRECTIONS = [["clockwise", "Clockwise"], ["counterclockwise", "Counterclockwise"]];
const SHOW_WHILE = [["processing", "Processing"], ["paused", "Paused"], ["framing", "Framing"], ["finished", "Finished"], ["error", "Error"]];
const PROGRESS_DEFAULTS = {
  edge: "top", thickness: 4, start: 0, end: 100, direction: "clockwise", color: "state",
  show_percentage: false, show_while: ["processing", "paused"],
};
// Which way a bar fills, by edge and direction (the same as the card-mod
// progress border this replaces)
const BAR_DIRECTION = {
  top: { clockwise: "to right", counterclockwise: "to left" },
  bottom: { clockwise: "to left", counterclockwise: "to right" },
  left: { clockwise: "to top", counterclockwise: "to bottom" },
  right: { clockwise: "to bottom", counterclockwise: "to top" },
};
const TRACK = "var(--disabled-color, rgba(127, 127, 127, .35))";

// Badge symbols, drawn on a 24-unit grid
const BADGE_PATHS = {
  alarm: "M12 3 22 20H2z M12 9.5v4.5 M12 17h.01",
  fire: FLAME,
  connection: "M3 3l18 18 M8.5 16.5a5 5 0 0 1 7 0 M5 12.6a10 10 0 0 1 4-2.4 M19 12.6a10 10 0 0 0-2.2-1.6 M12 20h.01",
  safety_key: "M7.5 11a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9 M10.7 12.3 20 3 M17 6l3 3 M14.5 8.5l2 2",
  lid: "M3 7l9-4 9 4 M5 9.5h14V20H5z",
  safety_off: "M3 3l18 18 M19 13V6l-7-3-4 1.7 M5.2 6.5V11c0 4.5 3 8.2 6.8 10 1.4-.7 2.7-1.6 3.7-2.7",
  firmware: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
};

// Options this card adds to the tile card's
const OWN_KEYS = ["style", "features_style", "badges", "progress", "features_toggle", "features_open"];

/** The tile card's own options (as its editor shows them). */
function tileConfig(config) {
  const tile = { ...config, type: "tile", show_entity_picture: true };
  for (const key of OWN_KEYS) delete tile[key];
  return tile;
}

/**
 * The tile card inside the card: with "Tap the card to show or hide the
 * features", a tap on the card does that instead of its Tap behavior, and
 * the features are left out while they are hidden.
 */
function innerTileConfig(config, open) {
  const tile = tileConfig(config);
  if (config.features_toggle) {
    tile.tap_action = { action: "fire-dom-event", xtool_card: "toggle" };
    if (!open) tile.features = [];
  }
  return tile;
}

const progressOptions = (config) => ({ ...PROGRESS_DEFAULTS, ...(config?.progress ?? {}) });

class XtoolCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        .frame {
          position: relative; height: 100%; box-sizing: border-box; isolation: isolate;
          /* Exactly the tile card's own corners (ha-card), from the theme */
          border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
        }
        /* Only the decorations are clipped to the rounded outline; the tile
           card is not, so its callouts can extend past the card's edge */
        .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
        .clip.over { z-index: 2; }
        /* No divider between features side by side (a theme can set one) */
        .tile { position: relative; display: block; height: 100%; --ha-card-feature-divider: none; }

        /* The xTool style: the body behind everything, the window behind the title */
        #body, #window, #stripe { position: absolute; display: none; }
        .styled #body { display: block; inset: 0; }
        .styled #window { display: block; overflow: hidden; border-radius: max(4px, calc(var(--ha-card-border-radius, 12px) - 5px)); }
        #window::after { content: ""; position: absolute; inset: 0; background: var(--xtool-gloss); }
        /* A machine that is off: its window darkens; the body does not */
        #window { transition: filter 400ms ease-in-out; }
        .off #window { filter: brightness(.55) saturate(.55); }
        .champagne #body {
          background: radial-gradient(rgba(255, 255, 255, .07) .6px, transparent .7px) 0 0 / 3px 3px,
            linear-gradient(160deg, #d7b8a8 0%, #c4a191 45%, #b08e7f 100%);
        }
        .champagne #window {
          background: linear-gradient(170deg, #ef8a3a 0%, #e0681f 45%, #b9480f 100%);
          box-shadow: inset 0 0 0 1px rgba(90, 30, 0, .35), inset 0 2px 6px rgba(90, 30, 0, .35);
          --xtool-gloss: linear-gradient(115deg, rgba(255, 255, 255, .22) 0%, rgba(255, 255, 255, .06) 32%, transparent 33%);
        }
        .graphite #body { background: linear-gradient(170deg, #3a3f45 0%, #2d3136 40%, #24272b 100%); }
        .graphite #window {
          background: radial-gradient(120% 90% at 50% 120%, rgba(214, 140, 60, .28) 0%, rgba(214, 140, 60, 0) 60%),
            linear-gradient(175deg, #1d2024 0%, #141619 60%, #0f1113 100%);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06), inset 0 2px 6px rgba(0, 0, 0, .6);
          --xtool-gloss: linear-gradient(115deg, rgba(255, 255, 255, .1) 0%, rgba(255, 255, 255, .03) 32%, transparent 33%);
        }
        .graphite #stripe {
          display: block; height: 2px; border-radius: 1px;
          background: linear-gradient(to right, rgba(200, 205, 212, .1) 0%, #c8cdd4 25%, #eef1f4 55%, rgba(200, 205, 212, .15) 100%);
        }
        .styled::after {
          content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 3;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(0, 0, 0, .4);
        }
        .styled .tile {
          --ha-card-background: transparent; --card-background-color: transparent;
          --ha-card-box-shadow: none; --ha-card-border-color: transparent; --ha-card-backdrop-filter: none;
        }
        /* The text on the body, and the controls' backing in each features style */
        .tile.dark {
          --primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .7);
          --xtool-text: rgba(255, 255, 255, .95); text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
          --xtool-feature-scrim: rgba(0, 0, 0, .45);
        }
        .tile.light {
          --primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .62);
          --xtool-text: rgba(0, 0, 0, .85); --xtool-feature-scrim: rgba(255, 255, 255, .45);
        }
        .tile.dark.solid { --xtool-feature-backing: #1e1f22; }
        .tile.light.solid { --xtool-feature-backing: #eceef1; }
        /* Flat: a patch of the body's base color behind each control; Console: a channel */
        #areas { position: absolute; inset: 0; }
        .area { position: absolute; box-sizing: border-box; }
        .area.flat { background: var(--flat); box-shadow: 0 0 3px 1px var(--flat); }
        .area.console {
          background: linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .08));
          box-shadow:
            inset 0 2px 3px rgba(0, 0, 0, .55), inset 0 1px 1px rgba(0, 0, 0, .4),
            inset 0 -1px 0 rgba(255, 255, 255, .14), 0 1px 0 rgba(255, 255, 255, .18);
        }

        /* The progress edge */
        #edge { position: absolute; display: none; overflow: hidden; }
        #edge.on { display: block; }
        #edge.around {
          inset: 0; border-radius: inherit; box-sizing: border-box;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
        }
        #edge .sweep { position: absolute; display: none; border-radius: 3px; }
        #edge.indeterminate .sweep { display: block; }
        #edge.indeterminate.horizontal .sweep { top: 0; bottom: 0; width: 30%; animation: sweep-x 2.2s ease-in-out infinite; }
        #edge.indeterminate.vertical .sweep { left: 0; right: 0; height: 30%; animation: sweep-y 2.2s ease-in-out infinite; }
        #edge.indeterminate.around { animation: pulse 2s ease-in-out infinite; }
        @keyframes sweep-x { from { left: -30%; } to { left: 100%; } }
        @keyframes sweep-y { from { top: -30%; } to { top: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          #edge.indeterminate .sweep, #edge.indeterminate.around { animation: none; }
          #edge.indeterminate.horizontal .sweep { left: 35%; }
          #edge.indeterminate.vertical .sweep { top: 35%; }
        }
        #pct {
          position: absolute; right: 16px; bottom: 12px; display: none;
          font: 700 14px/1 var(--ha-font-family-body, inherit); text-shadow: 0 1px 3px rgba(0, 0, 0, .8);
        }
        #pct.on { display: block; }

        /* The badge on the picture */
        .badge {
          position: absolute; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px; box-sizing: border-box;
          display: none; place-items: center; border-radius: 50%; pointer-events: none;
          border: 2px solid var(--xtool-badge-ring, var(--ha-card-background, var(--card-background-color, #fff)));
          color: #fff;
        }
        .badge.on { display: grid; }
        .badge svg { width: 11px; height: 11px; }
        .styled .badge { --xtool-badge-ring: rgba(0, 0, 0, .55); }
      </style>
      <div class="frame">
        <div class="clip under"><div id="body"></div><div id="window"></div><div id="stripe"></div><div id="areas"></div></div>
        <div class="clip over"><div id="edge"><div class="sweep"></div></div><span id="pct"></span></div>
        <span class="badge" role="img"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor"
          stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>`;
    this._frame = this.shadowRoot.querySelector(".frame");
    this._over = this.shadowRoot.querySelector(".clip.over");
    this._window = this.shadowRoot.getElementById("window");
    this._stripe = this.shadowRoot.getElementById("stripe");
    this._areas = this.shadowRoot.getElementById("areas");
    this._edge = this.shadowRoot.getElementById("edge");
    this._pct = this.shadowRoot.getElementById("pct");
    this._badge = this.shadowRoot.querySelector(".badge");
    this._resize = new ResizeObserver(() => this._layout());
    // A tap on the card shows or hides the features (see innerTileConfig)
    this._frame.addEventListener("ll-custom", (ev) => {
      if (ev.detail?.xtool_card !== "toggle") return;
      ev.stopPropagation();
      this._setOpen(!this._open);
    });
    this._resize.observe(this._frame);
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TYPE);
  }

  static getStubConfig(hass) {
    const status = Object.values(hass?.entities ?? {}).find((e) => e.platform === DOMAIN && e.translation_key === "status");
    const entity = status?.entity_id ?? "";
    const features = [{ type: "custom:xtool-job" }];
    if (entity && PERIPHERALS.some((item) => sibling(hass, entity, item.role))) features.push({ type: "custom:xtool-peripherals" });
    return {
      entity,
      style: entity ? machineOf(hass, entity).style : "none",
      features_style: "match",
      state_content: ["state", "elapsed"],
      features,
      features_position: "bottom",
    };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Choose an xTool entity, such as the laser's Status sensor");
    const style = config.style ?? "none";
    if (!STYLES.some(([id]) => id === style)) throw new Error(`Unknown style: ${style}`);
    if (config.features_style !== undefined && !FEATURES_STYLES.some(([id]) => id === config.features_style)) {
      throw new Error(`Unknown features_style: ${config.features_style}`);
    }
    if (config.progress !== undefined && (typeof config.progress !== "object" || Array.isArray(config.progress))) {
      throw new Error("progress must be a set of options, such as edge: top");
    }
    const edge = progressOptions(config).edge;
    if (!EDGES.some(([id]) => id === edge)) throw new Error(`Unknown progress edge: ${edge}`);
    this._config = { ...config, style };
    this._open = !config.features_toggle ? true : this._storedOpen() ?? config.features_open !== false;
    const tile = innerTileConfig(this._config, this._open);
    if (this._tile) {
      this._tile.setConfig(tile);
    } else if (customElements.get("hui-tile-card")) {
      this._createTile(tile);
    } else {
      // The tile card is loaded on demand; the card helpers load it
      window.loadCardHelpers?.().then(async (helpers) => {
        helpers.createCardElement({ type: "tile", entity: tile.entity });
        await customElements.whenDefined("hui-tile-card");
        if (!this._tile) this._createTile(innerTileConfig(this._config, this._open));
      });
    }
    this._picture = undefined;
    if (this._hass) this.hass = this._hass;
    this._layout();
  }

  _createTile(tile) {
    this._tile = document.createElement("hui-tile-card");
    this._tile.classList.add("tile");
    this._tile.setConfig(tile);
    if (this._hass) this._tile.hass = this._innerHass(this._hass);
    if (this._preview !== undefined) this._tile.preview = this._preview;
    if (this._layoutValue !== undefined) this._tile.layout = this._layoutValue;
    this._frame.insertBefore(this._tile, this._over);
    this._layout();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._job = this._jobState(hass);
    this._frame.classList.toggle("off", this._job.phase === "off");
    if (this._tile) this._tile.hass = this._innerHass(hass);
    this._updateBadge();
    this._updateEdge();
    this._tick();
  }

  get hass() {
    return this._hass;
  }

  // Dashboard properties the tile card uses
  set preview(value) {
    this._preview = value;
    if (this._tile) this._tile.preview = value;
  }

  set layout(value) {
    this._layoutValue = value;
    if (this._tile) this._tile.layout = value;
  }

  getCardSize() {
    if (this._tile?.getCardSize) return this._tile.getCardSize();
    return 1 + (this._config?.features?.length ?? 0);
  }

  getGridOptions() {
    if (this._tile?.getGridOptions) return this._tile.getGridOptions();
    return { columns: 6, rows: 1 + (this._config?.features?.length ?? 0), min_columns: 6, min_rows: 1 };
  }

  connectedCallback() {
    this._layout();
    this._tick();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  // Whether the features are shown is remembered in this browser, per laser
  get _storageKey() {
    return `xtool-card:${this._config?.entity}`;
  }

  _storedOpen() {
    try {
      const v = window.localStorage.getItem(this._storageKey);
      return v === null ? undefined : v === "1";
    } catch (err) {
      return undefined;
    }
  }

  _setOpen(open) {
    this._open = open;
    try {
      window.localStorage.setItem(this._storageKey, open ? "1" : "0");
    } catch (err) {
      // Storage can be unavailable (private windows); the card still works
    }
    if (this._tile) this._tile.setConfig(innerTileConfig(this._config, open));
    this._areasKey = undefined;
    this._layout();
  }

  /** The job as the card shows it: phase, progress (0 to 1), start time. */
  _jobState(hass) {
    const id = this._config.entity;
    const status = statusOf(hass, id);
    const statusObj = status ? hass.states[status] : undefined;
    const phase = phaseOf(statusObj?.state);
    const progressId = sibling(hass, id, "progress");
    const raw = progressId ? Number(hass.states[progressId]?.state) : NaN;
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw / 100)) : undefined;
    const working = phase === "processing" || phase === "paused";
    if (!working) this._started = undefined;
    else if (this._started === undefined) {
      // Counted from when the status last changed: the job's start, unless
      // the card first sees the job while it is paused
      const changed = Date.parse(statusObj?.last_changed ?? "");
      this._started = Number.isFinite(changed) ? changed : Date.now();
    }
    const taskTimeId = sibling(hass, id, "task_time");
    const taskTime = taskTimeId ? Number(hass.states[taskTimeId]?.state) : NaN;
    return { phase, value, working, started: this._started, taskTime, machine: machineOf(hass, id) };
  }

  /** The attributes for the tile card's State content (see JOB_ATTRIBUTES). */
  _attributes() {
    const { phase, value, working, started, taskTime } = this._job;
    const extra = {};
    if (working && value !== undefined) extra.progress = `${Math.round(value * 100)} %`;
    if (working && started !== undefined) extra.elapsed = formatDuration((Date.now() - started) / 1000);
    if (phase === "finished" && Number.isFinite(taskTime)) extra.job_time = formatDuration(taskTime);
    const hass = this._hass, id = this._config.entity;
    for (const [name, role, onText, offText] of PART_ATTRIBUTES) {
      // The exhaust's running sensor, or else its switch
      const entityId = sibling(hass, id, role) ?? (role === "exhaust_running" ? sibling(hass, id, "exhaust") : undefined);
      const state = entityId ? hass.states[entityId]?.state : undefined;
      if (state === "on") extra[name] = onText;
      else if (state === "off") extra[name] = offText;
    }
    return extra;
  }

  /**
   * The Home Assistant object the tile card sees: the same, except that the
   * card's entity has the state picture and the job's attributes. The
   * changed state object is reused until any of them changes.
   */
  _innerHass(hass) {
    const entity = this._config?.entity;
    const stateObj = hass.states[entity];
    if (!stateObj || !this._job) return hass;
    const { phase, machine, started } = this._job;
    const pictureKey = `${phase}|${machine.laser}|${machine.galvo}|${started}|${this._config.style}|${reducedMotion()}`;
    if (pictureKey !== this._pictureKey || !this._picture) {
      this._pictureKey = pictureKey;
      this._picture = statePicture(phase, phaseColor(phase, machine.laser), {
        galvo: machine.galvo, seed: started ?? 1, backing: this._config.style !== "none", motion: !reducedMotion(),
      });
    }
    const extra = this._attributes();
    const extraKey = JSON.stringify(extra);
    if (this._sourceState !== stateObj || this._lastPicture !== this._picture || this._lastExtra !== extraKey) {
      this._sourceState = stateObj;
      this._lastPicture = this._picture;
      this._lastExtra = extraKey;
      this._innerState = { ...stateObj, attributes: { ...stateObj.attributes, ...extra, entity_picture: this._picture } };
    }
    return { ...hass, states: { ...hass.states, [entity]: this._innerState } };
  }

  // While a job runs and the elapsed time is shown, update it every second
  _tick() {
    const shown = [].concat(this._config?.state_content ?? []).includes("elapsed");
    const run = this.isConnected && shown && this._job?.phase === "processing";
    if (run && !this._timer) {
      this._timer = setInterval(() => {
        if (this._tile && this._hass) this._tile.hass = this._innerHass(this._hass);
      }, 1000);
    } else if (!run && this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /** The most urgent badge the card shows, or undefined. */
  _badgeNow() {
    const hass = this._hass, id = this._config.entity;
    const shown = Array.isArray(this._config.badges) ? this._config.badges : DEFAULT_BADGES;
    const stateOf = (role) => {
      const entityId = sibling(hass, id, role);
      return entityId ? hass.states[entityId]?.state : undefined;
    };
    const phase = this._job.phase;
    const status = statusOf(hass, id);
    const candidates = [
      ["alarm", phase === "fire", "fire", "var(--error-color, #db4437)", "Fire warning"],
      ["alarm", stateOf("alarm") === "on" || phase === "error", "alarm", "var(--error-color, #db4437)", "Alarm"],
      ["connection", !status || hass.states[status]?.state === "unavailable", "connection", "#616161", "Not connected"],
      ["safety_key", stateOf("safety_key") === "off", "safety_key", "var(--warning-color, #ffa600)", "Safety key removed"],
      ["lid", stateOf("cover_open") === "on", "lid", "var(--warning-color, #ffa600)", "Lid open"],
      ["safety_off", ["flame_alarm", "enclosure_stop", "moved_stop"].some((role) => stateOf(role) === "off"),
        "safety_off", "var(--warning-color, #ffa600)", "A safety check is off"],
      ["firmware", stateOf("firmware") === "on", "firmware", "var(--info-color, #039be5)", "Firmware update available"],
    ];
    const hit = candidates.find(([option, active]) => active && shown.includes(option));
    return hit ? { path: BADGE_PATHS[hit[2]], color: hit[3], label: hit[4] } : undefined;
  }

  _updateBadge() {
    const badge = this._hass && this._job ? this._badgeNow() : undefined;
    this._badge.classList.toggle("on", !!badge);
    if (!badge) {
      this._badge.removeAttribute("aria-label");
      this._badge.title = "";
      return;
    }
    this._badge.style.background = badge.color;
    this._badge.querySelector("path").setAttribute("d", badge.path);
    this._badge.title = badge.label;
    this._badge.setAttribute("aria-label", badge.label);
    this._placeBadge();
  }

  // The badge sits on the picture's edge, up and to the right
  _placeBadge() {
    const icon = this._tile?.shadowRoot?.querySelector("ha-tile-icon");
    if (!icon) {
      if (this._tile && !this._badgeRetry) {
        this._badgeRetry = true;
        Promise.resolve(this._tile.updateComplete).then(() => {
          this._badgeRetry = false;
          if (this._tile.shadowRoot?.querySelector("ha-tile-icon")) this._placeBadge();
        });
      }
      return;
    }
    const frame = this._frame.getBoundingClientRect(), box = icon.getBoundingClientRect();
    if (!box.width) return;
    const scale = frame.width / this._frame.offsetWidth || 1;
    const r = box.width / 2 / scale;
    const cx = (box.left - frame.left) / scale + r, cy = (box.top - frame.top) / scale + r;
    this._badge.style.left = `${cx + r * .7071}px`;
    this._badge.style.top = `${cy - r * .7071}px`;
  }

  /** The progress edge, as configured, for the job's phase. */
  _updateEdge() {
    const edge = this._edge, pct = this._pct;
    const p = progressOptions(this._config);
    const job = this._job;
    const showWhile = Array.isArray(p.show_while) ? p.show_while : PROGRESS_DEFAULTS.show_while;
    edge.className = "";
    edge.removeAttribute("style");
    pct.className = "";
    if (!job || p.edge === "none" || !showWhile.includes(job.phase)) return;
    const value = job.phase === "finished" ? 1 : job.value;
    const determinate = value !== undefined;
    const color = this._edgeColor(p.color, job, value);
    const thickness = Math.max(1, Math.min(24, Number(p.thickness) || PROGRESS_DEFAULTS.thickness));
    const clamp = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);
    let start = clamp(p.start, 0), end = clamp(p.end, 100);
    if (start > end) [start, end] = [end, start];
    const counter = p.direction === "counterclockwise";
    edge.classList.add("on");
    if (!determinate) edge.classList.add("indeterminate");
    if (p.edge === "around") {
      edge.classList.add("around");
      edge.style.padding = `${thickness}px`;
      if (!determinate) {
        edge.style.background = color;
      } else {
        const deg = Math.round(value * 36000) / 100;
        edge.style.background = counter
          ? `conic-gradient(from 0deg, ${TRACK} 0deg ${360 - deg}deg, ${color} ${360 - deg}deg 360deg)`
          : `conic-gradient(from 0deg, ${color} 0deg ${deg}deg, ${TRACK} ${deg}deg 360deg)`;
      }
    } else {
      const horizontal = p.edge === "top" || p.edge === "bottom";
      edge.classList.add(horizontal ? "horizontal" : "vertical");
      const place = {
        top: `top: 0; left: 0; right: 0; height: ${thickness}px;`,
        bottom: `bottom: 0; left: 0; right: 0; height: ${thickness}px;`,
        left: `top: 0; bottom: 0; left: 0; width: ${thickness}px;`,
        right: `top: 0; bottom: 0; right: 0; width: ${thickness}px;`,
      }[p.edge];
      const direction = BAR_DIRECTION[p.edge][counter ? "counterclockwise" : "clockwise"];
      // Rounded: 100 * 0.42 is 42.00000000000001 in floating point
      const stop = Math.round((start + (end - start) * (value ?? 0)) * 100) / 100;
      const background = determinate
        ? `linear-gradient(${direction}, ${TRACK} 0%, ${TRACK} ${start}%, ${color} ${start}%, ${color} ${stop}%, ${TRACK} ${stop}%, ${TRACK} 100%)`
        : TRACK;
      edge.style.cssText = `${place} background: ${background}; transition: background 3s linear;`;
      edge.querySelector(".sweep").style.background = color;
    }
    if (p.show_percentage && determinate) {
      pct.classList.add("on");
      pct.textContent = `${Math.round(value * 100)}%`;
      pct.style.color = color;
    }
  }

  _edgeColor(spec, job, value) {
    if (spec === "thresholds" && value !== undefined) {
      if (value > 0.6) return "var(--success-color, #43a047)";
      if (value > 0.2) return "var(--warning-color, #ffa600)";
      return "var(--error-color, #db4437)";
    }
    if (!spec || spec === "state" || spec === "thresholds") return phaseColor(job.phase, job.machine.laser);
    return cssColor(spec);
  }

  _layout() {
    if (!this._config) return;
    const style = this._config.style;
    const tone = TONE[style];
    for (const [id] of STYLES) this._frame.classList.toggle(id, id === style && !!tone);
    this._frame.classList.toggle("styled", !!tone);
    if (this._tile) {
      this._tile.classList.toggle("dark", tone === "dark");
      this._tile.classList.toggle("light", tone === "light");
      this._tile.classList.toggle("champagne", style === "champagne");
      this._tile.classList.toggle("solid", !!tone && (this._config.features_style ?? "match") !== "match");
      this._styleWindowText();
    }
    this._drawWindow();
    this._drawAreas();
    if (this._badge.classList.contains("on")) this._placeBadge();
  }

  /**
   * On xTool Champagne the window is orange glass under a light body: the
   * title's text on the window is light. This styles the tile card's title
   * from inside it; if Home Assistant renames that part, the title keeps the
   * body's text color.
   */
  _styleWindowText() {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    if (!XtoolCard._windowSheet) {
      XtoolCard._windowSheet = new CSSStyleSheet();
      XtoolCard._windowSheet.replaceSync(`
        :host(.champagne) ha-tile-info {
          --primary-text-color: rgba(255, 248, 240, .97); --secondary-text-color: rgba(255, 236, 220, .86);
          text-shadow: 0 1px 2px rgba(90, 30, 0, .55);
        }`);
    }
    try {
      if (!root.adoptedStyleSheets.includes(XtoolCard._windowSheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, XtoolCard._windowSheet];
      }
    } catch (err) {
      console.warn("xTool card: could not style the title on the window", err);
    }
  }

  /** A box in the card's own pixels (the card can be scaled in the editor). */
  _box(el) {
    const origin = this._frame.getBoundingClientRect();
    const scale = origin.width / this._frame.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  /**
   * The window covers the title (and any feature beside it); the body shows
   * below, behind the features. Read from the tile card's rendered layout;
   * if it ever changes, the window covers the whole card.
   */
  _drawWindow() {
    if (!TONE[this._config.style]) return;
    const W = this._frame.offsetWidth, H = this._frame.offsetHeight;
    if (!W || !H) return;
    const margin = 5;
    let bottom = H - margin;
    const root = this._tile?.shadowRoot;
    const info = root && findDeep(root, "ha-tile-info");
    const infoBox = info && this._box(info);
    if (infoBox) {
      const below = findAllDeep(root, "hui-card-features").map((el) => this._box(el))
        .filter((b) => b && b.y >= infoBox.y + infoBox.h - 1);
      if (below.length) bottom = Math.min(...below.map((b) => b.y)) - 6;
    }
    Object.assign(this._window.style, { left: `${margin}px`, top: `${margin}px`, width: `${W - 2 * margin}px`, height: `${Math.max(0, bottom - margin)}px` });
    Object.assign(this._stripe.style, { left: `${margin + 4}px`, width: `${W - 2 * margin - 8}px`, top: `${bottom + 2}px` });
    // No body below the window (no features below the title): no line
    this._stripe.style.visibility = bottom >= H - margin ? "hidden" : "";
  }

  /**
   * The areas the feature controls take, in the card's own pixels: each
   * control, except that each button of this card's features counts on its
   * own, so the body shows between them.
   */
  _featureAreas() {
    const root = this._tile?.shadowRoot;
    if (!root) return [];
    const areas = [];
    for (const wrap of findAllDeep(root, "hui-card-feature")) {
      this._watchAdded(wrap.shadowRoot);
      const inner = wrap.shadowRoot ?? wrap;
      const ours = findDeep(inner, FEATURE_TAGS.join(", "));
      const keys = ours ? [...(ours.shadowRoot?.querySelectorAll(".key, .shot") ?? [])] : [];
      const element = [...inner.children].find((c) => c.tagName !== "STYLE");
      for (const el of keys.length ? keys : [element]) {
        const b = el && this._box(el);
        if (!b) continue;
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        areas.push({ ...b, radius });
      }
    }
    this._watchAdded(root);
    return areas;
  }

  // Console: this card's buttons become keys, and Home Assistant's toggle a slide
  _styleControls(keys) {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    try {
      for (const el of findAllDeep(root, FEATURE_TAGS.join(", "))) el.toggleAttribute("xtool-console", keys);
      for (const el of findAllDeep(root, "ha-control-switch")) styleHaControl(el, keys);
    } catch (err) {
      console.warn("xTool card: could not style the controls", err);
    }
  }

  // Draw again when elements are added in the tile card (features render late)
  _watchAdded(root) {
    if (!root) return;
    this._observed ??= new WeakSet();
    if (this._observed.has(root)) return;
    this._observed.add(root);
    this._mutations ??= new MutationObserver(() => {
      clearTimeout(this._areasTimer);
      this._areasTimer = setTimeout(() => this._layout(), 0);
    });
    this._mutations.observe(root, { childList: true, subtree: true });
  }

  _drawAreas() {
    const style = TONE[this._config?.style] ? this._config.features_style ?? "match" : "match";
    this._styleControls(style === "console");
    if (style === "match") {
      this._areas.replaceChildren();
      this._areasKey = undefined;
    } else {
      const pad = style === "console" ? 3 : 2;
      const areas = this._featureAreas().map((b) => ({
        x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad,
        radius: Math.min(b.radius + pad, (b.h + 2 * pad) / 2),
      }));
      const key = style + JSON.stringify(areas.map((a) => [a.x, a.y, a.w, a.h, a.radius].map(Math.round)));
      if (key !== this._areasKey) {
        this._areasKey = key;
        this._areas.style.setProperty("--flat", FLAT[this._config.style] ?? "transparent");
        this._areas.replaceChildren(...areas.map((a) => {
          const el = document.createElement("div");
          el.className = `area ${style}`;
          Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px`, borderRadius: `${a.radius}px` });
          return el;
        }));
      }
    }
    // The tile card can move its features without changing size (fonts
    // loading, the editor preview opening): check again for about a second
    if (this._settling) return;
    this._settleUntil = performance.now() + 1200;
    this._settling = true;
    const check = () => {
      if (performance.now() > this._settleUntil || !this.isConnected) {
        this._settling = false;
        return;
      }
      this._drawWindow();
      this._drawAreas();
      if (this._badge.classList.contains("on")) this._placeBadge();
      setTimeout(check, 100);
    };
    setTimeout(check, 100);
  }
}

// ---------------------------------------------------------------------------
// The editor: the tile card's own editor, plus a panel for the xTool look
// ---------------------------------------------------------------------------

// Tile card options this card sets itself, so they are left out of its editor
const HIDDEN_TILE_OPTIONS = ["icon", "show_entity_picture"];

function hideOptions(schema, entities) {
  return schema
    .filter((item) => !HIDDEN_TILE_OPTIONS.includes(item.name))
    .map((item) => {
      if (Array.isArray(item.schema)) return { ...item, schema: hideOptions(item.schema, entities) };
      // The entity picker offers the lasers' status sensors
      if (item.name === "entity" && entities) return { ...item, selector: { entity: { include_entities: entities } } };
      return item;
    });
}

/** Every xTool laser's status sensor. */
function xtoolStatusSensors(hass) {
  return Object.values(hass?.entities ?? {})
    .filter((e) => e.platform === DOMAIN && e.translation_key === "status")
    .map((e) => e.entity_id)
    .sort();
}

/** hass with the card's entity carrying example job attributes, so State content can offer them. */
function withJobAttributes(hass, entityId) {
  const stateObj = hass?.states[entityId];
  if (!stateObj) return hass;
  const attributes = { ...JOB_ATTRIBUTES, ...stateObj.attributes };
  return { ...hass, states: { ...hass.states, [entityId]: { ...stateObj, attributes } } };
}

/**
 * The tile card's editor, with the options above left out. It is the tile
 * card's own editor class, so it keeps every future change to it. If a Home
 * Assistant update renames its form layout, the editor still works and simply
 * shows those options again.
 */
function tileEditorType() {
  if (customElements.get(TILE_EDITOR_TYPE)) return TILE_EDITOR_TYPE;
  const Base = customElements.get("hui-tile-card-editor");
  if (!Base) return null;
  customElements.define(TILE_EDITOR_TYPE, class extends Base {
    constructor() {
      super();
      const original = this._schema;
      if (typeof original !== "function") return;
      let lastIn, lastKey, lastOut;
      this._schema = (...args) => {
        const schema = original.apply(this, args);
        const key = (this.xtoolEntities ?? []).join(",");
        if (schema !== lastIn || key !== lastKey) {
          lastIn = schema;
          lastKey = key;
          lastOut = Array.isArray(schema) ? hideOptions(schema, this.xtoolEntities) : schema;
        }
        return lastOut;
      };
    }
  });
  return TILE_EDITOR_TYPE;
}

const select = (options, extra = {}) => ({ select: { mode: "dropdown", options: options.map(([value, label]) => ({ value, label })), ...extra } });

class XtoolCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        #tile { display: block; }
        ha-expansion-panel {
          display: block; margin-top: 24px;
          --expansion-panel-content-padding: 0;
          border-radius: var(--ha-border-radius-md, 8px);
          --ha-card-border-radius: var(--ha-border-radius-md, 8px);
        }
        ha-expansion-panel > [slot="header"] { margin: 0; font-size: inherit; font-weight: inherit; }
        .content { padding: 12px; display: grid; gap: 16px; }
      </style>
      <div id="tile"></div>
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">xTool</div>
        <div class="content"><ha-form id="form"></ha-form></div>
      </ha-expansion-panel>`;
    this._form = this.shadowRoot.getElementById("form");
    this._form.computeLabel = (s) => s.label ?? s.title ?? s.name;
    this._form.computeHelper = (s) => s.helper;
    this._form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value;
      this._update({
        style: v.style ?? "none",
        features_style: v.features_style,
        badges: v.badges ?? [],
        progress: { ...PROGRESS_DEFAULTS, ...(v.progress ?? {}) },
        features_toggle: !!v.features_toggle,
        features_open: v.features_open !== false,
      });
    });
  }

  set hass(hass) {
    this._hass = hass;
    this._form.hass = hass;
    if (this._tileEditor) this._tileEditor.hass = withJobAttributes(hass, this._config?.entity);
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    if (this._tileEditor) this._tileEditor.lovelace = lovelace;
  }

  setConfig(config) {
    this._config = explicit(config);
    this._render();
    this._setTileEditorConfig();
    if (JSON.stringify(this._config) !== JSON.stringify(config)) this._fire();
  }

  async _setTileEditorConfig() {
    if (!this._tileEditor) {
      this._loading ??= (async () => {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement({ type: "tile", entity: this._config.entity });
        await customElements.whenDefined("hui-tile-card");
        const original = await customElements.get("hui-tile-card").getConfigElement();
        const type = tileEditorType();
        const editor = type ? document.createElement(type) : original;
        editor.addEventListener("config-changed", (ev) => {
          // The tile card's options changed: keep ours and pass the whole card on
          ev.stopPropagation();
          const own = Object.fromEntries(OWN_KEYS.filter((k) => k in this._config).map((k) => [k, this._config[k]]));
          const next = { ...ev.detail.config, ...own, type: this._config.type };
          delete next.show_entity_picture;  // always on: the state picture is shown there
          this._config = next;
          this._fire();
          // The tile editor shows a change only once its configuration is handed back
          editor.setConfig(ev.detail.config);
          if (ev.detail.config.entity) editor.hass = withJobAttributes(this._hass, ev.detail.config.entity);
        });
        editor.xtoolEntities = xtoolStatusSensors(this._hass);
        editor.hass = withJobAttributes(this._hass, this._config.entity);
        if (this._lovelace) editor.lovelace = this._lovelace;
        this.shadowRoot.getElementById("tile").replaceWith(editor);
        this._tileEditor = editor;
      })();
      await this._loading;
    }
    this._tileEditor.setConfig(tileConfig(this._config));
  }

  _render() {
    const c = this._config;
    const styled = c.style !== "none";
    this._form.schema = [
      {
        name: "style", label: "xTool style",
        helper: "The machine's window behind the title and its body behind the rest.",
        selector: select(STYLES),
      },
      ...(styled ? [{
        name: "features_style", label: "Features style",
        helper: "Match style: the controls sit on the body. Flat: on a patch of the body's base color. Console: in a channel pressed into the body.",
        selector: select(FEATURES_STYLES),
      }] : []),
      {
        name: "features_toggle", label: "Tap the card to show or hide the features",
        helper: "While this is on, a tap on the card does this instead of its Tap behavior (under Interactions). Icon tap behavior still works.",
        selector: { boolean: {} },
      },
      ...(c.features_toggle ? [{ name: "features_open", label: "Show the features at load", selector: { boolean: {} } }] : []),
      {
        name: "badges", label: "Badges",
        helper: "One badge shows on the picture: the most urgent of those chosen here.",
        selector: { select: { multiple: true, mode: "list", options: BADGES.map(([value, label]) => ({ value, label })) } },
      },
      {
        type: "expandable", name: "progress", title: "Progress edge",
        schema: [
          { name: "edge", label: "Edge", selector: select(EDGES) },
          {
            type: "grid", name: "", schema: [
              { name: "thickness", label: "Thickness (px)", selector: { number: { mode: "box", min: 1, max: 24, step: 1 } } },
              { name: "start", label: "Starts at (%)", selector: { number: { mode: "box", min: 0, max: 100, step: 1 } } },
              { name: "end", label: "Ends at (%)", selector: { number: { mode: "box", min: 0, max: 100, step: 1 } } },
            ],
          },
          { name: "direction", label: "Direction", selector: select(DIRECTIONS) },
          {
            name: "color", label: "Color",
            helper: "Follows the state: the laser's working color, amber when paused, green when finished. Thresholds: green above 60%, amber above 20%, red below. You can also type a color.",
            selector: select([["state", "Follows the state"], ["thresholds", "Thresholds"]], { custom_value: true }),
          },
          { name: "show_percentage", label: "Show the percentage", selector: { boolean: {} } },
          {
            name: "show_while", label: "Show while",
            helper: "Without a progress sensor (such as on the F2 Ultra UV), the edge sweeps while a job runs.",
            selector: { select: { multiple: true, mode: "list", options: SHOW_WHILE.map(([value, label]) => ({ value, label })) } },
          },
        ],
      },
    ];
    this._form.data = {
      style: c.style,
      features_style: c.features_style ?? "match",
      badges: Array.isArray(c.badges) ? c.badges : DEFAULT_BADGES,
      progress: progressOptions(c),
      features_toggle: !!c.features_toggle,
      features_open: c.features_open !== false,
    };
  }

  _update(changes) {
    this._config = explicit({ ...this._config, ...changes });
    this._render();
    this._fire();
  }

  _fire() {
    fire(this, "config-changed", { config: this._config });
  }
}

/**
 * The configuration as the editor saves it: the style written out, and the
 * features style only for a style that has one.
 */
function explicit(config) {
  const c = { ...config };
  c.style = STYLES.some(([id]) => id === c.style) ? c.style : "none";
  if (c.style === "none") delete c.features_style;
  else c.features_style = FEATURES_STYLES.some(([id]) => id === c.features_style) ? c.features_style : "match";
  // Whether the features show at load matters only when a tap shows or hides them
  if (c.features_toggle) c.features_open = c.features_open !== false;
  else {
    delete c.features_toggle;
    delete c.features_open;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
const define = (name, cls) => {
  if (!customElements.get(name)) customElements.define(name, cls);
};

if (!customElements.get(CARD_TYPE)) {
  for (const [tag, cls] of Object.entries(FEATURES)) define(tag, cls);
  define("xtool-feature-editor", XtoolFeatureEditor);
  define(CARD_TYPE, XtoolCard);
  define(EDITOR_TYPE, XtoolCardEditor);

  const has = (roles) => (hass, context) =>
    isXtool(hass, context?.entity_id) && roles.some((role) => !!sibling(hass, context.entity_id, role));
  window.customCardFeatures = window.customCardFeatures || [];
  window.customCardFeatures.push(
    { type: "xtool-job", name: "xTool job", isSupported: has(["resume", "pause", "cancel"]), configurable: true },
    { type: "xtool-peripherals", name: "xTool peripherals", isSupported: has(PERIPHERALS.map((p) => p.role)), configurable: true },
    { type: "xtool-safety", name: "xTool safety checks", isSupported: has(SAFETY.map((s) => s.role)), configurable: true },
    { type: "xtool-settings", name: "xTool settings", isSupported: has(SETTINGS.map((s) => s.role)), configurable: true },
    {
      type: "xtool-camera", name: "xTool camera",
      isSupported: (hass, context) => isXtool(hass, context?.entity_id) && camerasOf(hass, context.entity_id).length > 0, configurable: true,
    },
    {
      type: "xtool-if2-fan", name: "xTool SafetyPro IF2 fan",
      isSupported: (hass, context) => isXtool(hass, context?.entity_id) && !!if2Fan(hass, context.entity_id), configurable: true,
    },
  );

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "xTool Laser",
    description: "A tile card for an xTool laser: its state as a picture, a progress edge, safety badges, and an optional xTool style.",
    preview: true,
    documentationURL: "https://github.com/thecodingdad/ha-xtool#dashboard-card",
  });
  console.info(`%c XTOOL CARD %c ${VERSION} `, "color: #fff; background: #555; font-weight: bold", "color: #fff; background: #e0681f");
}
