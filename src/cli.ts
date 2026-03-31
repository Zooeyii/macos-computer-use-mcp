#!/usr/bin/env node
/**
 * Computer Use MCP Server
 *
 * A standalone MCP server that provides native macOS computer control.
 *
 * Usage:
 *   node dist/cli.js
 *
 * Add to your MCP client config:
 *   {
 *     "computer-use-standalone": {
 *       "type": "stdio",
 *       "command": "node",
 *       "args": ["/path/to/macos-computer-use-mcp/dist/cli.js"]
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createExecutor,
  type Executor,
  type ScreenshotResult,
} from "./executor.js";
import { getToolDefinitions, TOOL_NAMES } from "./tools.js";

// ============================================================================
// TYPES
// ============================================================================

interface SessionState {
  grantedApps: Set<string>;
  deniedApps: Set<string>;
  screenshotFiltering: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  systemKeyCombos: boolean;
  currentDisplay: string | "auto";
  lastScreenshot: ScreenshotResult | null;
}

interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

// ============================================================================
// SERVER
// ============================================================================

const SERVER_NAME = "computer-use-standalone";
const SERVER_VERSION = "1.0.0";

class ComputerUseServer {
  private server: Server;
  private executor: Executor | null = null;
  private state: SessionState = {
    grantedApps: new Set(),
    deniedApps: new Set(),
    screenshotFiltering: false,
    clipboardRead: false,
    clipboardWrite: false,
    systemKeyCombos: false,
    currentDisplay: "auto",
    lastScreenshot: null,
  };

  constructor() {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const apps = await this.getInstalledAppNames();
      return {
        tools: getToolDefinitions(apps, this.state.screenshotFiltering),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args || {});
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  // ========================================================================
  // TOOL HANDLERS
  // ========================================================================

  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    await this.ensureExecutor();

    switch (name) {
      // === PERMISSIONS ===
      case TOOL_NAMES.REQUEST_ACCESS: {
        return this.handleRequestAccess(args);
      }

      case TOOL_NAMES.LIST_GRANTED_APPLICATIONS: {
        return this.handleListGrantedApps();
      }

      // === DISPLAY ===
      case TOOL_NAMES.SCREENSHOT: {
        return this.handleScreenshot(args);
      }

      case TOOL_NAMES.ZOOM: {
        return this.handleZoom(args);
      }

      case TOOL_NAMES.SWITCH_DISPLAY: {
        return this.handleSwitchDisplay(args);
      }

      // === MOUSE CLICKS ===
      case TOOL_NAMES.LEFT_CLICK: {
        return this.handleLeftClick(args);
      }

      case TOOL_NAMES.DOUBLE_CLICK: {
        return this.handleDoubleClick(args);
      }

      case TOOL_NAMES.TRIPLE_CLICK: {
        return this.handleTripleClick(args);
      }

      case TOOL_NAMES.RIGHT_CLICK: {
        return this.handleRightClick(args);
      }

      case TOOL_NAMES.MIDDLE_CLICK: {
        return this.handleMiddleClick(args);
      }

      // === MOUSE STATE ===
      case TOOL_NAMES.MOUSE_MOVE: {
        return this.handleMouseMove(args);
      }

      case TOOL_NAMES.LEFT_MOUSE_DOWN: {
        return this.handleLeftMouseDown();
      }

      case TOOL_NAMES.LEFT_MOUSE_UP: {
        return this.handleLeftMouseUp();
      }

      case TOOL_NAMES.LEFT_CLICK_DRAG: {
        return this.handleLeftClickDrag(args);
      }

      case TOOL_NAMES.CURSOR_POSITION: {
        return this.handleCursorPosition();
      }

      // === SCROLL ===
      case TOOL_NAMES.SCROLL: {
        return this.handleScroll(args);
      }

      // === KEYBOARD ===
      case TOOL_NAMES.TYPE: {
        return this.handleType(args);
      }

      case TOOL_NAMES.KEY: {
        return this.handleKey(args);
      }

      case TOOL_NAMES.HOLD_KEY: {
        return this.handleHoldKey(args);
      }

      // === CLIPBOARD ===
      case TOOL_NAMES.READ_CLIPBOARD: {
        return this.handleReadClipboard();
      }

      case TOOL_NAMES.WRITE_CLIPBOARD: {
        return this.handleWriteClipboard(args);
      }

      // === APPLICATIONS ===
      case TOOL_NAMES.OPEN_APPLICATION: {
        return this.handleOpenApplication(args);
      }

      // === UTILITY ===
      case TOOL_NAMES.WAIT: {
        return this.handleWait(args);
      }

      // === BATCH ===
      case TOOL_NAMES.COMPUTER_BATCH: {
        return this.handleBatch(args);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ========================================================================
  // IMPLEMENTATIONS
  // ========================================================================

  private async handleRequestAccess(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      apps,
      reason,
      clipboardRead = false,
      clipboardWrite = false,
      systemKeyCombos = false,
    } = args as {
      apps: string[];
      reason: string;
      clipboardRead?: boolean;
      clipboardWrite?: boolean;
      systemKeyCombos?: boolean;
    };

    // In standalone mode, auto-grant all requested apps
    const granted: string[] = [];
    const denied: string[] = [];

    for (const app of apps) {
      this.state.grantedApps.add(app);
      granted.push(app);
    }

    this.state.screenshotFiltering = true; // Assume native capability
    this.state.clipboardRead = clipboardRead;
    this.state.clipboardWrite = clipboardWrite;
    this.state.systemKeyCombos = systemKeyCombos;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          granted,
          denied,
          screenshotFiltering: this.state.screenshotFiltering,
          clipboardRead: this.state.clipboardRead,
          clipboardWrite: this.state.clipboardWrite,
          systemKeyCombos: this.state.systemKeyCombos,
        }, null, 2),
      }],
    };
  }

  private async handleListGrantedApps(): Promise<ToolResult> {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          grantedApps: Array.from(this.state.grantedApps),
          screenshotFiltering: this.state.screenshotFiltering,
          clipboardRead: this.state.clipboardRead,
          clipboardWrite: this.state.clipboardWrite,
          systemKeyCombos: this.state.systemKeyCombos,
          currentDisplay: this.state.currentDisplay,
        }, null, 2),
      }],
    };
  }

  private async handleScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
    const { save_to_disk = false } = args as { save_to_disk?: boolean };

    if (this.state.grantedApps.size === 0) {
      throw new Error("No applications granted. Call request_access first.");
    }

    const result = await this.executor!.screenshot(save_to_disk as boolean);
    this.state.lastScreenshot = result;

    const content: ToolResult["content"] = [
      {
        type: "text",
        text: `Screenshot captured (${result.width}x${result.height})\n` +
          `Display: ${result.displayNames[0]}\n` +
          (result.otherDisplays.length > 0
            ? `Other displays: ${result.otherDisplays.join(", ")}\n`
            : "") +
          (save_to_disk && result.data.length > 100 ? `\nSaved to: /tmp/screenshot-${Date.now()}.png` : ""),
      },
    ];

    // Add image if not saving to disk (or always for display)
    content.push({
      type: "image",
      data: result.data,
      mimeType: "image/png",
    });

    return { content };
  }

  private async handleZoom(args: Record<string, unknown>): Promise<ToolResult> {
    const { region, save_to_disk = false } = args as {
      region: [number, number, number, number];
      save_to_disk?: boolean;
    };

    const [x0, y0, x1, y1] = region;
    const result = await this.executor!.zoom(
      { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      save_to_disk
    );

    return {
      content: [
        { type: "image", data: result.data, mimeType: "image/png" },
        ...(result.path ? [{ type: "text", text: `Saved to: ${result.path}` }] : []),
      ],
    };
  }

  private async handleSwitchDisplay(args: Record<string, unknown>): Promise<ToolResult> {
    const { display } = args as { display: string };
    this.state.currentDisplay = display;
    await this.executor!.switchDisplay(display);

    return {
      content: [{
        type: "text",
        text: display === "auto"
          ? "Switched to automatic display selection. Call screenshot to capture."
          : `Switched to display: ${display}. Call screenshot to capture.`,
      }],
    };
  }

  private async handleLeftClick(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, text } = args as { coordinate: [number, number]; text?: string };
    const modifiers = text ? text.split("+") : undefined;
    await this.executor!.leftClick(coordinate[0], coordinate[1], modifiers);
    return { content: [{ type: "text", text: `Left-clicked at (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleDoubleClick(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, text } = args as { coordinate: [number, number]; text?: string };
    const modifiers = text ? text.split("+") : undefined;
    await this.executor!.doubleClick(coordinate[0], coordinate[1], modifiers);
    return { content: [{ type: "text", text: `Double-clicked at (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleTripleClick(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, text } = args as { coordinate: [number, number]; text?: string };
    const modifiers = text ? text.split("+") : undefined;
    await this.executor!.tripleClick(coordinate[0], coordinate[1], modifiers);
    return { content: [{ type: "text", text: `Triple-clicked at (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleRightClick(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, text } = args as { coordinate: [number, number]; text?: string };
    const modifiers = text ? text.split("+") : undefined;
    await this.executor!.rightClick(coordinate[0], coordinate[1], modifiers);
    return { content: [{ type: "text", text: `Right-clicked at (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleMiddleClick(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, text } = args as { coordinate: [number, number]; text?: string };
    const modifiers = text ? text.split("+") : undefined;
    await this.executor!.middleClick(coordinate[0], coordinate[1], modifiers);
    return { content: [{ type: "text", text: `Middle-clicked at (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleMouseMove(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate } = args as { coordinate: [number, number] };
    await this.executor!.mouseMove(coordinate[0], coordinate[1]);
    return { content: [{ type: "text", text: `Moved cursor to (${coordinate[0]}, ${coordinate[1]})` }] };
  }

  private async handleLeftMouseDown(): Promise<ToolResult> {
    await this.executor!.leftMouseDown();
    return { content: [{ type: "text", text: "Left mouse button pressed" }] };
  }

  private async handleLeftMouseUp(): Promise<ToolResult> {
    await this.executor!.leftMouseUp();
    return { content: [{ type: "text", text: "Left mouse button released" }] };
  }

  private async handleLeftClickDrag(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, start_coordinate } = args as {
      coordinate: [number, number];
      start_coordinate?: [number, number];
    };

    if (start_coordinate) {
      await this.executor!.leftClickDrag(
        start_coordinate[0],
        start_coordinate[1],
        coordinate[0],
        coordinate[1]
      );
    } else {
      // Drag from current position
      const pos = await this.executor!.cursorPosition();
      await this.executor!.leftClickDrag(pos.x, pos.y, coordinate[0], coordinate[1]);
    }

    return {
      content: [{
        type: "text",
        text: start_coordinate
          ? `Dragged from (${start_coordinate[0]}, ${start_coordinate[1]}) to (${coordinate[0]}, ${coordinate[1]})`
          : `Dragged to (${coordinate[0]}, ${coordinate[1]})`,
      }],
    };
  }

  private async handleCursorPosition(): Promise<ToolResult> {
    const pos = await this.executor!.cursorPosition();
    return { content: [{ type: "text", text: JSON.stringify(pos) }] };
  }

  private async handleScroll(args: Record<string, unknown>): Promise<ToolResult> {
    const { coordinate, scroll_direction, scroll_amount } = args as {
      coordinate: [number, number];
      scroll_direction: "up" | "down" | "left" | "right";
      scroll_amount: number;
    };

    await this.executor!.scroll(
      coordinate[0],
      coordinate[1],
      scroll_direction,
      scroll_amount
    );

    return {
      content: [{
        type: "text",
        text: `Scrolled ${scroll_direction} by ${scroll_amount} at (${coordinate[0]}, ${coordinate[1]})`,
      }],
    };
  }

  private async handleType(args: Record<string, unknown>): Promise<ToolResult> {
    const { text } = args as { text: string };
    await this.executor!.type(text);
    return {
      content: [{
        type: "text",
        text: text.length > 100 ? `Typed: ${text.slice(0, 100)}...` : `Typed: ${text}`,
      }],
    };
  }

  private async handleKey(args: Record<string, unknown>): Promise<ToolResult> {
    const { text, repeat = 1 } = args as { text: string; repeat?: number };

    // Check for system key combos
    if (this._isSystemKeyCombo(text) && !this.state.systemKeyCombos) {
      throw new Error(
        `System key combo "${text}" requires systemKeyCombos permission. ` +
        "Request it in request_access first."
      );
    }

    await this.executor!.key(text, repeat);
    return { content: [{ type: "text", text: `Pressed key: ${text}${repeat > 1 ? ` (x${repeat})` : ""}` }] };
  }

  private async handleHoldKey(args: Record<string, unknown>): Promise<ToolResult> {
    const { text, duration } = args as { text: string; duration: number };

    if (this._isSystemKeyCombo(text) && !this.state.systemKeyCombos) {
      throw new Error(
        `System key combo "${text}" requires systemKeyCombos permission.`
      );
    }

    await this.executor!.holdKey(text, duration);
    return { content: [{ type: "text", text: `Held key ${text} for ${duration}s` }] };
  }

  private async handleReadClipboard(): Promise<ToolResult> {
    if (!this.state.clipboardRead) {
      throw new Error("Clipboard read requires clipboardRead permission.");
    }
    const text = await this.executor!.readClipboard();
    return { content: [{ type: "text", text }] };
  }

  private async handleWriteClipboard(args: Record<string, unknown>): Promise<ToolResult> {
    const { text } = args as { text: string };
    if (!this.state.clipboardWrite) {
      throw new Error("Clipboard write requires clipboardWrite permission.");
    }
    await this.executor!.writeClipboard(text);
    return { content: [{ type: "text", text: "Clipboard updated" }] };
  }

  private async handleOpenApplication(args: Record<string, unknown>): Promise<ToolResult> {
    const { app } = args as { app: string };
    await this.executor!.openApplication(app);
    return { content: [{ type: "text", text: `Opened: ${app}` }] };
  }

  private async handleWait(args: Record<string, unknown>): Promise<ToolResult> {
    const { duration } = args as { duration: number };
    await this.executor!.wait(duration);
    return { content: [{ type: "text", text: `Waited ${duration}s` }] };
  }

  private async handleBatch(args: Record<string, unknown>): Promise<ToolResult> {
    const { actions } = args as { actions: Array<Record<string, unknown>> };

    const results: string[] = [];

    for (const action of actions) {
      const actionName = action.action as string;

      try {
        // Handle screenshot specially in batch
        if (actionName === "screenshot") {
          const result = await this.handleScreenshot(action);
          results.push(`screenshot: ok`);
        } else if (actionName === "wait") {
          const result = await this.handleWait(action);
          results.push(`wait: ok`);
        } else {
          // Dispatch to appropriate handler
          const handlerMap: Record<string, (a: Record<string, unknown>) => Promise<ToolResult>> = {
            left_click: this.handleLeftClick.bind(this),
            right_click: this.handleRightClick.bind(this),
            middle_click: this.handleMiddleClick.bind(this),
            double_click: this.handleDoubleClick.bind(this),
            triple_click: this.handleTripleClick.bind(this),
            type: this.handleType.bind(this),
            key: this.handleKey.bind(this),
            scroll: this.handleScroll.bind(this),
            mouse_move: this.handleMouseMove.bind(this),
            left_click_drag: this.handleLeftClickDrag.bind(this),
          };

          const handler = handlerMap[actionName];
          if (!handler) {
            throw new Error(`Unknown batch action: ${actionName}`);
          }

          await handler(action);
          results.push(`${actionName}: ok`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push(`${actionName}: error - ${msg}`);
        break; // Stop on first error
      }
    }

    return {
      content: [{
        type: "text",
        text: `Batch executed ${results.length}/${actions.length} actions:\n${results.join("\n")}`,
      }],
    };
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  private async ensureExecutor() {
    if (!this.executor) {
      this.executor = await createExecutor();
    }
  }

  private async getInstalledAppNames(): Promise<string[]> {
    try {
      await this.ensureExecutor();
      const apps = await this.executor!.listInstalledApps();
      return apps.map((a) => a.name);
    } catch {
      return [];
    }
  }

  private _isSystemKeyCombo(keys: string): boolean {
    const systemCombos = [
      "cmd+q", "cmd+shift+q", // Quit
      "cmd+tab", "cmd+shift+tab", // Switch app
      "ctrl+cmd+q", "ctrl+cmd+f", // Lock/fullscreen
      "cmd+option+esc", // Force quit
    ];

    const normalized = keys.toLowerCase().replace(/\s/g, "");
    return systemCombos.some(
      (combo) => normalized === combo || normalized.split("+").sort().join("+") === combo.split("+").sort().join("+")
    );
  }

  // ========================================================================
  // RUN
  // ========================================================================

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[${SERVER_NAME}] MCP server started`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const server = new ComputerUseServer();
  await server.run();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
