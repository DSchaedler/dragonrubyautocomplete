import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

let vscodeRuntime: typeof import('vscode') | undefined;
try {
  vscodeRuntime = require('vscode');
} catch {
  vscodeRuntime = undefined;
}

const completionItemKind = vscodeRuntime?.CompletionItemKind ?? {
  Variable: 6,
  Property: 10,
  Method: 2,
  Keyword: 14
};

type CompletionSuggestion = {
  label: string;
  kind: number;
  detail?: string;
  insertText?: string;
  documentation?: unknown;
};

const completionApi = vscodeRuntime ?? {
  CompletionItem: class {
    public label: string;
    public kind: number;
    public insertText?: string;
    public detail?: string;
    public documentation?: unknown;
    constructor(label: string, kind: number) {
      this.label = label;
      this.kind = kind;
    }
  },
  MarkdownString: class {
    public value: string;
    constructor(value: string) {
      this.value = value;
    }
  },
  CompletionItemKind: completionItemKind
};

// -----------------------------------------------------------------------------
// Completion data model
// -----------------------------------------------------------------------------
// This file owns the static seed dictionary and the engine-derived completion map.
// The goal is to keep the completion list generic and source-driven without
// hardcoding a giant manual list for every DragonRuby API object.
// -----------------------------------------------------------------------------

export type CompletionEntry = {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
};

export type DictionaryMap = Record<string, CompletionEntry[]>;

const MISSING_BASE_SEED_DOCUMENTATION = 'Not Specified; Please refer to engine docs.';

// Basic Ruby keywords that are useful even before a project is fully detected.
export const rubyKeywords = [
  'def', 'class', 'module', 'if', 'elsif', 'else', 'unless', 'case', 'when',
  'while', 'until', 'for', 'in', 'do', 'end', 'begin', 'rescue', 'ensure',
  'return', 'break', 'next', 'yield', 'lambda', 'proc', 'self', 'super',
  'nil', 'true', 'false', 'and', 'or', 'not', 'then', 'puts', 'p', 'pp',
  'sleep', 'rand', 'Kernel', 'Array', 'Hash', 'String', 'Integer', 'Float',
  'Symbol', 'Class', 'Module', 'Time', 'Math'
];

// The tiny seed keeps completions usable in brand-new or partial DragonRuby projects.
// These values are intentionally hardcoded because the legacy snippets and docs
// folders are not expected to exist in future projects, but the common patterns
// that they captured are still useful for any DragonRuby game.
export const baseSeed: DictionaryMap = {
  generic: [
    { label: 'args', kind: completionItemKind.Variable },
    { label: 'gtk', kind: completionItemKind.Variable },
    { label: '$gtk', kind: completionItemKind.Variable },
    { label: 'tick', kind: completionItemKind.Method },
    { label: 'render_target', kind: completionItemKind.Method },
    { label: 'inputs', kind: completionItemKind.Property },
    { label: 'outputs', kind: completionItemKind.Property },
    { label: 'state', kind: completionItemKind.Property },
    { label: 'geometry', kind: completionItemKind.Property },
    { label: 'layout', kind: completionItemKind.Property },
    { label: 'initialize', kind: completionItemKind.Method }
  ],
  args: [
    { label: 'inputs', kind: completionItemKind.Property },
    { label: 'outputs', kind: completionItemKind.Property },
    { label: 'state', kind: completionItemKind.Property },
    { label: 'gtk', kind: completionItemKind.Property },
    { label: 'geometry', kind: completionItemKind.Property },
    { label: 'audio', kind: completionItemKind.Property },
    { label: 'grid', kind: completionItemKind.Property },
    { label: 'layout', kind: completionItemKind.Property },
    { label: 'render_target', kind: completionItemKind.Method },
    { label: 'state', kind: completionItemKind.Property }
  ],
  grid: [
    { label: 'x', kind: completionItemKind.Property },
    { label: 'y', kind: completionItemKind.Property },
    { label: 'w', kind: completionItemKind.Property },
    { label: 'h', kind: completionItemKind.Property },
    { label: 'left', kind: completionItemKind.Property },
    { label: 'right', kind: completionItemKind.Property },
    { label: 'top', kind: completionItemKind.Property },
    { label: 'bottom', kind: completionItemKind.Property },
    { label: 'center', kind: completionItemKind.Property },
    { label: 'rect', kind: completionItemKind.Property },
    { label: 'origin_center!', kind: completionItemKind.Method },
    { label: 'origin_bottom_left!', kind: completionItemKind.Method },
    { label: 'portrait?', kind: completionItemKind.Method },
    { label: 'landscape?', kind: completionItemKind.Method },
    { label: 'allscreen_rect', kind: completionItemKind.Property },
    { label: 'allscreen_offset_x', kind: completionItemKind.Property },
    { label: 'allscreen_offset_y', kind: completionItemKind.Property },
    { label: 'native_scale', kind: completionItemKind.Property },
    { label: 'texture_scale', kind: completionItemKind.Property },
    { label: 'texture_scale_enum', kind: completionItemKind.Property }
  ],
  inputs: [
    { label: 'keyboard', kind: completionItemKind.Property },
    { label: 'mouse', kind: completionItemKind.Property },
    { label: 'touch', kind: completionItemKind.Property },
    { label: 'last_active', kind: completionItemKind.Property },
    { label: 'last_active_at', kind: completionItemKind.Property },
    { label: 'last_active_global_at', kind: completionItemKind.Property },
    { label: 'locale', kind: completionItemKind.Property },
    { label: 'controller_one', kind: completionItemKind.Property },
    { label: 'controller_two', kind: completionItemKind.Property },
    { label: 'controller_three', kind: completionItemKind.Property },
    { label: 'controller_four', kind: completionItemKind.Property }
  ],
  keyboard: [
    { label: 'active', kind: completionItemKind.Property },
    { label: 'has_focus', kind: completionItemKind.Property },
    { label: 'up', kind: completionItemKind.Property },
    { label: 'down', kind: completionItemKind.Property },
    { label: 'left', kind: completionItemKind.Property },
    { label: 'right', kind: completionItemKind.Property },
    { label: 'left_right', kind: completionItemKind.Property },
    { label: 'up_down', kind: completionItemKind.Property },
    { label: 'key_down', kind: completionItemKind.Method },
    { label: 'key_held', kind: completionItemKind.Method },
    { label: 'key_up', kind: completionItemKind.Method },
    { label: 'truthy_keys', kind: completionItemKind.Property },
    { label: 'keys', kind: completionItemKind.Property },
    { label: 'char', kind: completionItemKind.Property },
    { label: 'keycodes', kind: completionItemKind.Property },
    { label: 'w', kind: completionItemKind.Property },
    { label: 'a', kind: completionItemKind.Property },
    { label: 's', kind: completionItemKind.Property },
    { label: 'd', kind: completionItemKind.Property },
    { label: 'space', kind: completionItemKind.Property },
    { label: 'enter', kind: completionItemKind.Property },
    { label: 'escape', kind: completionItemKind.Property },
    { label: 'tab', kind: completionItemKind.Property },
    { label: 'shift', kind: completionItemKind.Property },
    { label: 'ctrl', kind: completionItemKind.Property }
  ],
  mouse: [
    { label: 'has_focus', kind: completionItemKind.Property },
    { label: 'x', kind: completionItemKind.Property },
    { label: 'y', kind: completionItemKind.Property },
    { label: 'previous_x', kind: completionItemKind.Property },
    { label: 'previous_y', kind: completionItemKind.Property },
    { label: 'relative_x', kind: completionItemKind.Property },
    { label: 'relative_y', kind: completionItemKind.Property },
    { label: 'click', kind: completionItemKind.Property },
    { label: 'click_left', kind: completionItemKind.Property },
    { label: 'click_right', kind: completionItemKind.Property },
    { label: 'left', kind: completionItemKind.Property },
    { label: 'middle', kind: completionItemKind.Property },
    { label: 'right', kind: completionItemKind.Property },
    { label: 'wheel', kind: completionItemKind.Property },
    { label: 'scroll_x', kind: completionItemKind.Property },
    { label: 'scroll_y', kind: completionItemKind.Property }
  ],
  touch: [
    { label: 'touches', kind: completionItemKind.Property },
    { label: 'x', kind: completionItemKind.Property },
    { label: 'y', kind: completionItemKind.Property },
    { label: 'previous_x', kind: completionItemKind.Property },
    { label: 'previous_y', kind: completionItemKind.Property },
    { label: 'tap', kind: completionItemKind.Property },
    { label: 'drag', kind: completionItemKind.Property },
    { label: 'up', kind: completionItemKind.Property },
    { label: 'down', kind: completionItemKind.Property }
  ],
  outputs: [
    { label: 'labels', kind: completionItemKind.Property },
    { label: 'sprites', kind: completionItemKind.Property },
    { label: 'solids', kind: completionItemKind.Property },
    { label: 'borders', kind: completionItemKind.Property },
    { label: 'lines', kind: completionItemKind.Property },
    { label: 'primitives', kind: completionItemKind.Property },
    { label: 'debug', kind: completionItemKind.Property },
    { label: 'audio', kind: completionItemKind.Property },
    { label: 'sounds', kind: completionItemKind.Property }
  ],
  audio: [
    { label: 'play', kind: completionItemKind.Method },
    { label: 'pause', kind: completionItemKind.Method },
    { label: 'stop', kind: completionItemKind.Method },
    { label: 'seek', kind: completionItemKind.Method },
    { label: 'mute', kind: completionItemKind.Method },
    { label: 'music', kind: completionItemKind.Property },
    { label: 'sounds', kind: completionItemKind.Property },
    { label: 'gain', kind: completionItemKind.Property }
  ],
  state: [
    { label: 'tick_count', kind: completionItemKind.Property },
    { label: 'player', kind: completionItemKind.Property },
    { label: 'score', kind: completionItemKind.Property },
    { label: 'health', kind: completionItemKind.Property },
    { label: 'camera', kind: completionItemKind.Property },
    { label: 'world', kind: completionItemKind.Property },
    { label: 'entities', kind: completionItemKind.Property },
    { label: 'border', kind: completionItemKind.Property },
    { label: 'box', kind: completionItemKind.Property },
    { label: 'speed', kind: completionItemKind.Property },
    { label: 'layers', kind: completionItemKind.Property }
  ],
  geometry: [
    { label: 'rect', kind: completionItemKind.Method },
    { label: 'inside_rect?', kind: completionItemKind.Method },
    { label: 'intersect_rect?', kind: completionItemKind.Method },
    { label: 'distance', kind: completionItemKind.Method },
    { label: 'clamp', kind: completionItemKind.Method },
    { label: 'point_inside_rect?', kind: completionItemKind.Method },
    { label: 'centered_rect', kind: completionItemKind.Method }
  ],
  gtk: [
    { label: 'reset', kind: completionItemKind.Method },
    { label: 'reboot', kind: completionItemKind.Method },
    { label: 'queue_sound', kind: completionItemKind.Method },
    { label: 'read_file', kind: completionItemKind.Method },
    { label: 'write_file', kind: completionItemKind.Method },
    { label: 'append_file', kind: completionItemKind.Method },
    { label: 'list_files', kind: completionItemKind.Method },
    { label: 'parse_json', kind: completionItemKind.Method },
    { label: 'parse_json_file', kind: completionItemKind.Method },
    { label: 'http_get', kind: completionItemKind.Method },
    { label: 'http_post', kind: completionItemKind.Method },
    { label: 'start_server!', kind: completionItemKind.Method },
    { label: 'set_window_scale', kind: completionItemKind.Method },
    { label: 'set_window_size', kind: completionItemKind.Method },
    { label: 'request_quit', kind: completionItemKind.Method },
    { label: 'quit_requested?', kind: completionItemKind.Method },
    { label: 'open_uri', kind: completionItemKind.Method },
    { label: 'platform?', kind: completionItemKind.Method },
    { label: 'production?', kind: completionItemKind.Method },
    { label: 'current_framerate', kind: completionItemKind.Property },
    { label: 'game_version', kind: completionItemKind.Property },
    { label: 'version', kind: completionItemKind.Property }
  ],
  controller: [
    { label: 'name', kind: completionItemKind.Property },
    { label: 'active', kind: completionItemKind.Property },
    { label: 'up', kind: completionItemKind.Property },
    { label: 'down', kind: completionItemKind.Property },
    { label: 'left', kind: completionItemKind.Property },
    { label: 'right', kind: completionItemKind.Property },
    { label: 'left_right', kind: completionItemKind.Property },
    { label: 'up_down', kind: completionItemKind.Property },
    { label: 'key_down', kind: completionItemKind.Method },
    { label: 'key_held', kind: completionItemKind.Method },
    { label: 'key_up', kind: completionItemKind.Method },
    { label: 'a', kind: completionItemKind.Property },
    { label: 'b', kind: completionItemKind.Property },
    { label: 'x', kind: completionItemKind.Property },
    { label: 'y', kind: completionItemKind.Property },
    { label: 'start', kind: completionItemKind.Property },
    { label: 'back', kind: completionItemKind.Property },
    { label: 'left_trigger', kind: completionItemKind.Property },
    { label: 'right_trigger', kind: completionItemKind.Property },
    { label: 'left_stick_x', kind: completionItemKind.Property },
    { label: 'left_stick_y', kind: completionItemKind.Property },
    { label: 'right_stick_x', kind: completionItemKind.Property },
    { label: 'right_stick_y', kind: completionItemKind.Property }
  ]
};

export const BaseSeedDocumentation: Record<string, string> = {
  args: 'The root DragonRuby `args` object passed into each tick. It exposes input, output, state, and runtime data for your game.',
  gtk: 'The DragonRuby runtime and platform API exposed through `gtk`.',
  $gtk: 'The global DragonRuby runtime object available in the game loop.',
  tick: 'The main game loop hook called once per frame with the current `args` object.',
  render_target: 'Creates or references an offscreen render target for compositing, post-processing, and layered effects.',
  inputs: 'Input state for keyboard, mouse, touch, and controller data.',
  outputs: 'Rendering targets such as labels, sprites, solids, lines, and other draw commands.',
  state: 'Per-game mutable state that persists across frames for your game objects.',
  geometry: 'Geometry helpers for rectangles, intersections, distances, and layout math.',
  layout: 'Virtual grid layout helpers for placing UI and game objects within the screen-safe area.',
  grid: 'The DragonRuby virtual game grid that defines the visible play area, coordinate system, and screen bounds.',
  initialize: 'Lifecycle initializer for the current object or state container.',
  keyboard: 'Keyboard input state including direction helpers, key_down, key_held, and key_up checks.',
  mouse: 'Mouse input state such as position, movement deltas, buttons, and click events.',
  touch: 'Touch input state including taps, drags, and touch coordinates.',
  last_active: 'The most recently active input source, often `:keyboard`, `:mouse`, or `:controller`.',
  last_active_at: 'The tick count when the most recent input event happened.',
  last_active_global_at: 'The global tick count when the most recent input event happened.',
  locale: 'The current OS locale string, usually an ISO language code such as `en`.',
  controller_one: 'Controller one input state for gamepad buttons, triggers, and analog sticks.',
  controller_two: 'Controller two input state for gamepad buttons, triggers, and analog sticks.',
  controller_three: 'Controller three input state for gamepad buttons, triggers, and analog sticks.',
  controller_four: 'Controller four input state for gamepad buttons, triggers, and analog sticks.',
  active: 'Whether the current input device is active in this frame or is being used.',
  has_focus: 'Whether the relevant input source currently has focus.',
  up: 'Directional input state for the up direction.',
  down: 'Directional input state for the down direction.',
  left: 'Directional input state for the left direction.',
  right: 'Directional input state for the right direction.',
  left_right: 'A signed horizontal direction value, usually -1, 0, or 1.',
  up_down: 'A signed vertical direction value, usually -1, 0, or 1.',
  key_down: 'Checks whether a key or button was pressed this frame.',
  key_held: 'Checks whether a key or button is currently being held down.',
  key_up: 'Checks whether a key or button was released this frame.',
  truthy_keys: 'An array of keys currently in a true or pressed state.',
  keys: 'A hash of key state information such as pressed, held, or released states.',
  char: 'The character associated with a keyboard event, when available.',
  keycodes: 'Raw SDL keycode values for keyboard input lookup.',
  w: 'The `w` key state from keyboard or WASD movement input.',
  a: 'The `a` key state from keyboard or WASD movement input.',
  s: 'The `s` key state from keyboard or WASD movement input.',
  d: 'The `d` key state from keyboard or WASD movement input.',
  space: 'The space bar state for jumping, confirm, or action input.',
  enter: 'The Enter key state for confirm or menu actions.',
  escape: 'The Escape key state for pause or cancel actions.',
  tab: 'The Tab key state for menu navigation or debug toggles.',
  shift: 'The Shift modifier key state.',
  ctrl: 'The Control modifier key state.',
  mouse_has_focus: 'Whether the mouse currently has game focus.',
  mouse_x: 'The current horizontal mouse position.',
  mouse_y: 'The current vertical mouse position.',
  mouse_previous_x: 'The mouse x value from the previous frame.',
  mouse_previous_y: 'The mouse y value from the previous frame.',
  mouse_relative_x: 'How much the mouse x position changed from the previous frame.',
  mouse_relative_y: 'How much the mouse y position changed from the previous frame.',
  click: 'The current click event or pointer press payload.',
  click_left: 'Left-click state for the mouse input object.',
  click_right: 'Right-click state for the mouse input object.',
  middle: 'The middle mouse button state.',
  mouse_right: 'The right mouse button state.',
  wheel: 'Mouse scroll delta information, or nil when there is no scroll this frame.',
  scroll_x: 'Horizontal mouse wheel scroll delta.',
  scroll_y: 'Vertical mouse wheel scroll delta.',
  touches: 'Touch input records for active touch points.',
  tap: 'A tap event from a touch input.',
  drag: 'A drag gesture or drag movement from a touch input.',
  labels: 'Array of label draw commands rendered to the screen.',
  sprites: 'Array of sprite draw commands rendered to the screen.',
  solids: 'Array of solid rectangles rendered to the screen.',
  borders: 'Array of border outlines rendered to the screen.',
  lines: 'Array of line draw commands rendered to the screen.',
  primitives: 'Array of low-level primitive draw commands.',
  debug: 'Array of debug primitives used for visualization and layout debugging.',
  audio: 'Audio playback state and output helpers.',
  play: 'Starts music or a sound effect playback for the current audio channel.',
  pause: 'Pauses the current music or sound playback without resetting state.',
  stop: 'Stops the current audio playback immediately.',
  seek: 'Seeks within the active audio stream to a new playback position.',
  mute: 'Mutes or unmutes the active audio output.',
  music: 'The currently active music state or music track metadata.',
  sounds: 'Array of sound effects and music playback commands.',
  gain: 'Controls the current audio gain or volume level for a playback channel.',
  tick_count: 'The running frame count tracked by the game state.',
  player: 'Common player state slot used by many games.',
  score: 'Score value stored in the game state.',
  health: 'Health or life value stored in the game state.',
  camera: 'Camera state for world tracking and view transforms.',
  world: 'World state or game map data.',
  entities: 'Collection of game entities and actors.',
  border: 'Border or boundary area definition.',
  box: 'Box or rectangle definition used in state.',
  speed: 'Speed or motion value stored in the game state.',
  layers: 'Layer collection used to organize rendering or world data.',
  rect: 'Returns a virtual grid rectangle with x, y, w, h, and center information.',
  'h': 'The height of the current virtual grid or game area in pixels.',
  top: 'The top edge of the active grid or screen bounds.',
  bottom: 'The bottom edge of the active grid or screen bounds.',
  center: 'The center point of the current grid or play area.',
  'origin_center!': 'Reconfigures the grid origin to the center of the screen.',
  'origin_bottom_left!': 'Reconfigures the grid origin to the bottom-left corner of the screen.',
  'portrait?': 'Returns true when the active game orientation is portrait.',
  'landscape?': 'Returns true when the active game orientation is landscape.',
  allscreen_rect: 'The full-screen rect including all-screen render-space offsets when enabled.',
  allscreen_offset_x: 'Horizontal all-screen offset applied when the game is rendered in extended full-screen mode.',
  allscreen_offset_y: 'Vertical all-screen offset applied when the game is rendered in extended full-screen mode.',
  native_scale: 'The native render scale of the current game window.',
  texture_scale: 'The current texture scaling factor used for the render target output.',
  texture_scale_enum: 'The enumerated texture scaling mode for the current render target.',
  'inside_rect?': 'Checks whether a point or object lies inside a rectangle.',
  'intersect_rect?': 'Checks whether two rectangles overlap or intersect.',
  distance: 'Calculates the distance between points or objects.',
  clamp: 'Constrains a value to a minimum and maximum range.',
  'point_inside_rect?': 'Checks whether a point is contained within a rectangle.',
  centered_rect: 'Builds a centered rectangle for layout and UI composition.',
  reset: 'Resets the current runtime or object back to a clean state.',
  reboot: 'Restarts the runtime or game session.',
  queue_sound: 'Queues a sound effect or music event for playback.',
  read_file: 'Reads the contents of a file from the game data directory.',
  write_file: 'Writes string or binary content to a file in the game data directory.',
  append_file: 'Appends content to an existing file without overwriting it.',
  list_files: 'Lists files and folders inside the requested directory.',
  parse_json: 'Parses a JSON string into Ruby data structures.',
  parse_json_file: 'Loads JSON from disk and parses it into Ruby data structures.',
  http_get: 'Performs an HTTP GET request from the game runtime.',
  http_post: 'Performs an HTTP POST request from the game runtime.',
  'start_server!': 'Starts the listening in-game HTTP server for local development or tools.',
  set_window_scale: 'Sets the scale factor used to render the game window.',
  set_window_size: 'Sets the game window width and height in pixels.',
  request_quit: 'Requests that the runtime quits as soon as it reaches a safe point.',
  'quit_requested?': 'Returns whether a quit request has already been made.',
  open_uri: 'Opens a URL or file URI using the desktop environment.',
  'platform?': 'Returns whether the current platform matches the supplied platform key.',
  'production?': 'Returns whether the game is running in production mode.',
  current_framerate: 'The current runtime frame rate reported by DragonRuby.',
  game_version: 'The current game version string defined by the project metadata.',
  version: 'The DragonRuby runtime version string.',
  name: 'The human-readable name of the control or input device.',
  'controller': 'Generic controller input state shared across controller_one through controller_four.',
  start: 'Start/menu button state.',
  back: 'Back/select button state.',
  left_trigger: 'Left trigger analog or digital input.',
  right_trigger: 'Right trigger analog or digital input.',
  left_stick_x: 'Horizontal position of the left analog stick.',
  left_stick_y: 'Vertical position of the left analog stick.',
  right_stick_x: 'Horizontal position of the right analog stick.',
  right_stick_y: 'Vertical position of the right analog stick.'
};

for (const group of Object.values(baseSeed)) {
  for (const entry of group) {
    entry.documentation ??= BaseSeedDocumentation[entry.label] ?? MISSING_BASE_SEED_DOCUMENTATION;
  }
}

export function ensureGroup(map: DictionaryMap, group: string): CompletionEntry[] {
  if (!map[group]) {
    map[group] = [];
  }

  return map[group];
}

export function addUnique(map: DictionaryMap, group: string, value: string) {
  const entries = ensureGroup(map, group);
  const existing = entries.find((entry) => entry.label === value);

  if (!existing) {
    entries.push({
      label: value,
      kind: completionItemKind.Property,
      documentation: undefined
    });
    return;
  }
}

export function mergeMaps(seed: DictionaryMap, engine: DictionaryMap): DictionaryMap {
  const merged: DictionaryMap = { ...seed };

  for (const group of Object.keys(engine)) {
    const seen = new Set((merged[group] ?? []).map((entry) => entry.label));
    const additions = (engine[group] ?? []).filter((entry) => !seen.has(entry.label));
    merged[group] = [...(merged[group] ?? []), ...additions];
  }

  return merged;
}

// -----------------------------------------------------------------------------
// Engine scan helpers
// -----------------------------------------------------------------------------
// The engine itself is the canonical source of truth. Rather than maintaining a
// giant hard-coded map, we walk DragonRuby’s bundled docs/source and extract
// symbols used in common patterns such as args.outputs.* or controller_*. New
// names are added to the map on demand rather than needing a manual static list.
// -----------------------------------------------------------------------------
function walkRubyFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const child of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        stack.push(full);
      } else if (child.name.endsWith('.rb')) {
        files.push(full);
      }
    }
  }

  return files;
}

function createReadMoreText(entry: CompletionEntry): string {
  if (entry.documentation !== undefined && entry.documentation !== MISSING_BASE_SEED_DOCUMENTATION) {
    return String(entry.documentation);
  }

  const builtinDoc = BaseSeedDocumentation[entry.label];
  if (builtinDoc) {
    return builtinDoc;
  }

  return MISSING_BASE_SEED_DOCUMENTATION;
}

export function createItems(entries: CompletionEntry[]): CompletionSuggestion[] {
  const seen = new Set<string>();

  return entries.reduce<CompletionSuggestion[]>((items, entry) => {
    if (seen.has(entry.label)) {
      return items;
    }

    seen.add(entry.label);
    const item = new completionApi.CompletionItem(entry.label, entry.kind) as CompletionSuggestion;
    item.detail = entry.detail ?? 'DragonRuby';
    item.insertText = entry.label;
    item.documentation = new completionApi.MarkdownString(createReadMoreText(entry));
    items.push(item);
    return items;
  }, []);
}

export function keywordMatches(prefix: string): CompletionSuggestion[] {
  return rubyKeywords
    .filter((word) => word.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((word) => {
      const item = new completionApi.CompletionItem(word, completionApi.CompletionItemKind.Keyword) as CompletionSuggestion;
      item.insertText = word;
      return item;
    });
}

// -----------------------------------------------------------------------------
// Completion context logic
// -----------------------------------------------------------------------------
// This helper resolves the nearest object context before the cursor and returns the
// matching completion bucket. For example: after typing args.inputs.keyboard., the
// engine will offer keyboard members rather than generic top-level names.
// -----------------------------------------------------------------------------
export function completionForContext(line: string, completionMap: DictionaryMap = baseSeed): CompletionSuggestion[] {
  const trimmed = line.trim();
  if (trimmed.match(/<<\s*$/)) {
    return [];
  }

  const tokens = trimmed.split(/\s|[\(\[\{,=:\]\)\.;]+/).filter(Boolean);
  const current = tokens[tokens.length - 1] ?? '';
  const previous = tokens[tokens.length - 2] ?? '';

  const candidateGroup = (value: string): string | undefined => {
    if (!value) {
      return undefined;
    }

    if (value in completionMap) {
      return value;
    }

    const exactMatch = Object.keys(completionMap).find((group) => group === value);
    return exactMatch;
  };

  const resolveHierarchicalGroup = (value: string): string | undefined => {
    const cleaned = value.replace(/\.+$/, '');
    if (!cleaned) {
      return undefined;
    }

    const segments = cleaned.split('.').filter(Boolean);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (segment in completionMap || segment === 'args' || segment === 'gtk' || segment === '$gtk') {
        return segment === '$gtk' ? 'gtk' : segment;
      }
    }

    return undefined;
  };

  const hierarchicalGroup = resolveHierarchicalGroup(trimmed);

  const directChainGroup = (() => {
    if (trimmed.match(/args\.inputs\.?$/)) {
      return 'inputs';
    }
    if (trimmed.match(/args\.outputs\.?$/)) {
      return 'outputs';
    }
    if (trimmed.match(/args\.state\.?$/)) {
      return 'state';
    }
    if (trimmed.match(/args\.geometry\.?$/)) {
      return 'geometry';
    }
    if (trimmed.match(/args\.layout\.?$/)) {
      return 'layout';
    }
    if (trimmed.match(/args\.audio\.?$/)) {
      return 'audio';
    }
    if (trimmed.match(/args\.grid\.?$/)) {
      return 'grid';
    }
    if (trimmed.match(/(?:^|\s|\(|\[|\{|=|:|,)gtk\.?$/) || trimmed.match(/(?:^|\s|\(|\[|\{|=|:|,)\$gtk\.?$/)) {
      return 'gtk';
    }
    if (trimmed.match(/(?:^|\s|\(|\[|\{|=|:|,)args\.?$/)) {
      return 'args';
    }
    return undefined;
  })();

  const currentGroup = candidateGroup(current);
  const previousGroup = candidateGroup(previous);

  if (hierarchicalGroup) {
    return createItems(completionMap[hierarchicalGroup] ?? []);
  }

  if (directChainGroup) {
    return createItems(completionMap[directChainGroup] ?? []);
  }

  if (current === 'args' || current === 'gtk' || current === '$gtk') {
    return createItems(completionMap.args ?? []);
  }

  if (previousGroup) {
    return createItems(completionMap[previousGroup] ?? []);
  }

  if (currentGroup) {
    return createItems(completionMap[currentGroup] ?? []);
  }

  if (current.includes('controller_') || trimmed.includes('args.inputs.controller_')) {
    return createItems(completionMap.controller ?? []);
  }

  const chainMatch = trimmed.match(/args\.(inputs|outputs|state|geometry|layout|audio|grid|gtk)\.?$/);
  if (chainMatch) {
    const groupName = chainMatch[1];
    return createItems(completionMap[groupName] ?? []);
  }

  if (trimmed.includes('args.inputs.keyboard.') || trimmed.includes('args.inputs.keyboard')) {
    return createItems(completionMap.keyboard ?? []);
  }

  if (trimmed.includes('args.inputs.mouse.')) {
    return createItems(completionMap.mouse ?? []);
  }

  if (trimmed.includes('args.inputs.touch.')) {
    return createItems(completionMap.touch ?? []);
  }

  if (trimmed.includes('args.outputs.')) {
    return createItems(completionMap.outputs ?? []);
  }

  if (trimmed.includes('args.geometry.')) {
    return createItems(completionMap.geometry ?? []);
  }

  if (trimmed.includes('args.gtk.') || trimmed.includes('gtk.')) {
    return createItems(completionMap.gtk ?? []);
  }

  if (trimmed.includes('args.state.')) {
    return createItems(completionMap.state ?? []);
  }

  if (trimmed.match(/args\.inputs\.keyboard\.(key_down|key_held|key_up)\.?$/)) {
    return createItems(completionMap.keyboard ?? []);
  }

  if (trimmed.match(/args\.inputs\.controller_(one|two|three|four)\.(name|active|up|down|left|right|left_right|up_down|a|b|x|y|left_trigger|right_trigger|left_stick_x|left_stick_y|right_stick_x|right_stick_y)\.?$/)) {
    return createItems(completionMap.controller ?? []);
  }

  const prefix = trimmed.match(/([A-Za-z_\$][A-Za-z0-9_\$]*)$/)?.[1] ?? '';
  const genericItems = [
    ...createItems(completionMap.generic ?? []),
    ...createItems(completionMap.args ?? []),
    ...createItems(completionMap.inputs ?? []),
    ...createItems(completionMap.outputs ?? []),
    ...createItems(completionMap.audio ?? []),
    ...createItems(completionMap.gtk ?? []),
    ...createItems(completionMap.geometry ?? []),
    ...createItems(completionMap.layout ?? []),
    ...createItems(completionMap.state ?? []),
    ...keywordMatches(prefix)
  ];

  if (!prefix) {
    return genericItems;
  }

  return genericItems.filter((item) => item.label.toString().toLowerCase().startsWith(prefix.toLowerCase()));
}
