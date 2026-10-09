/**
 * Stand-ins for the Home Assistant frontend parts the xTool card uses, for
 * testing the card in a plain browser page.
 *
 * They use Home Assistant's element names and structure. The hass object
 * holds two lasers as the integration registers them: an F2 Ultra UV (WS-V2,
 * no progress sensor) with a SafetyPro IF2 2.0 on an accessory device, and
 * a P2 with a progress sensor.
 */

// [entity_id, translation_key, state, attributes]
const F2 = [
  ["sensor.f2_status", "status", "idle"],
  ["button.f2_pause", "pause_job", "unknown"],
  ["button.f2_resume", "resume_job", "unknown"],
  ["button.f2_cancel", "cancel_job", "unknown"],
  ["switch.f2_power", "power_switch", "on"],
  ["switch.f2_exhaust", "smoking_fan", "on"],
  ["binary_sensor.f2_exhaust_running", "smoking_fan_running", "on"],
  ["light.f2_fill_front", "fill_light_front", "on", { supported_color_modes: ["brightness"], brightness: 128 }],
  ["light.f2_fill_back", "fill_light_back", "off", { supported_color_modes: ["brightness"] }],
  ["switch.f2_red_dot", "ir_led", "off"],
  ["switch.f2_flame", "flame_alarm_v2", "on"],
  ["switch.f2_gap", "gap_check", "on"],
  ["switch.f2_moved", "stops_when_moved", "on"],
  ["switch.f2_auto_mode", "md_mode", "off"],
  ["switch.f2_beep", "beep_enable", "on"],
  ["switch.f2_sleep", "device_sleep", "off"],
  ["binary_sensor.f2_alarm", "alarm", "off"],
  ["binary_sensor.f2_safety_key", "machine_lock", "on"],
  ["sensor.f2_task_time", "task_time", "1132"],
  ["camera.f2_main", "camera_main", "idle", { entity_picture: "/api/camera_proxy/camera.f2_main?token=a" }],
  ["camera.f2_deep", "camera_deep", "idle", { entity_picture: "/api/camera_proxy/camera.f2_deep?token=b" }],
  ["update.f2_firmware", "firmware", "off"],
];
const IF2 = [
  ["select.if2_fan", "accessory_ductfanv3_mode_speed", "Auto Quiet", { options: ["Auto Regular", "Auto Quiet", "Off", "1", "2", "3", "4"] }],
  ["switch.if2_buzzer", "accessory_ductfanv3_buzzer", "off"],
  ["sensor.if2_speed", "accessory_ductfanv3_current_speed", "60"],
];
const P2 = [
  ["sensor.p2_status", "status", "idle"],
  ["sensor.p2_progress", "task_progress", "42"],
  ["button.p2_pause", "pause_job", "unknown"],
  ["button.p2_resume", "resume_job", "unknown"],
  ["button.p2_cancel", "cancel_job", "unknown"],
  ["switch.p2_exhaust", "smoking_fan", "off"],
  ["binary_sensor.p2_cover", "cover_open", "off"],
  ["switch.p2_red_dot", "ir_led_global", "off"],
];

/**
 * A hass object. changes: { entity_id: state or { state, attributes } }.
 * Like Home Assistant's, the controls carry it and it refers back to itself.
 */
window.makeHass = (changes = {}) => {
  const hass = {
    states: {},
    entities: {},
    devices: {
      dev_f2: { id: "dev_f2", model: "xTool F2 Ultra UV", via_device_id: null },
      dev_if2: { id: "dev_if2", model: "xTool SafetyPro IF2 2.0", via_device_id: "dev_f2" },
      dev_p2: { id: "dev_p2", model: "xTool P2", via_device_id: null },
    },
    calls: [],
    callService(domain, service, data) {
      hass.calls.push({ domain, service, data });
      return Promise.resolve();
    },
  };
  const started = new Date(Date.now() - 728000).toISOString();  // 12:08 ago
  for (const [device, list] of [["dev_f2", F2], ["dev_if2", IF2], ["dev_p2", P2]]) {
    for (const [entity_id, translation_key, state, attributes = {}] of list) {
      hass.entities[entity_id] = { entity_id, device_id: device, platform: "xtool", translation_key };
      hass.states[entity_id] = { entity_id, state, attributes: { friendly_name: entity_id, ...attributes }, last_changed: started };
    }
  }
  for (const [entityId, change] of Object.entries(changes)) {
    const next = typeof change === "string" ? { state: change } : change;
    hass.states[entityId] = { ...hass.states[entityId], ...next, attributes: { ...hass.states[entityId].attributes, ...(next.attributes ?? {}) } };
  }
  hass.connection = { hass };
  return hass;
};

// Home Assistant's named theme colors, which the features' buttons use
document.documentElement.style.cssText = [
  "--primary-color: #03a9f4", "--red-color: #f44336", "--green-color: #4caf50", "--amber-color: #ffc107",
  "--blue-color: #2196f3", "--cyan-color: #00bcd4", "--indigo-color: #3f51b5", "--teal-color: #009688",
].join(";");

// ha-icon: shows its icon name
customElements.define("ha-icon", class extends HTMLElement {
  connectedCallback() {
    // Only its own size: like Home Assistant's, it keeps what the card sets (such as --spin)
    Object.assign(this.style, { display: "inline-block", width: "22px", height: "22px" });
  }
});

// ha-control-switch: Home Assistant's toggle
customElements.define("ha-control-switch", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; height: var(--feature-height, 42px); }
      .switch { position: relative; height: 100%; border-radius: var(--feature-border-radius, 12px); padding: var(--control-switch-padding, 4px); }
      .switch .background { position: absolute; inset: 0; border-radius: inherit; background: #888; opacity: .2; }
      .switch .button { width: 50%; height: 100%; border-radius: 8px; background: #888; }
    </style><div class="switch"><div class="background"></div><div class="button"><ha-svg-icon></ha-svg-icon></div></div>`;
  }
});

// hui-card-feature: one feature. A custom feature is created from its type,
// as Home Assistant does, and given hass, the context and its configuration
customElements.define("hui-card-feature", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set setup({ config, hass, entityId }) {
    if (config.type === "toggle") {
      this.shadowRoot.innerHTML = "<ha-control-switch></ha-control-switch>";
      return;
    }
    const element = document.createElement(config.type.replace("custom:", ""));
    element.setConfig(config);
    element.hass = hass;
    element.context = { entity_id: entityId };
    this.element = element;
    this.shadowRoot.replaceChildren(element);
  }

  set hass(hass) {
    if (this.element) this.element.hass = hass;
  }
});

// hui-card-features: a group of features
customElements.define("hui-card-features", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: flex; flex-direction: column; gap: 12px; width: 100%; --feature-height: 42px; --feature-border-radius: 12px; }
    </style>`;
  }

  set setup({ features, hass, entityId }) {
    this.items = features.map((config) => {
      const item = document.createElement("hui-card-feature");
      item.setup = { config, hass, entityId };
      return item;
    });
    this.shadowRoot.append(...this.items);
  }

  set hass(hass) {
    for (const item of this.items ?? []) item.hass = hass;
  }
});

// hui-tile-card: the tile card, with the options the xTool card relies on
customElements.define("hui-tile-card", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.updateComplete = Promise.resolve();
  }

  static async getConfigElement() {
    return document.createElement("hui-tile-card-editor");
  }

  setConfig(config) {
    this.config = config;
    this.built = false;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  get hass() {
    return this._hass;
  }

  render() {
    if (!this.config || !this._hass) return;
    const stateObj = this._hass.states[this.config.entity];
    const picture = this.config.show_entity_picture ? stateObj.attributes.entity_picture : null;
    if (!this.built) {
      this.built = true;
      this.shadowRoot.innerHTML = `<style>
        ha-card { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 10px; gap: 12px;
          background: var(--ha-card-background, var(--card-background-color, #222));
          border: 1px solid var(--ha-card-border-color, #444); border-radius: var(--ha-card-border-radius, 12px); }
        .top { display: flex; align-items: center; gap: 10px; }
        ha-tile-icon { display: block; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex: none; }
        img { width: 36px; height: 36px; display: block; }
        ha-tile-info { flex: 1; color: var(--primary-text-color, #fff); }
      </style><ha-card><div class="top"><ha-tile-icon></ha-tile-icon><ha-tile-info></ha-tile-info></div></ha-card>`;
      const features = this.config.features ?? [];
      if (features.length) {
        this.group = document.createElement("hui-card-features");
        this.group.setup = { features, hass: this._hass, entityId: this.config.entity };
        this.shadowRoot.querySelector("ha-card").append(this.group);
      }
    }
    this.shadowRoot.querySelector("ha-tile-icon").innerHTML = picture ? `<img src="${picture}">` : "icon";
    // The state content: the state and the attributes chosen
    const content = [].concat(this.config.state_content ?? ["state"]);
    this.shadowRoot.querySelector("ha-tile-info").textContent =
      content.map((name) => (name === "state" ? stateObj.state : stateObj.attributes[name])).filter(Boolean).join(" · ");
    if (this.group) this.group.hass = this._hass;
  }

  getGridOptions() {
    return { columns: 6, rows: 1 + (this.config?.features?.length ?? 0) };
  }
});

// hui-tile-card-editor: the tile card's editor, with its form layout in _schema
customElements.define("hui-tile-card-editor", class extends HTMLElement {
  constructor() {
    super();
    this._schema = () => [
      { name: "entity", selector: { entity: {} } },
      {
        name: "content", type: "expandable", flatten: true, schema: [
          { name: "name", selector: { entity_name: {} } },
          { name: "", type: "grid", schema: [{ name: "icon" }, { name: "color" }, { name: "show_entity_picture" }, { name: "hide_state" }] },
        ],
      },
    ];
  }

  // Like Home Assistant's, it refuses options it does not know
  setConfig(config) {
    const known = ["type", "view_layout", "layout_options", "grid_options", "visibility", "entity", "name", "icon", "color",
      "show_entity_picture", "hide_state", "state_content", "vertical", "tap_action", "hold_action", "double_tap_action",
      "icon_tap_action", "icon_hold_action", "icon_double_tap_action", "features", "features_position", "time_format"];
    const unknown = Object.keys(config).find((key) => !known.includes(key));
    if (unknown) throw new Error(`At path: ${unknown} -- Expected a value of type \`never\``);
    this.config = config;
    this.schemaNames = JSON.stringify(this._schema());
  }
});

// ha-form and ha-expansion-panel: hold what they are given
customElements.define("ha-form", class extends HTMLElement {});
customElements.define("ha-expansion-panel", class extends HTMLElement {});

window.loadCardHelpers = async () => ({
  createCardElement: (config) => document.createElement(config.type === "tile" ? "hui-tile-card" : "div"),
});
