# macos-computer-use-mcp — 技术审查报告

## 审查时间

2026-03-31

---

## 工具完整性审查

### 核心工具清单（24 个）

| # | 工具名 | 实现状态 | 备注 |
|---|--------|---------|------|
| 1 | `request_access` | ✅ 完整 | |
| 2 | `screenshot` | ✅ 完整 | |
| 3 | `zoom` | ✅ 完整 | |
| 4 | `switch_display` | ✅ 完整 | |
| 5 | `left_click` | ✅ 完整 | |
| 6 | `double_click` | ✅ 完整 | |
| 7 | `triple_click` | ✅ 完整 | |
| 8 | `right_click` | ✅ 完整 | |
| 9 | `middle_click` | ✅ 完整 | |
| 10 | `type` | ✅ 完整 | |
| 11 | `key` | ✅ 完整 | 含 repeat 参数 |
| 12 | `hold_key` | ✅ 完整 | |
| 13 | `scroll` | ✅ 完整 | direction + amount |
| 14 | `left_click_drag` | ✅ 完整 | |
| 15 | `mouse_move` | ✅ 完整 | |
| 16 | `left_mouse_down` | ✅ 完整 | |
| 17 | `left_mouse_up` | ✅ 完整 | |
| 18 | `cursor_position` | ✅ 完整 | |
| 19 | `open_application` | ✅ 完整 | |
| 20 | `list_granted_applications` | ✅ 完整 | |
| 21 | `read_clipboard` | ✅ 完整 | |
| 22 | `write_clipboard` | ✅ 完整 | |
| 23 | `wait` | ✅ 完整 | |
| 24 | `computer_batch` | ✅ 完整 | 批量执行 |

**总体完整性：100%**（24/24 核心工具）

---

## 工具定义规格

### 坐标系统

```
coordinateMode: "pixels"
  x: Horizontal pixel position from the top-left corner of the screenshot
  y: Vertical pixel position from the top-left corner of the screenshot

coordinateMode: "normalized_0_100"
  x: Horizontal position as a percentage (0–100)
  y: Vertical position as a percentage (0–100)
```

### 工具参数验证

**`scroll` 参数规格：**
```
scroll_direction: enum ["up", "down", "left", "right"]
scroll_amount: integer, minimum: 0, maximum: 100
```

**`key` / `hold_key` 修饰键语法：**
```
modifier keys joined with "+", e.g. "cmd+shift+a", "ctrl+c"
```

**modifier 参数（点击类工具）：**
```
text: string — "Modifier keys to hold during the click (e.g. 'shift', 'ctrl+shift').
      Supports the same syntax as the key tool."
```

### `computer_batch` 支持的动作类型

```
"left_click" | "right_click" | "middle_click" | "double_click" | "triple_click"
"type" | "key" | "scroll" | "mouse_move" | "left_click_drag"
"screenshot" | "wait"
```

---

## 实现架构审查

### 执行器层级

| 层级 | 实现 | 依赖 |
|------|------|------|
| `NativeExecutor` | 使用 macOS native modules（高性能） | `@ant/computer-use-input`、`@ant/computer-use-swift` |
| `MacOsFallbackExecutor` | 使用系统工具（兼容性实现） | `osascript`、`screencapture`、`cliclick`（可选）|

当 native modules 不可用时，自动回退到 `MacOsFallbackExecutor`。

### 权限模型

- `screenshotFiltering`：截图是否在合成器层面过滤非授权应用
- `clipboardRead` / `clipboardWrite`：剪贴板权限独立申请
- `systemKeyCombos`：系统级快捷键（如 cmd+q、cmd+tab）需显式授权
- `grantedApps`：每个会话通过 `request_access` 建立应用白名单

---

## 关键发现

### 命名一致性

| 工具名 | 状态 |
|--------|------|
| `mouse_move` | ✅ 一致 |
| `left_click_drag` | ✅ 一致 |
| `open_application` | ✅ 已修正（之前曾为 `open_app`） |

### 教学模式工具（本项目不实现）

| 工具名 | 说明 |
|--------|------|
| `request_teach_access` | 依赖宿主 UI 层，独立 MCP 服务器不需要实现 |
| `teach_step` | 同上 |
| `teach_batch` | 同上 |

---

## 完整性评分

| 维度 | 得分 |
|------|------|
| 核心交互工具（点击、输入、滚动） | 100% |
| 显示管理（多显示器支持） | 100% |
| 剪贴板操作 | 100% |
| 批量操作 | 100% |
| 鼠标状态控制（down/up） | 100% |
| **总体** | **100%** |

---

## 文件清单

```
src/
├── cli.ts          # MCP 服务器入口、工具分发
├── tools.ts        # 24 个工具的 JSON Schema 定义
└── executor.ts     # NativeExecutor + MacOsFallbackExecutor

install.sh          # 一键安装脚本
package.json
tsconfig.json
tsup.config.ts
README.md
REVIEW.md           # 本文档
```
