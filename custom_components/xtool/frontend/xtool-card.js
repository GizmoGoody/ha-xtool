/**
 * xTool Laser dashboard card and tile features.
 *
 * Tile features (they work in any tile card for an xTool entity, and in the
 * xTool card):
 * - custom:xtool-job          Start or Resume, Pause and Cancel, following the job
 * - custom:xtool-peripherals  power, the exhaust fan, fill lights (on or off), red dot
 *                             and other parts; a fan's icon turns while it runs
 * - custom:xtool-fill-light   the fill lights' brightness, side by side: the tile card's own light brightness feature
 * - custom:xtool-safety       the safety checks, the safety key and Access control; turning a check off asks first
 * - custom:xtool-settings     the Configuration switches: buzzer reminders, the IF2 buzzer, device sleep
 * - custom:xtool-camera       a camera, shown by Home Assistant's own image element, with buttons to switch;
 *                             tap two corners on the main camera's picture to crop it; a key for the deep camera's perspective
 * - custom:xtool-if2-fan      the SafetyPro IF2 inline fan: Off, A (Auto) and a speed key that steps 1 to 4
 * - custom:xtool-focus        Autofocus, then - and + around the thickness to focus on, which can be typed
 * Each finds its entities on the same device as the card's entity, or on
 * the devices connected to it (the cameras' devices, the IF2's).
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
 *   can collapse to the title, and to collapse it while the machine is off,
 * - the job's progress, elapsed time and last job time, and the state of
 *   parts such as the exhaust and the red dot, as attributes the tile card's
 *   "State content" can show (see JOB_ATTRIBUTES), and the laser's sensors
 *   there too (see sensorAttributes).
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
  access_control: [["md_mode"], ["switch"]],
  alarm: [["alarm"], ["binary_sensor"]],
  cover_open: [["cover_open"], ["binary_sensor"]],
  safety_key: [["machine_lock"], ["binary_sensor"]],
  firmware: [["firmware"], ["update"]],
  power: [["power_switch"], ["switch"]],
  buzzer: [["beep_enable", "buzzer"], ["switch"]],
  device_sleep: [["device_sleep"], ["switch"]],
  exhaust_running: [["smoking_fan_running"], ["binary_sensor"]],
  focus_height: [["focus_height"], ["number"]],
  engraving_lens: [["engraving_lens"], ["sensor"]],
  autofocus: [["autofocus"], ["button"]],
};
// The same, on the laser's accessory devices (the SafetyPro IF2 and IF2 2.0)
const ACCESSORY_ROLES = {
  if2_fan_entity: [["accessory_ductfanv3_fan"], ["fan"]],
  if2_gear_select: [["accessory_ductfan_gear_select"], ["select"]],
  if2_buzzer: [["accessory_ductfanv3_buzzer", "accessory_ductfan_buzzer"], ["switch"]],
};
// A camera's own settings, on the camera's device (a laser with several
// cameras gives each its own device), or on the laser's with the camera's
// name in front
const CAMERA_ROLES = {
  crop_width: [["crop_width", "camera_main_crop_width"], ["number"]],
  crop_height: [["crop_height", "camera_main_crop_height"], ["number"]],
  crop_center_x: [["crop_center_x", "camera_main_crop_center_x"], ["number"]],
  crop_center_y: [["crop_center_y", "camera_main_crop_center_y"], ["number"]],
  perspective: [["perspective", "camera_deep_perspective"], ["select"]],
};
const CROP_ROLES = ["crop_width", "crop_height", "crop_center_x", "crop_center_y"];
// Reset crop: the calibrated 200 x 200 mm area, centered
const CROP_RESET = { width: 200, height: 200, center_x: 0, center_y: 0 };
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

/** The devices connected to a device (its cameras and accessories), by id. */
function childDevices(hass, device) {
  return Object.values(hass?.devices ?? {}).filter((d) => d.via_device_id === device).map((d) => d.id);
}

/**
 * The entity with this role on the same device as entityId, or undefined.
 * A laser's role is looked for on the laser's device first, then on the
 * devices connected to it (its cameras); an accessory's role on the
 * connected devices only.
 */
function sibling(hass, entityId, role) {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device) return undefined;
  const spec = ROLES[role] ?? ACCESSORY_ROLES[role];
  if (!spec) return undefined;
  const devices = ROLES[role] ? [device, ...childDevices(hass, device)] : childDevices(hass, device);
  for (const d of devices) {
    const found = findRole(deviceEntities(hass, d), spec);
    if (found) return found;
  }
  return undefined;
}

/** The IF2's control: the IF2 2.0's fan, or the first IF2's gear select. */
const if2Control = (hass, entityId) => sibling(hass, entityId, "if2_fan_entity") ?? sibling(hass, entityId, "if2_gear_select");

/** The laser's cameras: [entity_id, label], in CAMERAS order, from its own and its camera devices. */
function camerasOf(hass, entityId) {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device) return [];
  const entities = [device, ...childDevices(hass, device)].flatMap((d) => deviceEntities(hass, d));
  return CAMERAS.map(([key, label]) => [entities.find((e) => e.translation_key === key && domainOf(e.entity_id) === "camera")?.entity_id, label])
    .filter(([id]) => id);
}

/** A camera's own setting (CAMERA_ROLES), on the camera's device. */
function cameraSetting(hass, camera, role) {
  const device = hass?.entities?.[camera]?.device_id;
  return device ? findRole(deviceEntities(hass, device), CAMERA_ROLES[role]) : undefined;
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
  focusing: ["focusing"],
  warming: ["warming_up"],
  finished: ["finished"],
  sleeping: ["sleeping"],
  fire: ["error_fire_warning"],
  overheat: ["laser_overheat"],
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
// The machine's status light (its power button, knob, logo, ring or frame
// light), shown as a thin ring around the state picture: [color, pattern]
// for each phase, from each machine's user guide on support.xtool.com.
// Patterns: solid, slow (blinks slowly), fast (blinks fast), breathe. No
// entry: the light is off. A phase a guide does not list keeps the
// machine's idle light. "Connected to the software" is idle: Home Assistant
// is connected. Machines whose guide gives no light table have no ring.
// ---------------------------------------------------------------------------
const WHITE = "#ffffff", BLUE = "#2196f3", GREEN = "#4caf50", PURPLE = "#9c27b0", RED = "#f44336", YELLOW = "#ffc107";
const LIGHTS = {
  // F2 Ultra, F2 Ultra (Single), F2 Ultra UV: the white power button and
  // logo light: on, blinking slowly while it works, fast while it sets up
  // the network or updates its firmware, off while it sleeps (guides 1961, 2397)
  f2ultra: { idle: [WHITE, "solid"], processing: [WHITE, "slow"], setup: [WHITE, "fast"], firmware: [WHITE, "fast"] },
  // F1 Ultra: its guide shows the logo light only in pictures; the same
  // white logo light as the F2 Ultra (guide 3036)
  f1ultra: { idle: [WHITE, "solid"], processing: [WHITE, "slow"], setup: [WHITE, "fast"], firmware: [WHITE, "fast"] },
  // F1, F1 Lite and F2: the knob light (guides 1955, 2013)
  knob: {
    idle: [BLUE, "solid"], processing: [BLUE, "solid"], finished: [GREEN, "solid"], firmware: [PURPLE, "solid"],
    setup: [YELLOW, "solid"], error: [RED, "solid"], fire: [RED, "solid"], overheat: [RED, "solid"], sleeping: [WHITE, "slow"],
  },
  // P2 and P2S: the ring light (guide 222)
  p2: {
    idle: [WHITE, "solid"], processing: [BLUE, "solid"], paused: [BLUE, "solid"], framing: [BLUE, "breathe"],
    focusing: [BLUE, "breathe"], finished: [GREEN, "solid"], sleeping: [GREEN, "breathe"], firmware: [PURPLE, "solid"],
    setup: [YELLOW, "solid"], error: [RED, "solid"], fire: [RED, "solid"],
  },
  // P3: the ring light (guide 2004)
  p3: {
    idle: [BLUE, "solid"], ready: [BLUE, "slow"], finished: [GREEN, "solid"], firmware: [PURPLE, "solid"],
    setup: [YELLOW, "solid"], error: [RED, "solid"], fire: [RED, "solid"],
  },
  // M1: the frame light (guide 979)
  m1: {
    starting: [WHITE, "fast"], idle: [BLUE, "solid"], setup: [GREEN, "fast"], processing: [BLUE, "fast"], ready: [BLUE, "breathe"],
    finished: [GREEN, "breathe"], sleeping: [WHITE, "breathe"], firmware: [PURPLE, "fast"], error: [RED, "solid"], fire: [RED, "solid"],
  },
  // M1 Ultra: the light on the carriage (guide 1396)
  m1ultra: {
    idle: [PURPLE, "solid"], processing: [GREEN, "solid"], framing: [GREEN, "solid"], paused: [BLUE, "solid"], ready: [BLUE, "slow"],
    sleeping: [PURPLE, "breathe"], firmware: [PURPLE, "slow"], error: [YELLOW, "fast"], fire: [RED, "fast"],
  },
  // M2: the indicator (guide 2778)
  m2: {
    starting: [WHITE, "slow"], idle: [WHITE, "solid"], sleeping: [WHITE, "breathe"], setup: [BLUE, "fast"],
    framing: [YELLOW, "slow"], focusing: [YELLOW, "solid"], processing: [GREEN, "slow"], paused: [GREEN, "solid"], ready: [GREEN, "solid"],
    firmware: [PURPLE, "solid"], fire: [RED, "fast"],
  },
  // S1: the knob light (guide 1106)
  s1: {
    idle: [PURPLE, "solid"], processing: [GREEN, "slow"], paused: [BLUE, "slow"], firmware: [PURPLE, "slow"],
    error: [YELLOW, "fast"], fire: [RED, "fast"],
  },
  // D1, D1 Pro and D1 Pro 2.0: the light beside the Start button (guide 976)
  d1: { idle: [GREEN, "solid"], processing: [BLUE, "fast"], framing: [BLUE, "fast"], error: [RED, "fast"] },
  // MetalFab: the X light of the laser welder (guide 2353)
  metalfab: { idle: [WHITE, "solid"], ready: [GREEN, "slow"], processing: [GREEN, "solid"], error: [RED, "solid"], fire: [RED, "solid"] },
  // Apparel Printer: the status light (guide 1782)
  apparel: {
    idle: [WHITE, "solid"], processing: [GREEN, "solid"], paused: [GREEN, "solid"], firmware: [PURPLE, "slow"],
    error: [RED, "fast"],
  },
};

// The machine's light family, from its model name (most specific first).
// Laserbox, O1 Omni Printer and Retail Marker: no light table, no ring.
const LIGHT_FAMILIES = [
  [/\bF2 Ultra\b/i, "f2ultra"], [/\bF1 Ultra\b/i, "f1ultra"], [/\bF[12]\b/i, "knob"],
  [/\bP2S?\b/i, "p2"], [/\bP3\b/i, "p3"], [/\bM1 Ultra\b/i, "m1ultra"], [/\bM1\b/i, "m1"], [/\bM2\b/i, "m2"],
  [/\bS1\b/i, "s1"], [/\bD1\b/i, "d1"], [/\bMetalFab\b/i, "metalfab"], [/\bApparel\b/i, "apparel"],
];

// Status sensor states the lights show apart from the card's phases
const LIGHT_PHASES = { wifi_setup: "setup", initializing: "starting", processing_ready: "ready", frame_ready: "ready" };

/** The machine's light now: [color, pattern], or undefined while it is off or has no light table. */
function lightOf(hass, entityId, state) {
  const model = `${hass?.devices?.[hass?.entities?.[entityId]?.device_id]?.model ?? ""}`;
  const family = LIGHT_FAMILIES.find(([pattern]) => pattern.test(model))?.[1];
  const phase = LIGHT_PHASES[state] ?? phaseOf(state);
  if (!family || phase === "off") return undefined;
  const lights = LIGHTS[family];
  // The F2 Ultra's and F1 Ultra's light goes off while they sleep
  if (phase === "sleeping" && !lights.sleeping && (family === "f2ultra" || family === "f1ultra")) return undefined;
  return lights[phase] ?? lights.idle;
}

// Drawn on the tile card's icon, from inside the tile card (as the window's
// title text is); if Home Assistant renames that part, there is no ring. The
// tile card gives its icon 6 px of padding around the 36 px circle, for a
// larger tap area; the ring is 3 px wide, inside that circle's edge, so it
// is never larger than the icon. It is drawn over the icon, as the last
// thing in it: an outline is drawn under the state picture, whose shading
// darkens it.
const ICON_PADDING = "6px";
const LIGHT_SHEET = `
  :host([xtool-light]) ha-tile-icon { position: relative; }
  :host([xtool-light]) ha-tile-icon::after {
    content: ""; position: absolute; inset: ${ICON_PADDING}; z-index: 1; pointer-events: none;
    border-radius: 50%; border: 3px solid var(--xtool-light);
  }
  :host([xtool-light="slow"]) ha-tile-icon::after { animation: xtool-light-blink 2s step-end infinite; }
  :host([xtool-light="fast"]) ha-tile-icon::after { animation: xtool-light-blink .6s step-end infinite; }
  :host([xtool-light="breathe"]) ha-tile-icon::after { animation: xtool-light-breathe 3s ease-in-out infinite; }
  @keyframes xtool-light-blink { 50% { border-color: transparent; } }
  @keyframes xtool-light-breathe { 50% { border-color: transparent; } }
  @media (prefers-reduced-motion: reduce) { :host([xtool-light]) ha-tile-icon::after { animation: none; } }`;

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
// The fill lights are daylight white, not the yellow Home Assistant gives a
// light without a color of its own
const DAYLIGHT = "rgb(214, 228, 255)";

// The working color by laser, and the color of every other state
const LASER_COLORS = { uv: "#9b7bff", co2: "#ff7043", diode: "#42a5f5" };
const PHASE_COLORS = {
  idle: "#9aa0a6", framing: "#29a3e0", paused: "#f5a623", finished: "#3fbf6a", sleeping: "#90a4ae",
  error: "#ef5350", fire: "#ff3d00", off: "#8a8a8a", firmware: "#4fc3f7",
  focusing: "#26c6da", warming: "#ffb74d", overheat: "#ff5722",
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
.fd{animation:fd 1.6s ease-in-out infinite}.fu{animation:fu 1.6s ease-in-out infinite}
@keyframes fd{0%,100%{transform:translateY(-1.5px)}50%{transform:translateY(1px)}}
@keyframes fu{0%,100%{transform:translateY(1.5px)}50%{transform:translateY(-1px)}}
.w{animation:fw 2s ease-in-out infinite}.w2{animation-delay:.6s}.w3{animation-delay:1.2s}
@keyframes fw{0%{transform:translateY(-2px);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateY(2px);opacity:0}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.z{opacity:1}.u{stroke-dashoffset:0}}`;

// A small seeded random generator: the same job draws the same path, and
// the same pattern the same reflections
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
  // One walk: from near the edge, heading for the middle at first
  const walk = () => {
    const start = rand() * Math.PI * 2;
    const points = [[12 + Math.cos(start) * 6, 12 + Math.sin(start) * 6]];
    let angle = start + Math.PI + (rand() - 0.5);
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
    return points;
  };
  // A walk can box itself in early: walk again (the same job always draws
  // the same path) and keep the longest
  let points = [];
  for (let attempt = 0; attempt < 30 && points.length < 16; attempt++) {
    const next = walk();
    if (next.length > points.length) points = next;
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
    case "focusing":
      // The head closes in on the surface from above and below
      body = `<path d="M4 12h16" stroke-width="1.6"/>` +
        `<path d="M12 3v5.5M9 6 12 9 15 6" stroke-width="1.8"${c("fd")}/>` +
        `<path d="M12 21v-5.5M9 18 12 15 15 18" stroke-width="1.8"${c("fu")}/>`;
      break;
    case "warming":
      // Heat rising
      body = `<path d="M3.5 21h17" stroke-width="1.6" opacity=".6"/>` +
        ["", " w2", " w3"].map((delay, i) => {
          const x = 7 + i * 5;
          return `<path d="M${x} 18c-1.6-2.2 1.6-3.8 0-6s1.6-3.8 0-6" stroke-width="1.7"${c(`w${delay}`)}/>`;
        }).join("");
      break;
    case "overheat":
      body = `<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0z" stroke-width="1.7"/>` +
        `<path d="M12 8v7.5" stroke-width="2"/><circle cx="12" cy="17.8" r="1.8" fill="${color}" stroke="none"${c("b")}/>`;
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

// The tile card's Time format choices (its time_format option)
const TIME_FORMATS = ["relative", "total", "date", "time", "datetime"];

/** The xTool card a feature is in, if any. */
function cardOf(el) {
  for (let node = el.getRootNode?.()?.host; node; node = node.getRootNode?.()?.host) {
    if (node.localName === CARD_TYPE) return node;
  }
  return undefined;
}

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
  ["access_control", "access_control", "Access control on", "Access control off"],
  ["safety_key", "safety_key", "Safety key in", "Safety key out"],
  ["if2_buzzer", "if2_buzzer", "IF2 buzzer on", "IF2 buzzer off"],
];

// The attributes the card adds for the tile card's State content, with
// examples the editor shows so they can be chosen at any time
const JOB_ATTRIBUTES = {
  progress: "42 %", elapsed: "12:08", job_time: "18:52",
  ...Object.fromEntries(PART_ATTRIBUTES.map(([name, , on]) => [name, on])),
};

// The diagnostic entities State content offers, besides the laser's sensors
const DIAGNOSTIC_STATE_CONTENT = ["wifi_signal", "working_time", "last_job_time", "firmware", "cpu_temp"];

/**
 * The laser's own sensors and binary sensors, and the diagnostic entities
 * above, as attributes for the tile card's State content: {translation key:
 * the state as Home Assistant shows it}. The card's own entity and the parts
 * PART_ATTRIBUTES reports are left out. Unknown and unavailable states are
 * left out unless all is true (the editor offers every one).
 */
function sensorAttributes(hass, entityId, all = false) {
  const device = hass?.entities?.[entityId]?.device_id;
  if (!device) return {};
  const own = hass.entities[entityId].translation_key;
  const parts = PART_ATTRIBUTES.flatMap(([, role]) => ROLES[role]?.[0] ?? []);
  const out = {};
  for (const e of deviceEntities(hass, device)) {
    const key = e.translation_key, domain = domainOf(e.entity_id);
    if (!key || key === own || parts.includes(key) || key in out) continue;
    const wanted = domain === "update"
      ? DIAGNOSTIC_STATE_CONTENT.includes(key)
      : ["sensor", "binary_sensor"].includes(domain) && (!e.entity_category || DIAGNOSTIC_STATE_CONTENT.includes(key));
    const stateObj = wanted ? hass.states[e.entity_id] : undefined;
    if (!stateObj) continue;
    const known = !["unknown", "unavailable"].includes(stateObj.state);
    if (!known && !all) continue;
    // A firmware update entity shows its installed version
    const version = domain === "update" ? stateObj.attributes.installed_version : undefined;
    if (domain === "update" && !version && !all) continue;
    out[key] = version ?? hass.formatEntityState(stateObj);
  }
  return out;
}

/**
 * Answers Home Assistant's "states" context inside an element, as Home
 * Assistant's own provider does (the Lit context protocol), with the states
 * the card changed. Parts that read a state from the context instead of from
 * hass, such as the tile card editor's State content picker, then see the
 * card's attributes. A request made before the states are known is answered
 * once they are.
 */
class StatesProvider {
  constructor(host) {
    this._unsubscribes = new Map();
    this._waiting = [];
    host.addEventListener("context-request", (ev) => {
      if (ev.context !== "states") return;
      ev.stopPropagation();
      if (this._states === undefined) this._waiting.push(ev);
      else this._answer(ev);
    });
  }

  _answer(ev) {
    if (!ev.subscribe) {
      ev.callback(this._states);
      return;
    }
    // The consumer expects the same unsubscribe function with every value
    const unsubscribe = () => this._unsubscribes.delete(ev.callback);
    this._unsubscribes.set(ev.callback, unsubscribe);
    ev.callback(this._states, unsubscribe);
  }

  set states(states) {
    if (states === this._states) return;
    this._states = states;
    for (const ev of this._waiting.splice(0)) this._answer(ev);
    for (const [callback, unsubscribe] of this._unsubscribes) callback(states, unsubscribe);
  }
}

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
    /* Pressed in: the same size, set lower, lit from above */
    transform: translateY(1px);
    background-image: linear-gradient(180deg, rgba(0,0,0,.28), rgba(0,0,0,.06) 40%, rgba(255,255,255,.1));
    box-shadow: inset 0 3px 6px rgba(0,0,0,.55), inset 0 1px 2px rgba(0,0,0,.4), inset 0 -1px 0 rgba(255,255,255,.25);
  }
`;

// What a feature's buttons show: their icons, their names, or both. A button
// without an icon always shows its name.
const DISPLAYS = [["icons", "Icons"], ["names", "Names"], ["both", "Icons and names"]];
function displayOf(config, fallback = "icons") {
  return DISPLAYS.some(([value]) => value === config?.display) ? config.display : fallback;
}
const displayField = (helper) => ({ name: "display", label: "Show", ...(helper ? { helper } : {}), selector: select(DISPLAYS) });

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
  /* A switch that is off: Home Assistant's off color, not its own */
  .key[aria-pressed="false"]:not(.fill)::before { background: var(--disabled-color, #bdbdbd); }
  .key:hover::before { opacity: .35; }
  .key[aria-pressed="true"]::before { opacity: 1; }
  .key[aria-pressed="true"] { color: var(--xtool-on-color, #fff); }
  .key:focus-visible { outline: 2px solid var(--c, var(--feature-color)); outline-offset: 2px; }
  .key:disabled { cursor: default; opacity: .45; }
  .key:disabled::before { opacity: .12; }
  .key > * { position: relative; }
  ha-icon { --mdc-icon-size: 22px; }
  /* A fan's icon turns while it runs, faster at a higher speed */
  .spin { animation: xtool-spin var(--spin, 1.2s) linear infinite; }
  @keyframes xtool-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Filled in its color without being on: a safety check that is off */
  .key.fill::before { opacity: 1; }
  .key.fill { color: var(--xtool-on-color, #fff); }
  ${KEY_CSS}
`;


/**
 * Perform an action through Home Assistant's own action handling, as a
 * card's tap action does. With a confirmation, Home Assistant first asks in
 * its own confirmation dialog ({ title, text, confirm_text }).
 */
function performAction(host, service, entityId, confirmation) {
  // The question's answers: confirm_text, and dismiss_text (Keep it by default)
  fire(host, "hass-action", {
    config: {
      tap_action: {
        action: "perform-action", perform_action: service, target: { entity_id: entityId },
        ...(confirmation ? { confirmation: { dismiss_text: "Keep it", ...confirmation } } : {}),
      },
    },
    action: "tap",
  });
}

/**
 * A row of buttons for one feature. Subclasses list the buttons in
 * _buttons(): { key, label, icon, text, color, pressed, disabled, action,
 * fill (filled in its color though not on), spin (seconds per turn of the icon) }.
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
    const key = JSON.stringify([buttons.map(({ action, ...b }) => b), colors, this._display()]);
    if (key === this._key) return;
    this._key = key;
    this._row.setAttribute("aria-label", this.constructor.label);
    this._row.replaceChildren(...buttons.map((b, i) => this._button(b, colors[i])));
  }

  /** What the buttons show: icons, names or both (see DISPLAYS). */
  _display() {
    return displayOf(this._config, this.constructor.display ?? "icons");
  }

  _button(b, onColor) {
    const display = this._display();
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
    if (b.icon && display !== "names") {
      const icon = document.createElement("ha-icon");
      icon.icon = b.icon;
      icon.setAttribute("icon", b.icon);
      if (b.spin) {
        icon.classList.add("spin");
        icon.style.setProperty("--spin", `${b.spin}s`);
      }
      button.append(icon);
    }
    if (b.text && (display !== "icons" || !b.icon || b.alwaysText)) {
      const span = document.createElement("span");
      span.textContent = b.text;
      button.append(span);
    }
    if (b.fill) button.classList.add("fill");
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      b.action?.();
    });
    return button;
  }

  _usable(entityId) {
    const stateObj = entityId ? this._hass.states[entityId] : undefined;
    return !!stateObj && stateObj.state !== "unavailable";
  }
}

// ---------------------------------------------------------------------------
// Feature: the job. The buttons are chosen in the options, in order:
// Start (Resume when paused), Start / Pause (Pause while the job runs),
// Pause and Cancel. Start / Pause and Cancel by default.
// ---------------------------------------------------------------------------
const JOB_CONTROLS = [["start_pause", "Start / Pause"], ["start", "Start"], ["pause", "Pause"], ["cancel", "Cancel"]];
const JOB_DEFAULT = ["start_pause", "cancel"];

class XtoolJob extends XtoolFeature {
  static label = "Job";
  static display = "both";

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
    const paused = phase === "paused";
    // With Access control on, Studio offers no Pause and no start from the machine
    const controlled = accessControlOn(hass, id);
    const pauseButton = { key: "pause", label: "Pause the job", icon: "mdi:pause", text: "Pause", color: "amber",
      disabled: !this._usable(pause) || phase !== "processing" || controlled, action: press(pause) };
    const startButton = { key: "resume", label: paused ? "Resume the job" : "Start the job", icon: "mdi:play",
      text: paused ? "Resume" : "Start", color: "green",
      disabled: !this._usable(resume) || running || ["off", "sleeping", "firmware"].includes(phase) || (controlled && !paused),
      action: press(resume) };
    const cancelButton = { key: "cancel", label: "Cancel the job", icon: "mdi:stop", text: "Cancel", color: "red",
      disabled: !this._usable(cancel) || !(running || paused), action: () => this._cancel(cancel) };
    const controls = Array.isArray(this._config.controls) ? this._config.controls : JOB_DEFAULT;
    return controls.map((control) => ({
      start_pause: running ? pauseButton : startButton, start: startButton, pause: pauseButton, cancel: cancelButton,
    })[control]).filter((b) => b && sibling(hass, id, { pause: "pause", resume: "resume", cancel: "cancel" }[b.key]));
  }

  _cancel(entityId) {
    const confirmation = this._config.confirm_cancel !== false
      ? { title: "Cancel the job?", text: "The job stops and cannot be resumed.", confirm_text: "Cancel the job" }
      : undefined;
    performAction(this, "button.press", entityId, confirmation);
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
  { role: "fill_light_front", label: "Fill light (front)", icon: "mdi:dome-light", color: DAYLIGHT },
  { role: "fill_light_back", label: "Fill light (back)", icon: "mdi:dome-light", color: DAYLIGHT },
  { role: "fill_light", label: "Fill light", icon: "mdi:dome-light", color: DAYLIGHT },
  { role: "red_dot", label: "Red dot", icon: "mdi:laser-pointer", color: "red" },
  { role: "cooling_fan", label: "Cooling fan", icon: "mdi:fan-chevron-up", color: "cyan", fan: true },
  { role: "cover_lock", label: "Cover lock", icon: "mdi:lock", color: "indigo" },
  // A button: a tap starts it (off while the laser is busy)
  { role: "autofocus", label: "Autofocus", icon: "mdi:image-filter-center-focus", color: "primary", press: true, busy: true },
];
// The phases in which the laser takes no Autofocus, as in Studio
const BUSY_PHASES = ["processing", "paused", "framing", "focusing", "off", "firmware"];

/** The controls of a list the device has, in the order chosen (all by default). */
function chosen(hass, entityId, list, roles) {
  const present = list.filter((item) => sibling(hass, entityId, item.role));
  if (!Array.isArray(roles)) return present;
  return roles.map((role) => present.find((item) => item.role === role)).filter(Boolean);
}

// The configuration switches of the laser and its accessories (the
// Configuration section of their device pages)
const SETTINGS = [
  { role: "buzzer", label: "Buzzer reminders", icon: "mdi:volume-high", color: "teal" },
  { role: "if2_buzzer", label: "IF2 buzzer", icon: "mdi:bell-ring", color: "teal" },
  { role: "device_sleep", label: "Device sleep", icon: "mdi:power-sleep", color: "indigo" },
];

/** A row of on/off buttons for the parts in the class's list. */
class XtoolToggles extends XtoolFeature {
  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass, id = this._entityId;
    const status = statusOf(hass, id);
    // As in Studio: no Autofocus while the laser works, frames, focuses or is off
    const busy = BUSY_PHASES.includes(phaseOf(status ? hass.states[status]?.state : undefined));
    return chosen(hass, id, this.constructor.list, this._config.controls).map((item) => {
      const entityId = sibling(hass, id, item.role);
      const on = hass.states[entityId]?.state === "on";
      return {
        key: item.role, label: item.label, icon: item.icon, text: item.label,
        color: item.color, pressed: item.press ? false : on,
        disabled: !this._usable(entityId) || (item.busy && busy) || (item.role === "autofocus" && accessControlOn(hass, id)),
        // A fan that is on turns (on by default); these fans have no speed
        spin: item.fan && on && this._config.animate_fan !== false ? 1.2 : undefined,
        action: () => this._toggle(item, entityId, on),
      };
    });
  }

  _toggle(item, entityId, on) {
    if (item.press) {
      this._hass.callService("button", "press", { entity_id: entityId });
      return;
    }
    let confirmation;
    if (on && item.warning) {
      const status = statusOf(this._hass, this._entityId);
      const phase = phaseOf(status ? this._hass.states[status]?.state : undefined);
      if (phase === "processing" || phase === "paused") {
        confirmation = { title: `Turn off ${item.label.toLowerCase()}?`, text: item.warning, confirm_text: "Turn off", dismiss_text: "Keep on" };
      }
    }
    performAction(this, `${domainOf(entityId)}.${on ? "turn_off" : "turn_on"}`, entityId, confirmation);
  }
}

class XtoolPeripherals extends XtoolToggles {
  static label = "Controls";
  static list = PERIPHERALS;

  static getStubConfig() {
    return { type: "custom:xtool-peripherals" };
  }
}

class XtoolSettings extends XtoolToggles {
  static label = "Configuration";
  static list = SETTINGS;

  static getStubConfig() {
    return { type: "custom:xtool-settings" };
  }
}

// ---------------------------------------------------------------------------
// Feature: a camera, with buttons to switch between the laser's cameras. The
// picture is Home Assistant's own hui-image, the element its picture cards
// show a camera with: snapshots it refreshes itself (Auto), or the camera's
// live stream (Live). Home Assistant loads hui-image with its picture cards;
// the card asks the card helpers for one, as it does for the tile card.
// ---------------------------------------------------------------------------
const CAMERA_VIEWS = [["auto", "Auto"], ["live", "Live"]];

// The cameras' and perspectives' icons
const CAMERA_ICONS = { camera_main: "mdi:crop-free", camera_deep: "mdi:fullscreen" };
// The perspective: as the camera sees it (skewed), turned square to the
// work area, and straightened flat
const PERSPECTIVE_ICONS = { uncorrected: "mdi:perspective-more", rotated: "mdi:crop-rotate", straightened: "mdi:perspective-less" };

class XtoolCamera extends XtoolFeature {
  static label = "Camera";
  static display = "names";

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = `
      .shot {
        position: relative; display: block; width: 100%; padding: 0; border: 0; cursor: pointer;
        border-radius: var(--feature-border-radius, 12px); overflow: hidden; background: #111;
        margin-bottom: var(--feature-button-spacing, 12px);
      }
      .shot hui-image { display: block; }
      .shot hui-image[hidden] { display: none; }
      /* A new picture loading over the shown one: in the layout, so Home
         Assistant's image fetches it (it fetches only while it is on screen),
         but not seen until it has loaded */
      .shot hui-image.next { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
      .shot.cropping { cursor: crosshair; }
      .shot .area {
        position: absolute; pointer-events: none; box-sizing: border-box;
        border: 2px solid var(--primary-color, #03a9f4); box-shadow: 0 0 0 1px rgba(0, 0, 0, .6), 0 0 0 100vmax rgba(0, 0, 0, .35);
      }
      .shot .area[hidden] { display: none; }
      .shot .hint {
        position: absolute; left: 0; right: 0; top: 0; padding: 6px 12px 16px; text-align: start; pointer-events: none;
        font-size: var(--ha-font-size-s, 12px); color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .9);
        background: linear-gradient(to bottom, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0));
      }
      .shot .hint:empty { display: none; }
      .shot .time {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 16px 12px 6px; text-align: start; pointer-events: none;
        font-size: var(--ha-font-size-s, 12px); color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .9);
        background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0));
      }
      .shot .time:empty { display: none; }
      .row:empty { display: none; }`;
    this._shot = document.createElement("button");
    this._shot.type = "button";
    this._shot.className = "shot";
    this._shot.innerHTML = `<span class="area" hidden></span><span class="hint"></span><span class="time"></span>`;
    this._time = this._shot.querySelector(".time");
    this._area = this._shot.querySelector(".area");
    this._hint = this._shot.querySelector(".hint");
    this._images = new Map();
    this._shot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!this._camera) return;
      // Crop on: a tap marks a corner. Off: a tap opens the camera
      if (this._cropping && this._crop()) this._cropTap(ev);
      else fire(this, "hass-more-info", { entityId: this._camera });
    });
    // After the first corner, the rectangle follows the pointer
    this._shot.addEventListener("pointermove", (ev) => {
      if (this._first) this._showArea(this._first, this._placeOf(ev));
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

  set hass(hass) {
    super.hass = hass;
    this._showCamera();
  }

  setConfig(config) {
    super.setConfig(config);
    this._showCamera();
  }

  get _view() {
    return this._config?.camera_view === "live" ? "live" : "auto";
  }

  _buttons() {
    const cameras = camerasOf(this._hass, this._entityId);
    const current = this._currentCamera(cameras);
    if (current !== this._camera) {
      this._camera = current;
      this._pictureAt = undefined;
      this._showCamera();
    }
    const buttons = this._config.show_switch === false || cameras.length < 2 ? [] : cameras.map(([entityId, label]) => ({
      key: entityId, label: `${label} camera`, text: label, color: "primary", pressed: entityId === current,
      icon: CAMERA_ICONS[this._hass.entities?.[entityId]?.translation_key] ?? "mdi:camera",
      disabled: !this._usable(entityId),
      action: () => {
        // A camera shown before shows its last picture, and a new one at once
        const shownBefore = this._images.has(entityId) && entityId !== this._camera;
        this._picked = entityId;
        this._first = undefined;
        this._cropping = false;
        this._area.hidden = true;
        this._key = undefined;
        this._render();
        if (shownBefore) this._reloadImage(entityId);
      },
    }));
    const crop = this._crop();
    if (crop) {
      // On while choosing a crop and while one is in effect; off shows the
      // whole 200 x 200 mm again
      const usable = this._usable(current);
      const cropped = this._cropped(crop);
      buttons.push({
        key: "crop", label: cropped ? "Crop: on. Tap to show it all" : this._cropping ? "Crop: tap the picture" : "Crop by tapping",
        text: "Crop", icon: "mdi:crop", color: "primary",
        pressed: usable && (!!this._cropping || cropped), disabled: !usable, action: () => this._toggleCropping(crop),
      });
    }
    const perspective = this._perspectiveButton();
    if (perspective) buttons.push(perspective);
    return buttons;
  }

  /**
   * The deep camera's perspective: one key that shows the one chosen, in
   * Home Assistant's words, and steps to the next on a tap.
   */
  _perspectiveButton() {
    const hass = this._hass;
    const deep = hass.entities?.[this._camera]?.translation_key === "camera_deep";
    const entityId = deep && this._config.show_perspective !== false ? cameraSetting(hass, this._camera, "perspective") : undefined;
    const stateObj = entityId ? hass.states[entityId] : undefined;
    if (!stateObj) return undefined;
    const options = stateObj.attributes.options ?? [];
    const name = (value) => hass.formatEntityState?.(stateObj, value) ?? value;
    const next = options[(options.indexOf(stateObj.state) + 1) % options.length];
    return {
      key: "perspective", label: `Perspective: ${name(stateObj.state)}. Tap for ${name(next)}`, text: name(stateObj.state),
      icon: PERSPECTIVE_ICONS[stateObj.state] ?? "mdi:perspective-less", color: "primary",
      disabled: stateObj.state === "unavailable" || !next,
      // The integration takes the new photo before the action ends: show it now
      action: () => {
        const camera = this._camera;
        Promise.resolve(this._hass.callService("select", "select_option", { entity_id: entityId, option: next }))
          .then(() => this._reloadImage(camera), () => {});
      },
    };
  }

  /**
   * The main camera's crop now ({ width, height, center_x, center_y }, mm),
   * when a tap on its picture crops it: the main camera is shown, it has
   * the crop numbers and Crop by tapping is on.
   */
  _crop() {
    const hass = this._hass, camera = this._camera;
    if (!camera || this._config.crop === false || hass.entities?.[camera]?.translation_key !== "camera_main") return undefined;
    const crop = {};
    for (const role of CROP_ROLES) {
      const entityId = cameraSetting(hass, camera, role);
      if (!entityId) return undefined;
      crop[role.slice(5)] = Number(hass.states[entityId]?.state);
    }
    return crop;
  }

  /** Whether a crop is in effect: not the whole 200 x 200 mm, centered. */
  _cropped(crop) {
    return Object.entries(CROP_RESET).some(([side, value]) => crop[side] !== value);
  }

  /** A point's place in the picture box (px). */
  _placeOf(ev) {
    const box = this._shot.getBoundingClientRect();
    return { left: ev.clientX - box.left, top: ev.clientY - box.top };
  }

  /** The rectangle between two places in the picture box. */
  _showArea(a, b) {
    Object.assign(this._area.style, {
      left: `${Math.min(a.left, b.left)}px`, top: `${Math.min(a.top, b.top)}px`,
      width: `${Math.abs(b.left - a.left)}px`, height: `${Math.abs(b.top - a.top)}px`,
    });
    this._area.hidden = false;
  }

  /** The tapped point on the work surface (mm), or undefined off the picture or for a whole-photo side. */
  _pointOf(ev, crop) {
    const img = this._images.get(this._camera)?.shadowRoot?.querySelector("img");
    if (!img?.naturalWidth || !(crop.width > 0) || !(crop.height > 0)) return undefined;
    const box = img.getBoundingClientRect();
    // The picture fills its box (cover): find the part of it that is shown
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const shownW = img.naturalWidth * scale, shownH = img.naturalHeight * scale;
    const u = (ev.clientX - box.left - (box.width - shownW) / 2) / shownW;
    const v = (ev.clientY - box.top - (box.height - shownH) / 2) / shownH;
    if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;
    return { x: crop.center_x + (u - 0.5) * crop.width, y: crop.center_y + (v - 0.5) * crop.height, ...this._placeOf(ev) };
  }

  // First tap: the top-left corner; second tap: the bottom-right corner
  _cropTap(ev) {
    const crop = this._crop();
    const point = crop && this._pointOf(ev, crop);
    if (!point) return;
    if (!this._first) {
      this._first = point;
      this._showArea(point, point);
      this._showHint();
      return;
    }
    const first = this._first;
    this._first = undefined;
    this._area.hidden = true;
    this._showHint();
    const width = Math.abs(point.x - first.x), height = Math.abs(point.y - first.y);
    if (!width || !height) return;
    this._setCrop({
      width: Math.round(width), height: Math.round(height),
      center_x: Math.round((point.x + first.x) / 2), center_y: Math.round((point.y + first.y) / 2),
    });
  }

  // Off: start choosing a crop. On: stop choosing, and show it all again
  _toggleCropping(crop) {
    if (this._cropping || this._cropped(crop)) {
      const cropped = this._cropped(crop);
      this._stopCropping();
      if (cropped) this._setCrop(CROP_RESET);
      return;
    }
    this._cropping = true;
    this._showHint();
    this._key = undefined;
    this._render();
  }

  _stopCropping() {
    this._cropping = false;
    this._first = undefined;
    this._area.hidden = true;
    this._showHint();
    this._key = undefined;
    this._render();
  }

  _setCrop(crop) {
    const camera = this._camera;
    this._first = undefined;
    this._cropping = false;
    this._area.hidden = true;
    this._showHint();
    this._render();
    // The integration takes the new photo before the action ends: show it now
    Promise.resolve(this._hass.callService(DOMAIN, "camera", {
      crop_width: crop.width, crop_height: crop.height, crop_center_x: crop.center_x, crop_center_y: crop.center_y,
    }, { entity_id: camera })).then(() => this._reloadImage(camera), () => {});
  }

  /**
   * Show a camera's latest photo now: a new Home Assistant image fetches it
   * at once, and replaces the old one when its picture has loaded.
   */
  _reloadImage(camera) {
    const old = this._images.get(camera);
    if (!old || !this._hass) return;
    // Home Assistant keeps a camera's picture address for 9 s, and the
    // browser shows the picture it has for an address it has seen: drop
    // this camera's, so the new image asks for a new one
    const addresses = this._hass._cameraTmbUrl;
    if (addresses) addresses[camera] = undefined;
    // A reload still loading for this camera gives way to this one
    this._next?.get(camera)?.remove();
    this._next ??= new Map();
    const image = document.createElement("hui-image");
    Object.assign(image, { entity: camera, cameraImage: camera, fitMode: "cover", hass: this._hass, cameraView: this._view });
    image.classList.add("next");
    old.after(image);
    this._next.set(camera, image);
    let done = false;
    const finish = (loaded) => {
      if (done) return;
      done = true;
      if (this._next.get(camera) === image) this._next.delete(camera);
      // Switched away and back, reloaded again, or no picture: keep the old one
      if (!loaded || this._images.get(camera) !== old || !image.isConnected) {
        image.remove();
        return;
      }
      image.classList.remove("next");
      old.remove();
      this._images.set(camera, image);
      this._showCamera();
    };
    Promise.resolve(image.updateComplete).then(() => {
      image.shadowRoot?.addEventListener("load", () => finish(true), true);
      const img = image.shadowRoot?.querySelector("img");
      if (img?.complete && img.naturalWidth) finish(true);
    });
    // Home Assistant's image gives up on a picture after 10 s
    setTimeout(() => finish(false), 10000);
  }

  _showHint() {
    const crop = this._cropping ? this._crop() : undefined;
    this._shot.classList.toggle("cropping", !!crop);
    this._hint.textContent = !crop ? "" : this._first ? "Tap the opposite corner" : "Tap a corner of the part to show";
  }

  _currentCamera(cameras) {
    const ids = cameras.map(([id]) => id);
    if (this._picked && ids.includes(this._picked)) return this._picked;
    const configured = cameras.find(([, label]) => label === this._config.camera)?.[0];
    return configured ?? ids[0];
  }

  _showCamera() {
    if (!this._hass || !this._config || !this._camera) return;
    if (!customElements.get("hui-image")) {
      // Loaded with Home Assistant's picture cards: ask the card helpers for one
      if (!this._loading) {
        this._loading = true;
        const camera = this._camera;
        window.loadCardHelpers?.()
          .then((helpers) => helpers.createCardElement({ type: "picture-entity", entity: camera, camera_image: camera }))
          .then(() => customElements.whenDefined("hui-image"))
          .then(() => {
            this._loading = false;
            this._showCamera();
          });
      }
      return;
    }
    // One of Home Assistant's images for each camera shown: switching back
    // shows that camera's last picture at once while a new one comes
    if (!this._images.has(this._camera)) {
      const image = document.createElement("hui-image");
      Object.assign(image, { entity: this._camera, cameraImage: this._camera, fitMode: "cover" });
      this._images.set(this._camera, image);
      this._shot.prepend(image);
    }
    for (const [camera, image] of this._images) image.hidden = camera !== this._camera;
    this._image = this._images.get(this._camera);
    Object.assign(this._image, { hass: this._hass, cameraView: this._view });
    this._showHint();
    this._shot.setAttribute("aria-label", `${camerasOf(this._hass, this._entityId).find(([id]) => id === this._camera)?.[1] ?? ""} camera: ${this._cropping ? "crop" : "open"}`);
    this._watchPictures();
    this._showTime();
  }


  // The time shown is when the latest picture arrived in Home Assistant's image
  _watchPictures() {
    const root = this._image?.shadowRoot;
    if (!root) {
      Promise.resolve(this._image?.updateComplete).then(() => this._image?.shadowRoot && this._watchPictures());
      return;
    }
    if (this._watched === root) return;
    this._watched = root;
    root.addEventListener("load", () => {
      this._pictureAt = new Date();
      this._showTime();
    }, true);
  }

  /**
   * The last updated time along the bottom of the picture (an option, for
   * the Auto view): Home Assistant's timestamp display, the element the tile
   * card shows times with, in the tile card's time formats. Features render
   * only inside a tile card, which loads that element.
   */
  _showTime() {
    const shown = !!this._config?.show_time && this._view === "auto" && this._pictureAt;
    if (!shown) {
      this._time.replaceChildren();
      return;
    }
    const chosen = cardOf(this)?._config?.time_format;
    this._stamp ??= document.createElement("hui-timestamp-display");
    this._stamp.hass = this._hass;
    this._stamp.ts = this._pictureAt;
    this._stamp.format = TIME_FORMATS.includes(chosen) ? chosen : undefined;
    if (this._stamp.parentNode !== this._time) this._time.replaceChildren("Updated ", this._stamp);
  }
}

// ---------------------------------------------------------------------------
// Feature: the fill lights' brightness, side by side. Each is Home Assistant's own light
// brightness feature, shown for each fill light chosen through
// hui-card-feature, the element the tile card shows every feature with
// (features render only inside a tile card, which loads it). Turning the
// lights on and off is in the peripherals feature.
// ---------------------------------------------------------------------------
const FILL_LIGHTS = [
  { role: "fill_light_front", label: "Fill light (front)" },
  { role: "fill_light_back", label: "Fill light (back)" },
  { role: "fill_light", label: "Fill light" },
];

/** The laser's fill lights that have a brightness: [{ role, label, entityId }]. */
function dimmableLights(hass, entityId) {
  return FILL_LIGHTS.map((item) => ({ ...item, entityId: sibling(hass, entityId, item.role) }))
    .filter(({ entityId: light }) => (hass?.states[light]?.attributes.supported_color_modes ?? []).some((mode) => mode !== "onoff"));
}

// The feature color: a light's own color when it has one, daylight
// otherwise; Home Assistant's color for a light that is off
const LIGHT_ON = DAYLIGHT;
const LIGHT_OFF = "var(--state-light-inactive-color, var(--state-inactive-color, var(--disabled-color, #bdbdbd)))";

class XtoolFillLight extends HTMLElement {
  static label = "Fill light brightness";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; }
      .lights { display: flex; gap: var(--feature-button-spacing, 12px); }
      .slide { display: block; flex: 1 1 0; min-width: 0; border-radius: var(--feature-border-radius, 12px); }
    </style><div class="lights"></div>`;
    this._box = this.shadowRoot.querySelector(".lights");
    this._slides = new Map();
    keepTaps(this);
  }

  // A new feature shows every fill light, side by side
  static getStubConfig(hass, context) {
    return { type: "custom:xtool-fill-light", lights: dimmableLights(hass, context?.entity_id).map((l) => l.role) };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
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

  /** The fill lights shown, in the order chosen (all by default). */
  _lights() {
    const lights = dimmableLights(this._hass, this._context.entity_id);
    const roles = this._config.lights;
    if (!Array.isArray(roles)) return lights;
    return roles.map((role) => lights.find((l) => l.role === role)).filter(Boolean);
  }

  _render() {
    if (!this._hass || !this._config || !this._context) return;
    const lights = this._lights();
    // One slide for each light, each in its light's color
    const slides = lights.map((light) => {
      let slide = this._slides.get(light.entityId);
      if (!slide) {
        slide = document.createElement("div");
        slide.className = "slide";
        const feature = document.createElement("hui-card-feature");
        feature.feature = { type: "light-brightness" };
        feature.context = { entity_id: light.entityId };
        slide.append(feature);
        this._slides.set(light.entityId, slide);
      }
      const feature = slide.firstChild;
      const stateObj = this._hass.states[light.entityId];
      const rgb = stateObj?.attributes.rgb_color;
      const color = stateObj?.state === "on" ? (Array.isArray(rgb) ? `rgb(${rgb.join(", ")})` : LIGHT_ON) : LIGHT_OFF;
      slide.style.setProperty("--feature-color", color);
      feature.color = color;
      feature.hass = this._hass;
      return slide;
    });
    if (slides.length !== this._box.children.length || slides.some((slide, i) => this._box.children[i] !== slide)) {
      this._box.replaceChildren(...slides);
    }
  }
}

// ---------------------------------------------------------------------------
// Feature: safety. The safety checks (switches: turning one off asks first),
// and the safety key, which can only be shown (a tap opens it)
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
  { role: "safety_key", label: "Safety key", icon: "mdi:key", indicator: true },
  {
    role: "access_control", label: "Access control", icon: "mdi:shield-key", optional: true,
    warning: "Jobs no longer need the access control check before they start.",
    enabling: "Each job then needs the access control check before it starts, and autofocus, framing and starting from the machine are turned off.",
  },
];

/**
 * Whether Access control is on: autofocus, framing and starting a job from
 * the machine are then off, as in Studio, so the card shows them unavailable.
 */
function accessControlOn(hass, entityId) {
  const control = sibling(hass, entityId, "access_control");
  return !!control && hass.states[control]?.state === "on";
}

class XtoolSafety extends XtoolFeature {
  static label = "Safety";

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
        key: item.role, icon: item.icon,
        label: item.indicator
          ? `${item.label}: ${on ? "in" : state === "off" ? "removed" : "unknown"}`
          : `${item.label}: ${on ? "on" : state === "off" ? "off" : "unknown"}`,
        // On (the key in): green. Off (the key removed): red, so it stands out.
        // Access control is optional: off is not a warning
        text: item.label, color: item.optional ? "green" : state === "off" ? "red" : "green", pressed: on,
        fill: !item.optional && state === "off", disabled: !this._usable(entityId),
        action: () => this._toggle(item, entityId, on),
      };
    });
  }

  _toggle(item, entityId, on) {
    if (item.indicator) {
      fire(this, "hass-more-info", { entityId });
      return;
    }
    const confirmation = on ? { title: `Turn off ${item.label.toLowerCase()}?`, text: item.warning, confirm_text: "Turn off", dismiss_text: "Keep on" }
      : item.enabling ? { title: `Turn on ${item.label.toLowerCase()}?`, text: item.enabling, confirm_text: "Turn on", dismiss_text: "Keep off" } : undefined;
    performAction(this, `switch.${on ? "turn_off" : "turn_on"}`, entityId, confirmation);
  }
}

// ---------------------------------------------------------------------------
// Feature: the SafetyPro IF2 inline fan, as one row of keys, the one chosen
// pressed: Off, A (Auto) and the speeds 1 to 4.
// - IF2 2.0 (its fan entity): Off turns the fan off, A sets Auto, where each
//   job sets the speed as Studio does, a speed sets 25 % a step.
// - The first IF2 (its gear select): the select's options.
// Shown disabled while the laser does not see the IF2, as Home Assistant's are.
// ---------------------------------------------------------------------------
const NUMBER_ON = "var(--state-number-active-color, var(--state-active-color, var(--primary-color, #03a9f4)))";
const IF2_KEYS = [["off", "Off"], ["auto", "Auto"], ["speed", "Speed"]];
const IF2_ICONS = { off: "mdi:fan-off", auto: "mdi:fan-auto", speed: "mdi:fan", 1: "mdi:fan-speed-1", 2: "mdi:fan-speed-2", 3: "mdi:fan-speed-3" };

class XtoolIf2Fan extends XtoolFeature {
  static label = "SafetyPro IF2 fan";
  static display = "names";

  static getStubConfig() {
    return { type: "custom:xtool-if2-fan" };
  }

  static getConfigElement() {
    return document.createElement("xtool-feature-editor");
  }

  _buttons() {
    const hass = this._hass, laser = this._entityId, c = this._config;
    const fan = sibling(hass, laser, "if2_fan_entity");
    const fanState = fan ? hass.states[fan] : undefined;
    if (fanState) {
      const preset = (fanState.attributes.preset_modes ?? [])[0];
      const step = fanState.attributes.percentage_step ?? 25;
      const speeds = Math.max(1, Math.round(100 / step));
      let value;
      if (fanState.attributes.preset_mode) value = "auto";
      else if (fanState.state === "off") value = "off";
      else if (fanState.state === "on") value = "speed";
      // The speed key shows the speed it runs at, or the last one shown;
      // a tap while it runs steps to the next (after the last, the first)
      if (value === "speed") this._speed = Math.min(speeds, Math.max(1, Math.round((fanState.attributes.percentage ?? 0) / step)));
      const speed = this._speed ?? 1;
      const nextSpeed = value === "speed" ? (speed % speeds) + 1 : speed;
      const disabled = fanState.state === "unavailable";
      const buttons = [{
        key: "off", label: "Off", text: "Off", icon: IF2_ICONS.off, color: "primary", pressed: value === "off", disabled,
        action: () => value !== "off" && hass.callService("fan", "turn_off", { entity_id: fan }),
      }];
      if (preset) {
        buttons.push({
          key: "auto", label: "Auto", text: "A", icon: IF2_ICONS.auto, color: "primary", pressed: value === "auto", disabled,
          action: () => value !== "auto" && hass.callService("fan", "set_preset_mode", { entity_id: fan, preset_mode: preset }),
        });
      }
      buttons.push({
        key: "speed", label: value === "speed" ? `Speed ${speed}. Tap for ${nextSpeed}` : `Speed ${speed}`,
        text: String(speed), alwaysText: true, icon: IF2_ICONS.speed, color: "primary", pressed: value === "speed", disabled,
        action: () => {
          this._speed = nextSpeed;
          hass.callService("fan", "set_percentage", { entity_id: fan, percentage: Math.min(100, nextSpeed * step) });
        },
      });
      // The keys chosen, in the order chosen (all by default)
      if (!Array.isArray(c.controls)) return buttons;
      return c.controls.map((key) => buttons.find((b) => b.key === key)).filter(Boolean);
    }
    const gears = sibling(hass, laser, "if2_gear_select");
    const gearState = gears ? hass.states[gears] : undefined;
    if (!gearState) return [];
    const all = gearState.attributes.options ?? [];
    const shown = Array.isArray(c.options) ? c.options.filter((o) => all.includes(o)) : all;
    return shown.map((value) => {
      const name = hass.formatEntityState?.(gearState, value) ?? value;
      return {
        key: value, label: name, text: name, icon: IF2_ICONS[String(value).toLowerCase()], color: "primary",
        pressed: gearState.state === value, disabled: gearState.state === "unavailable",
        action: () => value !== gearState.state && hass.callService("select", "select_option", { entity_id: gears, option: value }),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Feature: focus (F2 Ultra UV), in one half-width row: Autofocus, then down
// and up (0.1 mm a step) around the material thickness the laser is focused on,
// in a field: type a thickness and press Enter to focus there, as Studio's
// manual focus does. Each change moves the head (the laser refuses while it
// works; Home Assistant shows why). Unavailable while the laser is off, as
// Home Assistant's features are. With the inner engraving lens there is no
// focusing (the job sets the height, as in Studio), so the feature shows
// nothing.
// ---------------------------------------------------------------------------
const FOCUS_STEP = 0.1;

class XtoolFocus extends XtoolFeature {
  static display = "icons";
  static label = "Focus";

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = `
      /* Each button as wide as one of five in a row (as in Controls), so the
         field has the rest */
      .row .key { flex: none; width: calc((100% - 4 * var(--feature-button-spacing, 12px)) / 5); padding: 0; }
      .height {
        position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 2px;
        border-radius: var(--feature-border-radius, 12px); overflow: hidden; cursor: text;
        color: var(--xtool-text, var(--primary-text-color)); font-weight: var(--ha-font-weight-medium, 500);
      }
      .height::before { content: ""; position: absolute; inset: 0; background: var(--feature-color); opacity: .2; }
      .height:focus-within { outline: 2px solid var(--feature-color); outline-offset: 2px; }
      .height > * { position: relative; }
      .height input {
        width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; outline: none; background: transparent;
        font: inherit; color: inherit; text-align: center;
      }
      .height.disabled { opacity: .45; cursor: default; }`;
    this.shadowRoot.prepend(style);
    this._field = document.createElement("label");
    this._field.className = "height";
    this._field.innerHTML = `<input type="text" inputmode="decimal" enterkeyhint="done">`;
    this._input = this._field.querySelector("input");
    this._input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") this._input.blur();
      if (ev.key === "Escape") {
        this._input.value = this._shown ?? "";
        this._input.blur();
      }
    });
    this._input.addEventListener("change", () => {
      const typed = Number(this._input.value.trim().replace(",", "."));
      if (this._input.value.trim() !== "" && Number.isFinite(typed)) this._setHeight(Math.round(typed * 10) / 10);
      else this._input.value = this._shown ?? "";
    });
    this._input.addEventListener("click", (ev) => ev.stopPropagation());
  }

  static getStubConfig() {
    return { type: "custom:xtool-focus" };
  }

  get _height() {
    return sibling(this._hass, this._entityId, "focus_height");
  }

  /**
   * Whether focusing applies: with the inner engraving lens (or none) the
   * job sets the height from the material's size, as in Studio, which then
   * offers no manual focus.
   */
  get _surfaceLens() {
    const lens = sibling(this._hass, this._entityId, "engraving_lens");
    const state = lens ? this._hass.states[lens]?.state : undefined;
    return !["small", "none"].includes(state);
  }

  _buttons() {
    const hass = this._hass, id = this._entityId;
    const height = this._height, stateObj = height ? hass.states[height] : undefined;
    if (!height || !this._surfaceLens) return [];
    const value = Number(stateObj?.state);
    const usable = this._usable(height) && Number.isFinite(value);
    const { min = 0, max = 150 } = stateObj?.attributes ?? {};
    const step = FOCUS_STEP;
    const autofocus = sibling(hass, id, "autofocus");
    const status = statusOf(hass, id);
    // As in Studio: no Autofocus while the laser works, frames, focuses or is
    // off, or while Access control is on
    const busy = BUSY_PHASES.includes(phaseOf(status ? hass.states[status]?.state : undefined));
    return [
      ...(autofocus ? [{
        key: "autofocus", label: "Autofocus", icon: "mdi:image-filter-center-focus", color: "primary",
        disabled: !this._usable(autofocus) || busy || accessControlOn(hass, id),
        action: () => hass.callService("button", "press", { entity_id: autofocus }),
      }] : []),
      { key: "down", label: "Decrease", icon: "mdi:arrow-down", disabled: !usable || value <= min, action: () => this._setHeight(Math.round((value - step) * 10) / 10) },
      { key: "up", label: "Increase", icon: "mdi:arrow-up", disabled: !usable || value >= max, action: () => this._setHeight(Math.round((value + step) * 10) / 10) },
    ];
  }

  _render() {
    super._render();
    if (!this._hass || !this._config || !this._context) return;
    // In the number color, as Home Assistant's number features
    this.style.setProperty("--feature-color", NUMBER_ON);
    const height = this._height;
    // The inner engraving lens: no focusing, so nothing is shown
    this.style.display = height && !this._surfaceLens ? "none" : "";
    if (!height || !this._surfaceLens) {
      this._field.remove();
      return;
    }
    // The field goes between down and up
    const up = this._row.querySelector('[data-key="up"]');
    if (this._field.nextSibling !== up) this._row.insertBefore(this._field, up);
    const stateObj = this._hass.states[height];
    const value = Number(stateObj?.state);
    const usable = this._usable(height);
    this._shown = Number.isFinite(value) ? value.toFixed(1) : "";
    this._input.disabled = !usable;
    this._field.classList.toggle("disabled", !usable);
    this._input.setAttribute("aria-label", stateObj?.attributes.friendly_name ?? "Focus height");
    // Not while it is being typed in
    if (this.shadowRoot.activeElement !== this._input) this._input.value = this._shown;
  }

  _setHeight(value) {
    const height = this._height, stateObj = height ? this._hass.states[height] : undefined;
    if (!stateObj || !Number.isFinite(value) || value === Number(stateObj.state)) return;
    const { min = 0, max = 150 } = stateObj.attributes;
    this._hass.callService("number", "set_value", { entity_id: height, value: Math.min(max, Math.max(min, value)) });
  }
}

const FEATURES = {
  "xtool-job": XtoolJob,
  "xtool-peripherals": XtoolPeripherals,
  "xtool-fill-light": XtoolFillLight,
  "xtool-safety": XtoolSafety,
  "xtool-settings": XtoolSettings,
  "xtool-camera": XtoolCamera,
  "xtool-if2-fan": XtoolIf2Fan,
  "xtool-focus": XtoolFocus,
};
const FEATURE_TAGS = Object.keys(FEATURES);

// ---------------------------------------------------------------------------
// Feature editors (one element; the form follows the feature's type)
// ---------------------------------------------------------------------------
const controlOptions = (hass, entityId, list) =>
  list.filter((item) => sibling(hass, entityId, item.role)).map((item) => ({ value: item.role, label: item.label }));

const FEATURE_FORMS = {
  "custom:xtool-job": () => ({
    schema: [
      {
        name: "controls", label: "Buttons",
        helper: "In order. Start / Pause is one button: Pause while the job runs, Start (or Resume) otherwise.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: JOB_CONTROLS.map(([value, label]) => ({ value, label })) } },
      },
      displayField(),
      { name: "confirm_cancel", label: "Ask before cancelling a job", selector: { boolean: {} } },
    ],
    data: (c) => ({
      controls: Array.isArray(c.controls) ? c.controls : JOB_DEFAULT, display: displayOf(c, "both"), confirm_cancel: c.confirm_cancel !== false,
    }),
  }),
  "custom:xtool-peripherals": (hass, entityId) => ({
    schema: [
      { name: "controls", label: "Controls", selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, PERIPHERALS) } } },
      displayField(),
      { name: "animate_fan", label: "Animate fan", helper: "A fan's icon turns while it runs.", selector: { boolean: {} } },
    ],
    data: (c) => ({
      controls: c.controls ?? controlOptions(hass, entityId, PERIPHERALS).map((o) => o.value), display: displayOf(c),
      animate_fan: c.animate_fan !== false,
    }),
  }),
  "custom:xtool-safety": (hass, entityId) => ({
    schema: [
      {
        name: "controls", label: "Safety",
        helper: "Turning a check off always asks first. The safety key is only shown: a tap opens it.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, SAFETY) } },
      },
      displayField(),
    ],
    data: (c) => ({ controls: c.controls ?? controlOptions(hass, entityId, SAFETY).map((o) => o.value), display: displayOf(c) }),
  }),
  "custom:xtool-fill-light": (hass, entityId) => {
    const lights = dimmableLights(hass, entityId);
    const roles = lights.map((l) => l.role);
    return {
      schema: [{
        name: "lights", label: "Fill lights",
        helper: "Side by side, in order. Turning the lights on and off is in the peripherals feature.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: lights.map((l) => ({ value: l.role, label: l.label })) } },
      }],
      data: (c) => ({ lights: Array.isArray(c.lights) ? c.lights.filter((role) => roles.includes(role)) : roles }),
    };
  },
  "custom:xtool-settings": (hass, entityId) => ({
    schema: [
      { name: "controls", label: "Configuration", selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: controlOptions(hass, entityId, SETTINGS) } } },
      displayField(),
    ],
    data: (c) => ({ controls: c.controls ?? controlOptions(hass, entityId, SETTINGS).map((o) => o.value), display: displayOf(c) }),
  }),
  "custom:xtool-camera": (hass, entityId) => {
    const cameras = camerasOf(hass, entityId);
    const labels = cameras.map(([, label]) => label);
    const keyOf = (id) => hass?.entities?.[id]?.translation_key;
    const main = cameras.find(([id]) => keyOf(id) === "camera_main")?.[0];
    const deep = cameras.find(([id]) => keyOf(id) === "camera_deep")?.[0];
    const crops = main ? CROP_ROLES.filter((role) => cameraSetting(hass, main, role)) : [];
    const perspective = deep && cameraSetting(hass, deep, "perspective");
    return {
      schema: (c) => [
        { name: "camera", label: "Camera", selector: { select: { mode: "dropdown", options: labels } } },
        {
          name: "camera_view", label: "Camera view",
          helper: "As in Home Assistant's picture cards. Auto: snapshots, refreshed by Home Assistant. Live: the camera's stream.",
          selector: select(CAMERA_VIEWS),
        },
        { name: "show_switch", label: "Buttons to switch cameras", selector: { boolean: {} } },
        displayField("For the camera's buttons and the deep camera's perspective."),
        {
          name: "show_time", label: "Show the last updated time",
          helper: "Along the bottom of the picture, in the Auto view, in the card's Time format (under Content).",
          selector: { boolean: {} },
        },
        ...(crops.length === CROP_ROLES.length ? [{
          name: "crop", label: "Crop by tapping",
          helper: "Adds a Crop key for the main camera. Tap it, then tap two opposite corners on the picture to show only that part. The key stays on while the crop is in effect; tap it again to show the whole 200 x 200 mm area.",
          selector: { boolean: {} },
        }] : []),
        ...(perspective ? [{
          name: "show_perspective", label: "Deep camera perspective",
          helper: "A key beside the camera buttons for the deep camera: it shows Uncorrected, Rotated or Straightened, and a tap steps to the next.",
          selector: { boolean: {} },
        }] : []),
      ],
      data: (c) => ({
        camera: labels.includes(c.camera) ? c.camera : labels[0], camera_view: c.camera_view === "live" ? "live" : "auto",
        show_switch: c.show_switch !== false, display: displayOf(c, "names"), show_time: !!c.show_time,
        ...(crops.length === CROP_ROLES.length ? { crop: c.crop !== false } : {}),
        ...(perspective ? { show_perspective: c.show_perspective !== false } : {}),
      }),
    };
  },
  "custom:xtool-if2-fan": (hass, entityId) => {
    const fan = sibling(hass, entityId, "if2_fan_entity");
    const gears = sibling(hass, entityId, "if2_gear_select");
    const options = gears ? hass.states[gears]?.attributes.options ?? [] : [];
    return {
      // One control: Off, Auto and the speed (IF2 2.0), or the gears (IF2)
      schema: (c) => [
        ...(fan ? [{
          name: "controls", label: "Keys",
          helper: "In order. The speed key shows the speed, and a tap steps to the next.",
          selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: IF2_KEYS.map(([value, label]) => ({ value, label })) } },
        }] : []),
        displayField(),
        ...(!fan && gears ? [
          { name: "customize_options", label: "Customize choices", selector: { boolean: {} } },
          ...(Array.isArray(c.options) ? [{
            name: "options", label: "Choices",
            helper: "Which of the fan's choices show, and in what order.",
            selector: { select: { multiple: true, reorder: true, options } },
          }] : []),
        ] : []),
      ],
      data: (c) => ({
        ...(fan ? { controls: Array.isArray(c.controls) ? c.controls : IF2_KEYS.map(([value]) => value) } : {}),
        display: displayOf(c, "names"),
        ...(!fan && gears ? { customize_options: Array.isArray(c.options), ...(Array.isArray(c.options) ? { options: c.options } : {}) } : {}),
      }),
      // Turning Customize on starts with every choice; off removes the list
      save: (v) => {
        const { customize_options: customOptions, ...c } = v;
        if (!fan && gears && customOptions) c.options = Array.isArray(c.options) ? c.options : options;
        else delete c.options;
        return c;
      },
    };
  },
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
        const form = FEATURE_FORMS[this._config.type]?.(this._hass, this._context?.entity_id);
        const value = form?.save ? form.save(ev.detail.value) : ev.detail.value;
        const config = { type: this._config.type, ...value };
        this._config = config;
        fire(this, "config-changed", { config });
        // Some options show only for some choices
        this._render();
      });
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = typeof form.schema === "function" ? form.schema(this._config) : form.schema;
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

/**
 * The control Home Assistant draws for one of its own features shown inside
 * this card's (the fill light's slider, the IF2 fan's buttons): the feature
 * element inside hui-card-feature, and the control inside that.
 */
function haControlOf(slide) {
  let el = slide.querySelector("hui-card-feature");
  for (let depth = 0; depth < 2 && el?.shadowRoot; depth++) {
    const next = [...el.shadowRoot.children].find((c) => c.localName !== "style");
    if (!next) break;
    el = next;
  }
  return el ?? slide;
}

/**
 * A control's corner radius: the theme's feature radius (Home Assistant's
 * controls draw their corners with it inside their own shadow roots), or the
 * element's own, no more than half its height.
 */
function featureRadius(el, height) {
  const themed = parseFloat(getComputedStyle(el).getPropertyValue("--feature-border-radius"));
  const own = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  const radius = Number.isFinite(themed) ? themed : Number.isFinite(own) ? own : 0;
  return Math.min(radius, height / 2);
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
const DEFAULT_PATTERN = 4242;

/**
 * The window's glass: a sheen along the top and two to four reflections
 * falling across it at an angle, their places from the pattern (Randomize
 * reflections in the editor picks a new pattern). Stronger on the
 * champagne's orange glass than on the graphite's dark glass.
 */
function glassReflections(tone, pattern) {
  const r = seeded(pattern);
  const k = tone === "light" ? 1 : .5;
  const white = (a) => `rgba(255, 255, 255, ${(a * k).toFixed(3)})`;
  const angle = Math.round((r() < .5 ? 100 : 30) + r() * 50);
  const layers = [`linear-gradient(to bottom, ${white(.3)} 0%, ${white(.1)} 14%, transparent 42%)`];
  const count = 2 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const at = 4 + r() * 84, width = 3 + r() * 16, peak = .14 + r() * .26;
    const mid = (at + width / 2).toFixed(1), end = (at + width).toFixed(1), start = at.toFixed(1);
    // The first reflection has a sharp leading edge, like light off a pane's edge
    layers.push(i === 0
      ? `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${start}%, ${white(peak * .25)} ${end}%, transparent ${end}%)`
      : `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${mid}%, transparent ${end}%)`);
  }
  return layers.join(", ");
}
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
const OWN_KEYS = ["style", "features_style", "pattern", "badges", "status_light", "progress", "collapsible", "expanded", "auto_collapse"];

/** The tile card's own options (as its editor shows them). */
function tileConfig(config) {
  const tile = { ...config, type: "tile", show_entity_picture: true };
  for (const key of OWN_KEYS) delete tile[key];
  return tile;
}

/**
 * The tile card inside the card: with Collapsible, a tap on the card shows
 * or hides the features instead of its Tap behavior, and the features below
 * the title are left out while they are hidden.
 */
function innerTileConfig(config, open) {
  const tile = tileConfig(config);
  if (config.collapsible) {
    tile.tap_action = { action: "fire-dom-event", xtool_card: "toggle" };
    // Collapsed, the card keeps what a tile card shows in its title row:
    // with features position "inline", the first feature, beside the title
    if (!open) tile.features = config.features_position === "inline" ? (config.features ?? []).slice(0, 1) : [];
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
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45), inset 0 0 0 1px rgba(90, 30, 0, .35), inset 0 3px 8px rgba(90, 30, 0, .3);
        }
        .graphite #body { background: linear-gradient(170deg, #3a3f45 0%, #2d3136 40%, #24272b 100%); }
        .graphite #window {
          background: radial-gradient(120% 90% at 50% 120%, rgba(214, 140, 60, .28) 0%, rgba(214, 140, 60, 0) 60%),
            linear-gradient(175deg, #1d2024 0%, #141619 60%, #0f1113 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 0 0 1px rgba(255, 255, 255, .06), inset 0 3px 8px rgba(0, 0, 0, .6);
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
    this._statesProvider = new StatesProvider(this._frame);
    this._over = this.shadowRoot.querySelector(".clip.over");
    this._window = this.shadowRoot.getElementById("window");
    this._stripe = this.shadowRoot.getElementById("stripe");
    this._areas = this.shadowRoot.getElementById("areas");
    this._edge = this.shadowRoot.getElementById("edge");
    this._pct = this.shadowRoot.getElementById("pct");
    this._badge = this.shadowRoot.querySelector(".badge");
    this._resize = new ResizeObserver(() => this._layout());
    // A tap on the card shows or hides the features (see innerTileConfig),
    // except a tap between the features, which reaches the card behind them
    this._frame.addEventListener("pointerdown", (ev) => {
      this._tapAt = { x: ev.clientX, y: ev.clientY };
    }, true);
    this._frame.addEventListener("ll-custom", (ev) => {
      if (ev.detail?.xtool_card !== "toggle") return;
      ev.stopPropagation();
      const at = this._tapAt;
      this._tapAt = undefined;
      if (this._open && at && this._amongFeatures(at)) return;
      this._autoCollapsed = false;
      this._setOpen(!this._open);
    });
    this._resize.observe(this._frame);
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TYPE);
  }

  /** True when a point is in one of the tile card's feature areas. */
  _amongFeatures({ x, y }) {
    return [...(this._tile?.shadowRoot?.querySelectorAll("hui-card-features") ?? [])].some((features) => {
      const box = features.getBoundingClientRect();
      return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
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
    this._open = !config.collapsible ? true : this._storedOpen() ?? config.expanded !== false;
    this._autoCollapsed = false;
    this._wasOff = undefined;
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
    if (this._hass) this._setTileHass(this._hass);
    if (this._preview !== undefined) this._tile.preview = this._preview;
    if (this._layoutValue !== undefined) this._tile.layout = this._layoutValue;
    this._frame.insertBefore(this._tile, this._over);
    this._layout();
  }

  /** The tile card gets the changed hass, and so does the states context inside the card. */
  _setTileHass(hass) {
    const inner = this._innerHass(hass);
    this._statesProvider.states = inner.states;
    this._tile.hass = inner;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._job = this._jobState(hass);
    this._frame.classList.toggle("off", this._job.phase === "off");
    this._followPower(this._job.phase === "off");
    if (this._tile) this._setTileHass(hass);
    this._updateBadge();
    this._updateLight();
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
    // A camera picture is about five rows tall; every other feature is one
    const features = this._config?.features ?? [];
    const rows = features.reduce((sum, f) => sum + (f?.type === "custom:xtool-camera" ? 5 : 1), 0);
    return 1 + (this._open === false ? 0 : rows);
  }

  // The height follows the content: features such as the camera are taller
  // than the rows the tile card allows for, and would run off the card
  getGridOptions() {
    const { columns, min_columns, max_columns } = this._tile?.getGridOptions?.() ?? {};
    return {
      columns: columns ?? 6, rows: "auto",
      ...(min_columns !== undefined ? { min_columns } : {}),
      ...(max_columns !== undefined ? { max_columns } : {}),
    };
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

  /**
   * With Collapse when off, the card collapses when the machine turns off
   * (or is off when the card loads) and opens again when it turns back on,
   * unless the card was tapped in between. The browser keeps the choice
   * made by a tap, not this one.
   */
  _followPower(off) {
    const was = this._wasOff;
    this._wasOff = off;
    if (!this._config.collapsible || this._config.auto_collapse === false || off === was) return;
    if (off && this._open) {
      this._autoCollapsed = true;
      this._setOpen(false, false);
    } else if (!off && this._autoCollapsed) {
      this._autoCollapsed = false;
      this._setOpen(true, false);
    }
  }

  _setOpen(open, remember = true) {
    this._open = open;
    try {
      if (remember) window.localStorage.setItem(this._storageKey, open ? "1" : "0");
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
    const extra = sensorAttributes(this._hass, this._config.entity);
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
        if (this._tile && this._hass) this._setTileHass(this._hass);
      }, 1000);
    } else if (!run && this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /**
   * The badge the card shows, or undefined: the first of the chosen badges,
   * in the order chosen (the order in the editor is the priority), that applies.
   */
  _badgeNow() {
    const hass = this._hass, id = this._config.entity;
    const chosenBadges = Array.isArray(this._config.badges) ? this._config.badges : DEFAULT_BADGES;
    const stateOf = (role) => {
      const entityId = sibling(hass, id, role);
      return entityId ? hass.states[entityId]?.state : undefined;
    };
    const phase = this._job.phase;
    const status = statusOf(hass, id);
    const error = "var(--error-color, #db4437)", warning = "var(--warning-color, #ffa600)";
    // Each option: what applies now, as [applies, symbol, color, label], most urgent first
    const options = {
      alarm: [
        [phase === "fire", "fire", error, "Fire warning"],
        [phase === "overheat", "alarm", error, "Laser overheat"],
        [stateOf("alarm") === "on" || phase === "error", "alarm", error, "Alarm"],
      ],
      connection: [[!status || hass.states[status]?.state === "unavailable", "connection", "#616161", "Not connected"]],
      safety_key: [[stateOf("safety_key") === "off", "safety_key", warning, "Safety key removed"]],
      lid: [[stateOf("cover_open") === "on", "lid", warning, "Lid open"]],
      safety_off: [[["flame_alarm", "enclosure_stop", "moved_stop"].some((role) => stateOf(role) === "off"),
        "safety_off", warning, "A safety check is off"]],
      firmware: [[stateOf("firmware") === "on", "firmware", "var(--info-color, #039be5)", "Firmware update available"]],
    };
    for (const option of chosenBadges) {
      const hit = (options[option] ?? []).find(([applies]) => applies);
      if (hit) return { path: BADGE_PATHS[hit[1]], color: hit[2], label: hit[3] };
    }
    return undefined;
  }

  /** The machine's status light, as a ring around the state picture. */
  _updateLight() {
    const tile = this._tile, root = tile?.shadowRoot;
    if (!root) return;
    if (!XtoolCard._lightSheet) {
      XtoolCard._lightSheet = new CSSStyleSheet();
      XtoolCard._lightSheet.replaceSync(LIGHT_SHEET);
    }
    try {
      if (!root.adoptedStyleSheets.includes(XtoolCard._lightSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, XtoolCard._lightSheet];
    } catch (err) {
      console.warn("xTool card: could not draw the status light", err);
      return;
    }
    const status = this._hass ? statusOf(this._hass, this._config.entity) : undefined;
    const light = status && this._config.status_light !== false
      ? lightOf(this._hass, this._config.entity, this._hass.states[status]?.state) : undefined;
    if (!light) {
      tile.removeAttribute("xtool-light");
      return;
    }
    tile.style.setProperty("--xtool-light", light[0]);
    tile.setAttribute("xtool-light", light[1]);
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
    if (tone) {
      const pattern = Number.isFinite(this._config.pattern) ? this._config.pattern : DEFAULT_PATTERN;
      this._window.style.setProperty("--xtool-gloss", glassReflections(tone, pattern));
    }
    if (this._tile) {
      this._tile.classList.toggle("dark", tone === "dark");
      this._tile.classList.toggle("light", tone === "light");
      this._tile.classList.toggle("champagne", style === "champagne");
      this._tile.classList.toggle("solid", !!tone && (this._config.features_style ?? "match") !== "match");
      this._styleWindowText();
    }
    this._removeDividers();
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
    // The window's edge is 4 px in; the controls in the header have 10 px
    // of the tile card's padding, less 3 px for a Console channel around them
    const margin = 4;
    let bottom = H - margin;
    const root = this._tile?.shadowRoot;
    const info = root && findDeep(root, "ha-tile-info");
    const infoBox = info && this._box(info);
    if (infoBox) {
      const groups = findAllDeep(root, "hui-card-features").map((el) => this._box(el)).filter(Boolean);
      const infoBottom = infoBox.y + infoBox.h;
      const below = groups.filter((b) => b.y >= infoBottom - 1);
      // The window ends halfway into the gap above the first features below
      // the title. (The box of the group beside the title is taller than its
      // controls, so it does not set the window's height.)
      if (below.length) bottom = Math.min(...below.map((b) => b.y)) - 6;
    }
    Object.assign(this._window.style, {
      left: `${margin}px`, top: `${margin}px`, width: `${W - 2 * margin}px`, height: `${Math.max(0, bottom - margin)}px`,
    });
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
      // The feature this card's fill light and IF2 fan show is measured with them
      if (FEATURE_TAGS.includes(wrap.getRootNode()?.host?.localName)) continue;
      this._watchAdded(wrap.shadowRoot);
      const inner = wrap.shadowRoot ?? wrap;
      const ours = findDeep(inner, FEATURE_TAGS.join(", "));
      const keys = ours ? [...(ours.shadowRoot?.querySelectorAll(".key, .shot, .slide") ?? [])] : [];
      const element = [...inner.children].find((c) => c.tagName !== "STYLE");
      for (const key of keys.length ? keys : [element]) {
        // A Home Assistant feature inside one of this card's: its own control
        const el = key?.classList?.contains("slide") ? haControlOf(key) : key;
        const b = el && this._box(el);
        if (!b) continue;
        areas.push({ ...b, radius: featureRadius(el, b.h) });
      }
    }
    this._watchAdded(root);
    return areas;
  }

  // Console: this card's buttons become keys, and Home Assistant's toggle a slide
  /**
   * Home Assistant draws a vertical divider before each feature in a second
   * column. Taken out here, from inside the tile card's feature groups; if
   * Home Assistant renames that part, the dividers simply stay.
   */
  // No dividers between features, and a steady height beside the title
  _removeDividers() {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    if (!XtoolCard._plainSheet) {
      XtoolCard._plainSheet = new CSSStyleSheet();
      XtoolCard._plainSheet.replaceSync(`
        .divided { border-inline-start: none !important; margin-inline-start: 0 !important; padding-inline-start: 0 !important; }
        /* The feature beside the title keeps the height it has when the card
           is collapsed; the tile card would let it fill a taller row once
           features show below it */
        :host([slot="features-inline"]) { --feature-height: var(--ha-space-9, 36px) !important; }`);
    }
    try {
      for (const group of findAllDeep(root, "hui-card-features")) {
        const shadow = group.shadowRoot;
        if (shadow && !shadow.adoptedStyleSheets.includes(XtoolCard._plainSheet)) {
          shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, XtoolCard._plainSheet];
        }
      }
    } catch (err) {
      console.warn("xTool card: could not remove the feature dividers", err);
    }
  }

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
      this._removeDividers();
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
// The laser is chosen above the tile card's editor (as a device), so its entity picker is left out
const HIDDEN_TILE_OPTIONS = ["entity", "icon", "show_entity_picture"];

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

/** A laser device's Status sensor. */
function laserStatus(hass, device) {
  return Object.values(hass?.entities ?? {})
    .find((e) => e.device_id === device && e.platform === DOMAIN && e.translation_key === "status")?.entity_id;
}

/** Every xTool laser's status sensor. */
function xtoolStatusSensors(hass) {
  return Object.values(hass?.entities ?? {})
    .filter((e) => e.platform === DOMAIN && e.translation_key === "status")
    .map((e) => e.entity_id)
    .sort();
}

/** hass with the card's entity carrying example job attributes and its sensors, so State content can offer them. */
function withJobAttributes(hass, entityId) {
  const stateObj = hass?.states[entityId];
  if (!stateObj) return hass;
  const attributes = { ...JOB_ATTRIBUTES, ...sensorAttributes(hass, entityId, true), ...stateObj.attributes };
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
        #laser { display: block; margin-bottom: 24px; }
        ha-expansion-panel {
          display: block; margin-top: 24px;
          --expansion-panel-content-padding: 0;
          border-radius: var(--ha-border-radius-md, 8px);
          --ha-card-border-radius: var(--ha-border-radius-md, 8px);
        }
        ha-expansion-panel > [slot="header"] { margin: 0; font-size: inherit; font-weight: inherit; }
        .content { padding: 12px; display: grid; gap: 16px; }
        .row { display: flex; align-items: center; gap: 12px; }
      </style>
      <ha-form id="laser"></ha-form>
      <div id="tile"></div>
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">xTool</div>
        <div class="content">
          <ha-form id="style"></ha-form>
          <div class="row" id="row"><ha-button id="randomize">Randomize reflections</ha-button></div>
          <ha-form id="form"></ha-form>
        </div>
      </ha-expansion-panel>`;
    this._statesProvider = new StatesProvider(this.shadowRoot);
    this._laserForm = this.shadowRoot.getElementById("laser");
    this._laserForm.computeLabel = (s) => s.label;
    this._laserForm.computeHelper = (s) => s.helper;
    this._laserForm.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const status = laserStatus(this._hass, ev.detail.value?.device);
      if (status && status !== this._config.entity) this._update({ entity: status });
    });
    this._styleForm = this.shadowRoot.getElementById("style");
    this._form = this.shadowRoot.getElementById("form");
    for (const form of [this._styleForm, this._form]) {
      form.computeLabel = (s) => s.label ?? s.title ?? s.name;
      form.computeHelper = (s) => s.helper;
      form.addEventListener("value-changed", (ev) => this._changed(ev));
    }
    this.shadowRoot.getElementById("randomize").addEventListener("click", () => {
      this._update({ pattern: 1 + Math.floor(Math.random() * 99999) });
    });
  }

  // Either form changed: both forms' values make the card's options
  _changed(ev) {
    ev.stopPropagation();
    const v = { ...this._styleForm.data, ...this._form.data, ...ev.detail.value };
    this._update({
      style: v.style ?? "none",
      features_style: v.features_style,
      badges: v.badges ?? [],
      status_light: v.status_light !== false,
      progress: { ...PROGRESS_DEFAULTS, ...(v.progress ?? {}) },
      collapsible: !!v.collapsible,
      expanded: v.expanded !== false,
      auto_collapse: v.auto_collapse !== false,
    });
  }

  set hass(hass) {
    this._hass = hass;
    this._laserForm.hass = hass;
    this._styleForm.hass = hass;
    this._form.hass = hass;
    this._setTileEditorHass(this._config?.entity);
  }

  /** The tile editor, and the states context inside this editor, get the laser's entity with the card's attributes. */
  _setTileEditorHass(entity) {
    if (!this._hass) return;
    const hass = withJobAttributes(this._hass, entity);
    this._statesProvider.states = hass.states;
    if (this._tileEditor) this._tileEditor.hass = hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    if (this._tileEditor) this._tileEditor.lovelace = lovelace;
  }

  setConfig(config) {
    this._config = explicit(config);
    this._render();
    this._setTileEditorHass(this._config.entity);
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
          if (ev.detail.config.entity) this._setTileEditorHass(ev.detail.config.entity);
        });
        editor.xtoolEntities = xtoolStatusSensors(this._hass);
        if (this._lovelace) editor.lovelace = this._lovelace;
        this._tileEditor = editor;
        this._setTileEditorHass(this._config.entity);
        this.shadowRoot.getElementById("tile").replaceWith(editor);
      })();
      await this._loading;
    }
    this._tileEditor.setConfig(tileConfig(this._config));
  }

  _render() {
    const c = this._config;
    const styled = c.style !== "none";
    this._laserForm.schema = [{
      name: "device", label: "Laser", required: true,
      selector: { device: { integration: DOMAIN, entity: [{ integration: DOMAIN, domain: "sensor", device_class: "enum" }] } },
    }];
    this._laserForm.data = { device: this._hass?.entities?.[c.entity]?.device_id };
    this._styleForm.schema = [{
      name: "style", label: "xTool style",
      helper: "The machine's window behind the title and its body behind the rest.",
      selector: select(STYLES),
    }];
    this._styleForm.data = { style: c.style };
    this.shadowRoot.getElementById("row").style.display = styled ? "" : "none";
    this._form.schema = [
      ...(styled ? [{
        name: "features_style", label: "Features style",
        helper: "Match style: the controls sit on the body. Flat: on a patch of the body's base color. Console: in a channel pressed into the body.",
        selector: select(FEATURES_STYLES),
      }] : []),
      {
        name: "collapsible", label: "Collapsible",
        helper: "A tap on the card shows or hides the features, instead of its Tap behavior (under Interactions). Icon tap behavior still works.",
        selector: { boolean: {} },
      },
      ...(c.collapsible ? [
        { name: "expanded", label: "Expanded at load", selector: { boolean: {} } },
        {
          name: "auto_collapse", label: "Collapse when off",
          helper: "Collapses when the machine turns off, and expands again when it turns on.",
          selector: { boolean: {} },
        },
      ] : []),
      {
        name: "badges", label: "Badges (in priority order)",
        helper: "Listed in priority order: the first one that applies shows on the picture. Drag to change the order.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: BADGES.map(([value, label]) => ({ value, label })) } },
      },
      {
        name: "status_light", label: "Status light",
        helper: "A thin ring around the picture in the color and pattern of the machine's own status light.",
        selector: { boolean: {} },
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
      features_style: c.features_style ?? "match",
      badges: Array.isArray(c.badges) ? c.badges : DEFAULT_BADGES,
      status_light: c.status_light !== false,
      progress: progressOptions(c),
      collapsible: !!c.collapsible,
      expanded: c.expanded !== false,
      auto_collapse: c.auto_collapse !== false,
    };
  }

  _update(changes) {
    this._config = explicit({ ...this._config, ...changes });
    this._render();
    if ("entity" in changes) this._setTileEditorConfig();
    this._fire();
  }

  _fire() {
    fire(this, "config-changed", { config: this._config });
  }
}

/**
 * The configuration as the editor saves it: the style written out, and the
 * features style and the reflections' pattern only for a style that has them.
 */
function explicit(config) {
  const c = { ...config };
  c.style = STYLES.some(([id]) => id === c.style) ? c.style : "none";
  if (c.style === "none") {
    delete c.features_style;
    delete c.pattern;
  } else {
    c.features_style = FEATURES_STYLES.some(([id]) => id === c.features_style) ? c.features_style : "match";
    c.pattern = Number.isFinite(c.pattern) ? c.pattern : DEFAULT_PATTERN;
  }
  c.status_light = c.status_light !== false;
  // Expanded at load and Collapse when off matter only for a collapsible card
  if (c.collapsible) {
    c.expanded = c.expanded !== false;
    c.auto_collapse = c.auto_collapse !== false;
  } else {
    delete c.collapsible;
    delete c.expanded;
    delete c.auto_collapse;
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
    { type: "xtool-peripherals", name: "xTool controls", isSupported: has(PERIPHERALS.map((p) => p.role)), configurable: true },
    {
      type: "xtool-fill-light", name: "xTool fill light brightness",
      isSupported: (hass, context) => isXtool(hass, context?.entity_id) && dimmableLights(hass, context.entity_id).length > 0,
      configurable: true,
    },
    { type: "xtool-safety", name: "xTool safety", isSupported: has(SAFETY.map((s) => s.role)), configurable: true },
    { type: "xtool-settings", name: "xTool configuration", isSupported: has(SETTINGS.map((s) => s.role)), configurable: true },
    {
      type: "xtool-camera", name: "xTool camera",
      isSupported: (hass, context) => isXtool(hass, context?.entity_id) && camerasOf(hass, context.entity_id).length > 0, configurable: true,
    },
    {
      type: "xtool-if2-fan", name: "xTool SafetyPro IF2 fan",
      isSupported: (hass, context) => isXtool(hass, context?.entity_id) && !!if2Control(hass, context.entity_id), configurable: true,
    },
    { type: "xtool-focus", name: "xTool focus", isSupported: has(["focus_height"]) },
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
