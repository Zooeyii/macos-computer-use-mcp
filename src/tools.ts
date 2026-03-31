/**
 * Tool definitions for macOS Computer Use MCP Server
 *
 * Total tools: 24
 */

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface CoordinateSchema {
  type: "array";
  items: { type: "number" };
  minItems: number;
  maxItems: number;
  description: string;
}

/**
 * Get complete tool definitions
 */
export function getToolDefinitions(
  installedApps: string[],
  screenshotFiltering: boolean
): ToolDefinition[] {
  // Coordinate system description
  const coordDesc = "Pixels from the top-left corner of the screenshot";

  // Coordinate schema
  const coordinateSchema: CoordinateSchema = {
    type: "array",
    items: { type: "number" },
    minItems: 2,
    maxItems: 2,
    description: `(x, y): ${coordDesc}`,
  };

  // Modifier keys schema
  const modifierSchema = {
    type: "string",
    description:
      'Modifier keys to hold during the click (e.g. "shift", "ctrl+shift"). Supports the same syntax as the key tool.',
  };

  // Apps description with available apps
  const appsDescription =
    installedApps.length > 0
      ? ` Available applications on this machine: ${installedApps.slice(0, 20).join(", ")}${installedApps.length > 20 ? "..." : ""}.`
      : "";

  // Screenshot description based on filtering capability
  const screenshotDescription = screenshotFiltering
    ? "Take a screenshot of the primary display. Applications not in the session allowlist are excluded at the compositor level — only granted apps and the desktop are visible."
    : "Take a screenshot of the primary display. On this platform, screenshots are NOT filtered — all open windows are visible. Input actions targeting apps not in the session allowlist are rejected.";

  return [
    // ============================================================
    // PERMISSION & ACCESS
    // ============================================================

    {
      name: TOOL_NAMES.REQUEST_ACCESS,
      description:
        "Request user permission to control a set of applications for this session. Must be called before any other tool in this server. The user sees a single dialog listing all requested apps and either allows the whole set or denies it. Call this again mid-session to add more apps; previously granted apps remain granted. Returns the granted apps, denied apps, and screenshot filtering capability.",
      inputSchema: {
        type: "object",
        properties: {
          apps: {
            type: "array",
            items: { type: "string" },
            description: `Application display names (e.g. "Slack", "Calendar") or bundle identifiers (e.g. "com.tinyspeck.slackmacgap"). Display names are resolved case-insensitively against installed apps.${appsDescription}`,
          },
          reason: {
            type: "string",
            description:
              "One-sentence explanation shown to the user in the approval dialog. Explain the task, not the mechanism.",
          },
          clipboardRead: {
            type: "boolean",
            description:
              "Also request permission to read the user's clipboard (separate checkbox in the dialog).",
          },
          clipboardWrite: {
            type: "boolean",
            description:
              "Also request permission to write the user's clipboard. When granted, multi-line `type` calls use the clipboard fast path.",
          },
          systemKeyCombos: {
            type: "boolean",
            description:
              "Also request permission to send system-level key combos (quit app, switch app, lock screen). Without this, those specific combos are blocked.",
          },
        },
        required: ["apps", "reason"],
      },
    },

    // ============================================================
    // SCREENSHOT & DISPLAY
    // ============================================================

    {
      name: TOOL_NAMES.SCREENSHOT,
      description:
        screenshotDescription +
        " Returns an error if the allowlist is empty. The returned image is what subsequent click coordinates are relative to.",
      inputSchema: {
        type: "object",
        properties: {
          save_to_disk: {
            type: "boolean",
            description:
              "Save the image to disk so it can be attached to a message for the user. Returns the saved path in the tool result. Only set this when you intend to share the image — screenshots you're just looking at don't need saving.",
          },
        },
        required: [],
      },
    },

    {
      name: TOOL_NAMES.ZOOM,
      description:
        "Take a higher-resolution screenshot of a specific region of the last full-screen screenshot. Use this liberally to inspect small text, button labels, or fine UI details that are hard to read in the downsampled full-screen image. IMPORTANT: Coordinates in subsequent click calls always refer to the full-screen screenshot, never the zoomed image. This tool is read-only for inspecting detail.",
      inputSchema: {
        type: "object",
        properties: {
          region: {
            type: "array",
            items: { type: "integer" },
            minItems: 4,
            maxItems: 4,
            description:
              "(x0, y0, x1, y1): Rectangle to zoom into, in the coordinate space of the most recent full-screen screenshot. x0,y0 = top-left, x1,y1 = bottom-right.",
          },
          save_to_disk: {
            type: "boolean",
            description:
              "Save the image to disk so it can be attached to a message for the user. Returns the saved path in the tool result. Only set this when you intend to share the image.",
          },
        },
        required: ["region"],
      },
    },

    {
      name: TOOL_NAMES.SWITCH_DISPLAY,
      description:
        "Switch which monitor subsequent screenshots capture. Use this when the application you need is on a different monitor than the one shown. The screenshot tool tells you which monitor it captured and lists other attached monitors by name — pass one of those names here. After switching, call screenshot to see the new monitor. Pass \"auto\" to return to automatic monitor selection.",
      inputSchema: {
        type: "object",
        properties: {
          display: {
            type: "string",
            description:
              'Monitor name from the screenshot note (e.g. "Built-in Retina Display", "LG UltraFine"), or "auto" to re-enable automatic selection.',
          },
        },
        required: ["display"],
      },
    },

    // ============================================================
    // MOUSE CLICKS
    // ============================================================

    {
      name: TOOL_NAMES.LEFT_CLICK,
      description:
        "Left-click at the given coordinates. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          text: modifierSchema,
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.DOUBLE_CLICK,
      description:
        "Double-click at the given coordinates. Selects a word in most text editors. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          text: modifierSchema,
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.TRIPLE_CLICK,
      description:
        "Triple-click at the given coordinates. Selects a line in most text editors. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          text: modifierSchema,
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.RIGHT_CLICK,
      description:
        "Right-click at the given coordinates. Opens a context menu in most applications. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          text: modifierSchema,
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.MIDDLE_CLICK,
      description:
        "Middle-click (scroll-wheel click) at the given coordinates. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          text: modifierSchema,
        },
        required: ["coordinate"],
      },
    },

    // ============================================================
    // MOUSE DRAG & MOVE
    // ============================================================

    {
      name: TOOL_NAMES.LEFT_CLICK_DRAG,
      description:
        "Press, move to target, and release. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: {
            ...coordinateSchema,
            description: `(x, y) end point: ${coordDesc}`,
          },
          start_coordinate: {
            ...coordinateSchema,
            description: `(x, y) start point. If omitted, drags from the current cursor position. ${coordDesc}`,
          },
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.MOUSE_MOVE,
      description:
        "Move the mouse cursor without clicking. Useful for triggering hover states. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
        },
        required: ["coordinate"],
      },
    },

    {
      name: TOOL_NAMES.LEFT_MOUSE_DOWN,
      description:
        "Press the left mouse button at the current cursor position and leave it held. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. Use mouse_move first to position the cursor. Call left_mouse_up to release. Errors if the button is already held.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },

    {
      name: TOOL_NAMES.LEFT_MOUSE_UP,
      description:
        "Release the left mouse button at the current cursor position. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. Pairs with left_mouse_down. Safe to call even if the button is not currently held.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },

    // ============================================================
    // SCROLL
    // ============================================================

    {
      name: TOOL_NAMES.SCROLL,
      description:
        "Scroll at the given coordinates. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.",
      inputSchema: {
        type: "object",
        properties: {
          coordinate: coordinateSchema,
          scroll_direction: {
            type: "string",
            enum: ["up", "down", "left", "right"],
            description: "Direction to scroll.",
          },
          scroll_amount: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Number of scroll ticks.",
          },
        },
        required: ["coordinate", "scroll_direction", "scroll_amount"],
      },
    },

    // ============================================================
    // KEYBOARD
    // ============================================================

    {
      name: TOOL_NAMES.TYPE,
      description:
        "Type text into whatever currently has keyboard focus. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. Newlines are supported. For keyboard shortcuts use `key` instead.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to type.",
          },
        },
        required: ["text"],
      },
    },

    {
      name: TOOL_NAMES.KEY,
      description:
        'Press a key or key combination (e.g. "return", "escape", "cmd+a", "ctrl+shift+tab"). The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. ' +
        "System-level combos (quit app, switch app, lock screen) require the `systemKeyCombos` grant — without it they return an error. All other combos work.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: 'Modifiers joined with "+", e.g. "cmd+shift+a".',
          },
          repeat: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Number of times to repeat the key press. Default is 1.",
          },
        },
        required: ["text"],
      },
    },

    {
      name: TOOL_NAMES.HOLD_KEY,
      description:
        "Press and hold a key or key combination for the specified duration, then release. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. System-level combos require the `systemKeyCombos` grant.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: 'Key or chord to hold, e.g. "space", "shift+down".',
          },
          duration: {
            type: "number",
            description: "Duration in seconds (0–100).",
          },
        },
        required: ["text", "duration"],
      },
    },

    // ============================================================
    // CURSOR POSITION
    // ============================================================

    {
      name: TOOL_NAMES.CURSOR_POSITION,
      description:
        "Get the current mouse cursor position. Returns image-pixel coordinates relative to the most recent screenshot, or logical points if no screenshot has been taken.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },

    // ============================================================
    // APPLICATION MANAGEMENT
    // ============================================================

    {
      name: TOOL_NAMES.OPEN_APPLICATION,
      description:
        "Bring an application to the front, launching it if necessary. The target application must already be in the session allowlist — call request_access first.",
      inputSchema: {
        type: "object",
        properties: {
          app: {
            type: "string",
            description:
              'Display name (e.g. "Slack") or bundle identifier (e.g. "com.tinyspeck.slackmacgap").',
          },
        },
        required: ["app"],
      },
    },

    {
      name: TOOL_NAMES.LIST_GRANTED_APPLICATIONS,
      description:
        "List the applications currently in the session allowlist, plus the active grant flags and coordinate mode. No side effects.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },

    // ============================================================
    // CLIPBOARD
    // ============================================================

    {
      name: TOOL_NAMES.READ_CLIPBOARD,
      description:
        "Read the current clipboard contents as text. Requires the `clipboardRead` grant.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },

    {
      name: TOOL_NAMES.WRITE_CLIPBOARD,
      description:
        "Write text to the clipboard. Requires the `clipboardWrite` grant.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
          },
        },
        required: ["text"],
      },
    },

    // ============================================================
    // UTILITY
    // ============================================================

    {
      name: TOOL_NAMES.WAIT,
      description: "Wait for a specified duration.",
      inputSchema: {
        type: "object",
        properties: {
          duration: {
            type: "number",
            description: "Duration in seconds (0–100).",
          },
        },
        required: ["duration"],
      },
    },

    // ============================================================
    // BATCH OPERATIONS
    // ============================================================

    {
      name: TOOL_NAMES.COMPUTER_BATCH,
      description:
        "Execute a sequence of actions in ONE tool call. Each individual tool call requires a model→API round trip (seconds); batching a predictable sequence eliminates all but one. Use this whenever you can predict the outcome of several actions ahead — e.g. click a field, type into it, press Return. Actions execute sequentially and stop on the first error. The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing. The frontmost check runs before EACH action inside the batch — if an action opens a non-allowed app, the next action's gate fires and the batch stops there. Mid-batch screenshot actions are allowed for inspection but coordinates in subsequent clicks always refer to the PRE-BATCH full-screen screenshot.",
      inputSchema: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "left_click",
                    "right_click",
                    "middle_click",
                    "double_click",
                    "triple_click",
                    "type",
                    "key",
                    "scroll",
                    "mouse_move",
                    "left_click_drag",
                    "screenshot",
                    "wait",
                  ],
                },
                coordinate: coordinateSchema,
                start_coordinate: coordinateSchema,
                text: { type: "string" },
                scroll_direction: {
                  type: "string",
                  enum: ["up", "down", "left", "right"],
                },
                scroll_amount: { type: "integer" },
                duration: { type: "number" },
                save_to_disk: { type: "boolean" },
              },
              required: ["action"],
            },
            description:
              'List of actions. Example: [{"action":"left_click","coordinate":[100,200]},{"action":"type","text":"hello"},{"action":"key","text":"Return"}]',
          },
        },
        required: ["actions"],
      },
    },
  ];
}

/**
 * Tool names for reference
 */
export const TOOL_NAMES = {
  REQUEST_ACCESS: "request_access",
  SCREENSHOT: "screenshot",
  ZOOM: "zoom",
  SWITCH_DISPLAY: "switch_display",
  LEFT_CLICK: "left_click",
  DOUBLE_CLICK: "double_click",
  TRIPLE_CLICK: "triple_click",
  RIGHT_CLICK: "right_click",
  MIDDLE_CLICK: "middle_click",
  LEFT_CLICK_DRAG: "left_click_drag",
  MOUSE_MOVE: "mouse_move",
  LEFT_MOUSE_DOWN: "left_mouse_down",
  LEFT_MOUSE_UP: "left_mouse_up",
  SCROLL: "scroll",
  TYPE: "type",
  KEY: "key",
  HOLD_KEY: "hold_key",
  CURSOR_POSITION: "cursor_position",
  OPEN_APPLICATION: "open_application",
  LIST_GRANTED_APPLICATIONS: "list_granted_applications",
  READ_CLIPBOARD: "read_clipboard",
  WRITE_CLIPBOARD: "write_clipboard",
  WAIT: "wait",
  COMPUTER_BATCH: "computer_batch",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
