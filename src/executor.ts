/**
 * Computer Use Executor - macOS Platform Implementation
 *
 * Supports both native macOS modules and osascript-based fallback implementations.
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { platform } from "os";
import * as fs from "fs/promises";
import * as path from "path";

const execFileAsync = promisify(execFile);

// ============================================================================
// TYPES
// ============================================================================

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface AppInfo {
  bundleId: string;
  name: string;
  path?: string;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface ScreenshotResult {
  data: string; // base64
  width: number;
  height: number;
  scaleFactor: number;
  displayId: number;
  displayNames: string[];
  otherDisplays: string[];
}

export interface AccessRequestResult {
  granted: string[];
  denied: string[];
  screenshotFiltering: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  systemKeyCombos: boolean;
}

export interface SessionState {
  grantedApps: Set<string>;
  screenshotFiltering: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  systemKeyCombos: boolean;
  currentDisplay: string | "auto";
}

export interface Executor {
  // === Permissions ===
  checkAccessibility(): Promise<boolean>;
  checkScreenRecording(): Promise<boolean>;

  // === Display ===
  screenshot(saveToDisk?: boolean, displayId?: number | "auto"): Promise<ScreenshotResult>;
  zoom(region: { x: number; y: number; w: number; h: number }, saveToDisk?: boolean): Promise<{ data: string; path?: string }>;
  listDisplays(): Promise<DisplayInfo[]>;
  switchDisplay(display: string | "auto"): Promise<void>;
  getDisplaySize(displayId?: number): Promise<{ width: number; height: number; scaleFactor: number }>;

  // === Mouse ===
  leftClick(x: number, y: number, modifiers?: string[]): Promise<void>;
  doubleClick(x: number, y: number, modifiers?: string[]): Promise<void>;
  tripleClick(x: number, y: number, modifiers?: string[]): Promise<void>;
  rightClick(x: number, y: number, modifiers?: string[]): Promise<void>;
  middleClick(x: number, y: number, modifiers?: string[]): Promise<void>;
  mouseMove(x: number, y: number): Promise<void>;
  leftMouseDown(): Promise<void>;
  leftMouseUp(): Promise<void>;
  leftClickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void>;
  scroll(x: number, y: number, direction: "up" | "down" | "left" | "right", amount: number): Promise<void>;
  cursorPosition(): Promise<CursorPosition>;

  // === Keyboard ===
  type(text: string): Promise<void>;
  key(keys: string, repeat?: number): Promise<void>;
  holdKey(keys: string, durationSeconds: number): Promise<void>;

  // === Clipboard ===
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  // === Applications ===
  listInstalledApps(): Promise<AppInfo[]>;
  listRunningApps(): Promise<AppInfo[]>;
  getFrontmostApp(): Promise<AppInfo | null>;
  openApplication(bundleIdOrName: string): Promise<void>;
  appUnderPoint(x: number, y: number): Promise<AppInfo | null>;

  // === Utility ===
  wait(seconds: number): Promise<void>;
}

// ============================================================================
// MACOS FALLBACK EXECUTOR (using osascript/screencapture)
// ============================================================================

export class MacOsFallbackExecutor implements Executor {
  private lastScreenshot: Buffer | null = null;
  private lastScreenshotMeta: {
    width: number;
    height: number;
    scaleFactor: number;
    displayId: number;
  } | null = null;
  private mouseButtonDown = false;
  private currentDisplay: string | "auto" = "auto";

  // === Permissions ===

  async checkAccessibility(): Promise<boolean> {
    try {
      await execFileAsync("osascript", ["-e", 'tell application "System Events" to get name of first process']);
      return true;
    } catch {
      return false;
    }
  }

  async checkScreenRecording(): Promise<boolean> {
    try {
      // Try to take a small screenshot
      const { stdout } = await execFileAsync("screencapture", ["-x", "-t", "png", "-"], {
        encoding: "buffer",
        maxBuffer: 1024 * 1024,
      });
      return stdout.length > 0;
    } catch {
      return false;
    }
  }

  // === Display ===

  async screenshot(saveToDisk?: boolean, displayId?: number | "auto"): Promise<ScreenshotResult> {
    const args = ["-x", "-t", "png", "-"];

    // Note: display selection via screencapture -D is limited
    // Full implementation would use CGDisplay APIs

    const { stdout } = await execFileAsync("screencapture", args, {
      encoding: "buffer",
      maxBuffer: 100 * 1024 * 1024,
    });

    this.lastScreenshot = stdout;

    // Get display info
    const displays = await this.listDisplays();
    const primary = displays.find((d) => d.isPrimary) || displays[0];

    this.lastScreenshotMeta = {
      width: primary?.width || 1920,
      height: primary?.height || 1080,
      scaleFactor: primary?.scaleFactor || 2,
      displayId: primary?.id || 0,
    };

    let savedPath: string | undefined;
    if (saveToDisk) {
      const tmpPath = path.join("/tmp", `screenshot-${Date.now()}.png`);
      await fs.writeFile(tmpPath, stdout);
      savedPath = tmpPath;
    }

    return {
      data: stdout.toString("base64"),
      width: this.lastScreenshotMeta.width,
      height: this.lastScreenshotMeta.height,
      scaleFactor: this.lastScreenshotMeta.scaleFactor,
      displayId: this.lastScreenshotMeta.displayId,
      displayNames: displays.map((d) => d.name),
      otherDisplays: displays.filter((d) => !d.isPrimary).map((d) => d.name),
    };
  }

  async zoom(region: { x: number; y: number; w: number; h: number }, saveToDisk?: boolean): Promise<{ data: string; path?: string }> {
    if (!this.lastScreenshot) {
      await this.screenshot();
    }

    // Use sips to crop
    const tmpIn = path.join("/tmp", `zoom-in-${Date.now()}.png`);
    const tmpOut = path.join("/tmp", `zoom-out-${Date.now()}.png`);

    await fs.writeFile(tmpIn, this.lastScreenshot!);

    await execFileAsync("sips", [
      "--cropToRectWidth", String(region.w),
      "--cropToRectHeight", String(region.h),
      "--cropToRectX", String(region.x),
      "--cropToRectY", String(region.y),
      "-s", "format", "png",
      tmpIn,
      "--out", tmpOut,
    ]);

    const data = await fs.readFile(tmpOut);
    const base64 = data.toString("base64");

    // Cleanup
    await fs.unlink(tmpIn).catch(() => {});
    await fs.unlink(tmpOut).catch(() => {});

    let savedPath: string | undefined;
    if (saveToDisk) {
      savedPath = path.join("/tmp", `zoom-${Date.now()}.png`);
      await fs.writeFile(savedPath, data);
    }

    return { data: base64, path: savedPath };
  }

  async listDisplays(): Promise<DisplayInfo[]> {
    try {
      const { stdout } = await execFileAsync("system_profiler", ["SPDisplaysDataType"]);

      const displays: DisplayInfo[] = [];
      const lines = stdout.split("\n");
      let currentDisplay: Partial<DisplayInfo> = {};
      let displayIndex = 0;

      for (const line of lines) {
        if (line.includes("Display Type:") || line.includes("Resolution:")) {
          if (line.includes("Resolution:")) {
            const match = line.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
            if (match) {
              currentDisplay.width = parseInt(match[1]);
              currentDisplay.height = parseInt(match[2]);
            }
          }
        }

        if (line.includes("Display:") && !line.includes("Display Type")) {
          if (currentDisplay.width) {
            displays.push({
              id: displayIndex++,
              name: currentDisplay.name || `Display ${displayIndex}`,
              width: currentDisplay.width || 1920,
              height: currentDisplay.height || 1080,
              scaleFactor: 2,
              isPrimary: displayIndex === 1,
            });
          }
          currentDisplay = {};
          const nameMatch = line.match(/Display:\s*(.+)/);
          if (nameMatch) {
            currentDisplay.name = nameMatch[1].trim();
          }
        }
      }

      // Add last display
      if (currentDisplay.width) {
        displays.push({
          id: displayIndex,
          name: currentDisplay.name || `Display ${displayIndex + 1}`,
          width: currentDisplay.width,
          height: currentDisplay.height,
          scaleFactor: 2,
          isPrimary: displays.length === 0,
        });
      }

      return displays.length > 0 ? displays : [{ id: 0, name: "Primary Display", width: 1920, height: 1080, scaleFactor: 2, isPrimary: true }];
    } catch {
      return [{ id: 0, name: "Primary Display", width: 1920, height: 1080, scaleFactor: 2, isPrimary: true }];
    }
  }

  async switchDisplay(display: string | "auto"): Promise<void> {
    this.currentDisplay = display;
  }

  async getDisplaySize(displayId?: number): Promise<{ width: number; height: number; scaleFactor: number }> {
    const displays = await this.listDisplays();
    const display = displayId !== undefined
      ? displays.find((d) => d.id === displayId)
      : displays.find((d) => d.isPrimary);
    return {
      width: display?.width || 1920,
      height: display?.height || 1080,
      scaleFactor: display?.scaleFactor || 2,
    };
  }

  // === Mouse ===

  async leftClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this._click(x, y, "left", 1, modifiers);
  }

  async doubleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this._click(x, y, "left", 2, modifiers);
  }

  async tripleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this._click(x, y, "left", 3, modifiers);
  }

  async rightClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this._click(x, y, "right", 1, modifiers);
  }

  async middleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this._click(x, y, "center", 1, modifiers);
  }

  private async _click(x: number, y: number, button: string, clickCount: number, modifiers?: string[]): Promise<void> {
    // Use cliclick for better mouse control if available, otherwise osascript
    const hasCliclick = await this._checkCommand("cliclick");

    if (hasCliclick) {
      const modStr = modifiers?.map((m) => this._mapModifier(m)).join("") || "";
      const clickCmd = clickCount === 2 ? "dc" : clickCount === 3 ? "tc" : "c";
      await execFileAsync("cliclick", [`${modStr}${clickCmd}:${x},${y}`]);
    } else {
      // Fallback to osascript - limited click support
      await this.mouseMove(x, y);
      const btn = button === "right" ? "right click" : "click";
      for (let i = 0; i < clickCount; i++) {
        await execFileAsync("osascript", ["-e", `tell application "System Events" to ${btn}`]);
        if (i < clickCount - 1) await this._sleep(50);
      }
    }
  }

  async mouseMove(x: number, y: number): Promise<void> {
    const hasCliclick = await this._checkCommand("cliclick");
    if (hasCliclick) {
      await execFileAsync("cliclick", [`m:${x},${y}`]);
    } else {
      // osascript doesn't support direct mouse move
      console.error("[fallback] mouse_move not fully supported without cliclick");
    }
  }

  async leftMouseDown(): Promise<void> {
    this.mouseButtonDown = true;
    const hasCliclick = await this._checkCommand("cliclick");
    if (hasCliclick) {
      await execFileAsync("cliclick", ["md:left"]);
    }
  }

  async leftMouseUp(): Promise<void> {
    this.mouseButtonDown = false;
    const hasCliclick = await this._checkCommand("cliclick");
    if (hasCliclick) {
      await execFileAsync("cliclick", ["mu:left"]);
    }
  }

  async leftClickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    const hasCliclick = await this._checkCommand("cliclick");
    if (hasCliclick) {
      await execFileAsync("cliclick", [`dd:${startX},${startX}`, `dm:${endX},${endY}`, `du:${endX},${endY}`]);
    } else {
      await this.mouseMove(startX, startY);
      await this.leftMouseDown();
      await this._sleep(50);
      await this.mouseMove(endX, endY);
      await this._sleep(50);
      await this.leftMouseUp();
    }
  }

  async scroll(x: number, y: number, direction: "up" | "down" | "left" | "right", amount: number): Promise<void> {
    await this.mouseMove(x, y);
    const hasCliclick = await this._checkCommand("cliclick");

    if (hasCliclick) {
      const scrollCmd = direction === "up" ? "scroll-up" : direction === "down" ? "scroll-down" : direction;
      await execFileAsync("cliclick", [`${scrollCmd}:${amount}`]);
    } else {
      // osascript scroll is very limited
      const scrollScript = direction === "up"
        ? `tell application "System Events" to key code 126 using {shift down}`
        : `tell application "System Events" to key code 125 using {shift down}`;

      for (let i = 0; i < amount; i++) {
        await execFileAsync("osascript", ["-e", scrollScript]);
        await this._sleep(20);
      }
    }
  }

  async cursorPosition(): Promise<CursorPosition> {
    // Requires native code - return center as fallback
    const size = await this.getDisplaySize();
    return { x: size.width / 2, y: size.height / 2 };
  }

  // === Keyboard ===

  async type(text: string): Promise<void> {
    const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to keystroke "${escapedText}"`,
    ]);
  }

  async key(keys: string, repeat: number = 1): Promise<void> {
    const parts = keys.split("+");
    const key = parts.pop()!;
    const modifiers = parts.map((m) => this._mapModifierForOSA(m));

    const keyCode = this._getKeyCode(key);

    for (let i = 0; i < repeat; i++) {
      if (modifiers.length > 0) {
        await execFileAsync("osascript", [
          "-e",
          `tell application "System Events" to key code ${keyCode} using {${modifiers.join(", ")}}`,
        ]);
      } else {
        await execFileAsync("osascript", [
          "-e",
          `tell application "System Events" to key code ${keyCode}`,
        ]);
      }
      if (i < repeat - 1) await this._sleep(50);
    }
  }

  async holdKey(keys: string, durationSeconds: number): Promise<void> {
    const parts = keys.split("+");
    const keyCode = this._getKeyCode(parts.pop()!);
    const modifiers = parts.map((m) => this._mapModifierForOSA(m));

    // Press down
    if (modifiers.length > 0) {
      await execFileAsync("osascript", [
        "-e",
        `tell application "System Events" to key down {${modifiers.join(", ")}}`,
      ]);
    }
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to key down (key code ${keyCode})`,
    ]);

    // Wait
    await this._sleep(durationSeconds * 1000);

    // Release
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to key up (key code ${keyCode})`,
    ]);
    if (modifiers.length > 0) {
      await execFileAsync("osascript", [
        "-e",
        `tell application "System Events" to key up {${modifiers.join(", ")}}`,
      ]);
    }
  }

  // === Clipboard ===

  async readClipboard(): Promise<string> {
    const { stdout } = await execFileAsync("pbpaste", []);
    return stdout;
  }

  async writeClipboard(text: string): Promise<void> {
    await execFileAsync("pbcopy", [], { input: text });
  }

  // === Applications ===

  async listInstalledApps(): Promise<AppInfo[]> {
    const { stdout } = await execFileAsync("mdfind", [
      "kMDItemKind == 'Application'",
    ]);

    const apps: AppInfo[] = [];
    const seen = new Set<string>();

    for (const appPath of stdout.trim().split("\n").filter(Boolean)) {
      const name = path.basename(appPath, ".app");
      if (!seen.has(name)) {
        seen.add(name);
        apps.push({ bundleId: name, name, path: appPath });
      }
    }

    return apps;
  }

  async listRunningApps(): Promise<AppInfo[]> {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get name of every process whose background only is false',
    ]);

    return stdout.trim().split(", ").map((name) => ({ bundleId: name, name }));
  }

  async getFrontmostApp(): Promise<AppInfo | null> {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get name of first process whose frontmost is true',
    ]);

    const name = stdout.trim();
    return { bundleId: name, name };
  }

  async openApplication(bundleIdOrName: string): Promise<void> {
    await execFileAsync("open", ["-a", bundleIdOrName]);
  }

  async appUnderPoint(x: number, y: number): Promise<AppInfo | null> {
    // Requires native CGWindowListCopyWindowInfo - not available via CLI
    return null;
  }

  // === Utility ===

  async wait(seconds: number): Promise<void> {
    await this._sleep(seconds * 1000);
  }

  // === Private Helpers ===

  private async _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async _checkCommand(cmd: string): Promise<boolean> {
    try {
      await execFileAsync("which", [cmd]);
      return true;
    } catch {
      return false;
    }
  }

  private _mapModifier(mod: string): string {
    const map: Record<string, string> = {
      cmd: "m",
      command: "m",
      ctrl: "c",
      control: "c",
      alt: "a",
      option: "a",
      opt: "a",
      shift: "s",
      fn: "f",
    };
    return map[mod.toLowerCase()] || "";
  }

  private _mapModifierForOSA(mod: string): string {
    const map: Record<string, string> = {
      cmd: "command down",
      command: "command down",
      ctrl: "control down",
      control: "control down",
      alt: "option down",
      option: "option down",
      opt: "option down",
      shift: "shift down",
      fn: "function down",
    };
    return map[mod.toLowerCase()] || "";
  }

  private _getKeyCode(key: string): number {
    const keyCodes: Record<string, number> = {
      a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38, k: 40, l: 37,
      m: 46, n: 45, o: 31, p: 35, q: 12, r: 15, s: 1, t: 17, u: 32, v: 9, w: 13,
      x: 7, y: 16, z: 6,
      "0": 29, "1": 18, "2": 19, "3": 20, "4": 21, "5": 23, "6": 22, "7": 26, "8": 28, "9": 25,
      return: 36, enter: 36, tab: 48, space: 49, delete: 51, escape: 53, esc: 53,
      f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
      home: 115, end: 119, pageup: 116, pagedown: 121,
      left: 123, right: 124, down: 125, up: 126,
    };
    return keyCodes[key.toLowerCase()] ?? key.charCodeAt(0);
  }
}

// ============================================================================
// NATIVE EXECUTOR (uses macOS native modules)
// ============================================================================

export class NativeExecutor implements Executor {
  private input: any;
  private swift: any;

  constructor(inputModule: any, swiftModule: any) {
    this.input = inputModule;
    this.swift = swiftModule;
  }

  // === Permissions ===
  async checkAccessibility(): Promise<boolean> {
    return this.swift.tcc.checkAccessibility();
  }

  async checkScreenRecording(): Promise<boolean> {
    return this.swift.tcc.checkScreenRecording();
  }

  // === Display ===
  async screenshot(saveToDisk?: boolean, displayId?: number | "auto"): Promise<ScreenshotResult> {
    const id = displayId === "auto" ? undefined : (displayId as number);
    const size = await this.swift.display.getSize(id ?? 0);
    const result = await this.swift.screenshot.captureExcluding([], 0.75, size.width, size.height, id);

    return {
      data: result.data.toString("base64"),
      width: size.width,
      height: size.height,
      scaleFactor: size.scaleFactor,
      displayId: id ?? 0,
      displayNames: ["Primary Display"],
      otherDisplays: [],
    };
  }

  async zoom(region: { x: number; y: number; w: number; h: number }, saveToDisk?: boolean): Promise<{ data: string; path?: string }> {
    const size = await this.swift.display.getSize(0);
    const result = await this.swift.screenshot.captureRegion(
      [],
      region.x,
      region.y,
      region.w,
      region.h,
      size.width,
      size.height,
      0.75,
      0
    );
    return { data: result.data.toString("base64") };
  }

  async listDisplays(): Promise<DisplayInfo[]> {
    return this.swift.display.listAll();
  }

  async switchDisplay(display: string | "auto"): Promise<void> {
    // Handled at higher level
  }

  async getDisplaySize(displayId?: number): Promise<{ width: number; height: number; scaleFactor: number }> {
    return this.swift.display.getSize(displayId ?? 0);
  }

  // === Mouse ===
  async leftClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this.input.moveMouse(x, y, false);
    if (modifiers?.length) {
      await this._withModifiers(modifiers, () => this.input.mouseButton("left", "click", 1));
    } else {
      await this.input.mouseButton("left", "click", 1);
    }
  }

  async doubleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this.input.moveMouse(x, y, false);
    await this.input.mouseButton("left", "click", 2);
  }

  async tripleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this.input.moveMouse(x, y, false);
    await this.input.mouseButton("left", "click", 3);
  }

  async rightClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this.input.moveMouse(x, y, false);
    await this.input.mouseButton("right", "click", 1);
  }

  async middleClick(x: number, y: number, modifiers?: string[]): Promise<void> {
    await this.input.moveMouse(x, y, false);
    await this.input.mouseButton("center", "click", 1);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.input.moveMouse(x, y, false);
  }

  async leftMouseDown(): Promise<void> {
    await this.input.mouseButton("left", "press");
  }

  async leftMouseUp(): Promise<void> {
    await this.input.mouseButton("left", "release");
  }

  async leftClickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    await this.input.moveMouse(startX, startY, false);
    await this.input.mouseButton("left", "press");
    await this._sleep(50);
    await this.input.moveMouse(endX, endY, true);
    await this.input.mouseButton("left", "release");
  }

  async scroll(x: number, y: number, direction: "up" | "down" | "left" | "right", amount: number): Promise<void> {
    await this.input.moveMouse(x, y, false);
    if (direction === "up" || direction === "down") {
      await this.input.mouseScroll(direction === "down" ? amount : -amount, "vertical");
    } else {
      await this.input.mouseScroll(direction === "right" ? amount : -amount, "horizontal");
    }
  }

  async cursorPosition(): Promise<CursorPosition> {
    return this.input.mouseLocation();
  }

  // === Keyboard ===
  async type(text: string): Promise<void> {
    await this.input.typeText(text);
  }

  async key(keys: string, repeat: number = 1): Promise<void> {
    const parts = keys.split("+");
    for (let i = 0; i < repeat; i++) {
      await this.input.keys(parts);
      if (i < repeat - 1) await this._sleep(50);
    }
  }

  async holdKey(keys: string, durationSeconds: number): Promise<void> {
    const parts = keys.split("+");
    for (const k of parts) {
      await this.input.key(k, "press");
    }
    await this._sleep(durationSeconds * 1000);
    for (const k of parts.reverse()) {
      await this.input.key(k, "release");
    }
  }

  // === Clipboard ===
  async readClipboard(): Promise<string> {
    const { stdout } = await execFileAsync("pbpaste", []);
    return stdout;
  }

  async writeClipboard(text: string): Promise<void> {
    await execFileAsync("pbcopy", [], { input: text });
  }

  // === Applications ===
  async listInstalledApps(): Promise<AppInfo[]> {
    const apps = await this.swift.apps.listInstalled();
    return apps.map((a: any) => ({ bundleId: a.bundleId, name: a.appName }));
  }

  async listRunningApps(): Promise<AppInfo[]> {
    const apps = await this.swift.apps.listRunning();
    return apps.map((a: any) => ({ bundleId: a.bundleId, name: a.appName }));
  }

  async getFrontmostApp(): Promise<AppInfo | null> {
    const info = this.input.getFrontmostAppInfo();
    if (!info?.bundleId) return null;
    return { bundleId: info.bundleId, name: info.appName };
  }

  async openApplication(bundleIdOrName: string): Promise<void> {
    await this.swift.apps.open(bundleIdOrName);
  }

  async appUnderPoint(x: number, y: number): Promise<AppInfo | null> {
    const app = await this.swift.apps.appUnderPoint(x, y);
    if (!app) return null;
    return { bundleId: app.bundleId, name: app.appName };
  }

  // === Utility ===
  async wait(seconds: number): Promise<void> {
    await this._sleep(seconds * 1000);
  }

  private async _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async _withModifiers(modifiers: string[], action: () => Promise<void>): Promise<void> {
    for (const m of modifiers) {
      await this.input.key(m, "press");
    }
    try {
      await action();
    } finally {
      for (const m of modifiers.reverse()) {
        await this.input.key(m, "release");
      }
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let nativeInputModule: any = null;
let nativeSwiftModule: any = null;

export async function createExecutor(): Promise<Executor> {
  if (platform() !== "darwin") {
    throw new Error("Computer use is only supported on macOS");
  }

  // Try to load native modules
  try {
    // Attempt to load native modules from known paths
    const possiblePaths = [
      process.env.COMPUTER_USE_NATIVE_PATH,
    ];

    for (const cliPath of possiblePaths) {
      if (cliPath) {
        try {
          // Native modules are bundled, we'd need to extract them
          // For now, use fallback
          break;
        } catch {}
      }
    }
  } catch {}

  // Fall back to osascript-based implementation
  console.error("[computer-use] Using fallback executor (requires cliclick for full functionality)");
  console.error("[computer-use] Install cliclick: brew install cliclick");

  return new MacOsFallbackExecutor();
}

export async function createNativeExecutor(): Promise<NativeExecutor | null> {
  if (!nativeInputModule || !nativeSwiftModule) {
    return null;
  }
  return new NativeExecutor(nativeInputModule, nativeSwiftModule);
}

// Re-export types
export type { DisplayInfo, AppInfo, CursorPosition, ScreenshotResult, AccessRequestResult, SessionState, Executor as ExecutorInterface };
