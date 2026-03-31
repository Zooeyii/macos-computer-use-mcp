# macos-computer-use-mcp

A standalone MCP server providing native macOS computer control — mouse, keyboard, screenshots, and app management — for any MCP-compatible agent.

## Compatibility

Works with any client that supports the [Model Context Protocol](https://modelcontextprotocol.io/), including:

- **Claude Code** (`claude mcp add`)
- **OpenAI Codex** (`~/.codex/config.toml`)
- **Cursor** (`~/.cursor/mcp.json`)
- Any other MCP-compatible agent or IDE

## How It Works

The server exposes macOS system control as MCP tools. Under the hood it uses macOS native modules for low-level input simulation and system APIs:

- **`@ant/computer-use-input`** — Low-level mouse and keyboard event injection
- **`@ant/computer-use-swift`** — macOS native APIs for display management, app control, and screenshots

The MCP server process communicates over stdio, so any agent can spawn it as a subprocess and call its tools via the standard JSON-RPC protocol.

## Available Tools (24)

| Tool | Description |
|------|-------------|
| `request_access` | Request Accessibility permission for an app |
| `screenshot` | Capture the full screen |
| `zoom` | Zoom into a screen region |
| `left_click` | Left-click at coordinates |
| `right_click` | Right-click at coordinates |
| `middle_click` | Middle-click at coordinates |
| `double_click` | Double-click at coordinates |
| `triple_click` | Triple-click at coordinates |
| `type` | Type a string of text |
| `key` | Press a key or key combination |
| `cursor_position` | Get current mouse position |
| `mouse_move` | Move the cursor to coordinates |
| `scroll` | Scroll at coordinates |
| `drag` | Drag from one point to another |
| `left_click_drag` | Left-click and drag |
| `get_display_size` | Get screen dimensions |
| `list_displays` | List all connected displays |
| `get_frontmost_app` | Get the currently active application |
| `list_installed_apps` | List all installed applications |
| `open_app` | Open an application by name or bundle ID |
| `close_app` | Close an application |
| `focus_app` | Bring an application to the foreground |
| `get_screen_content` | Get accessibility tree for screen content |
| `wait` | Wait for a specified duration |

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/Zooeyii/macos-computer-use-mcp/main/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/Zooeyii/macos-computer-use-mcp.git ~/.local/share/macos-computer-use-mcp
cd ~/.local/share/macos-computer-use-mcp
npm install
npm run build
```

## Configuration

### Claude Code

```bash
claude mcp add -s user computer-use-standalone node $HOME/.local/share/macos-computer-use-mcp/dist/cli.js
```

Or add to `~/.claude/mcp.json`:

```json
{
  "computer-use-standalone": {
    "type": "stdio",
    "command": "node",
    "args": ["$HOME/.local/share/macos-computer-use-mcp/dist/cli.js"]
  }
}
```

### OpenAI Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.computer-use-standalone]
command = "node"
args = ["$HOME/.local/share/macos-computer-use-mcp/dist/cli.js"]
```

Or via CLI:

```bash
codex mcp add computer-use-standalone -- node $HOME/.local/share/macos-computer-use-mcp/dist/cli.js
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "computer-use-standalone": {
      "command": "node",
      "args": ["$HOME/.local/share/macos-computer-use-mcp/dist/cli.js"]
    }
  }
}
```

## Requirements

- **macOS** (Darwin) — macOS-only due to native module dependencies
- **Node.js 18+**
- **Accessibility Permission** — Required for mouse/keyboard control
  - System Settings → Privacy & Security → Accessibility
- **Screen Recording Permission** — Required for screenshots
  - System Settings → Privacy & Security → Screen Recording

## Architecture

```
MCP Client (Claude Code / Codex / Cursor / any agent)
      │
      │  stdio (JSON-RPC / MCP protocol)
      │
      ▼
macos-computer-use-mcp (this server)
      │
      ├── MCP Server
      │     └── Tool handler
      │
      ├── Tool Definitions
      │     ├── Input tools (click, drag, scroll, type, key)
      │     ├── Screen tools (screenshot, zoom, display info)
      │     └── App tools (open, close, focus, list)
      │
      └── Executor
            │
            ├── @ant/computer-use-input.node
            │     └── Mouse / keyboard event injection
            │
            └── @ant/computer-use-swift
                  └── macOS native APIs
                        ├── App management
                        ├── Display control
                        └── Screenshot capture
```

## Project Structure

```
macos-computer-use-mcp/
├── src/
│   ├── cli.ts          # MCP server entry point
│   ├── tools.ts        # Tool definitions
│   └── executor.ts     # Platform implementations
├── install.sh          # One-line installer
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run directly
node dist/cli.js

# Type-check only
npm run typecheck
```

## Disclaimer

This project is for educational and research purposes.

Native module interfaces are based on publicly observable runtime behavior.

Use at your own risk. Only run in trusted environments — computer use grants full control of your mouse, keyboard, and screen.

## License

MIT
