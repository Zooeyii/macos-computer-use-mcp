#!/bin/bash
#
# macOS Computer Use MCP Server - One-line Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Zooeyii/macos-computer-use-mcp/main/install.sh | bash
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[+]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[-]${NC} $1"; }
log_step() { echo -e "${BLUE}==>${NC} $1"; }

# Check platform
if [[ "$(uname)" != "Darwin" ]]; then
    log_error "This MCP server only works on macOS"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is required but not installed."
    log_info "Install from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
    log_error "Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

log_info "Node.js version: $(node -v)"

# Installation directory
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/macos-computer-use-mcp}"

log_step "Installing macOS Computer Use MCP Server..."
log_info "Installation directory: $INSTALL_DIR"

# Clone or download
if [[ -d "$INSTALL_DIR" ]]; then
    log_warn "Directory exists, updating..."
    cd "$INSTALL_DIR"
    git pull || true
else
    log_info "Cloning repository..."
    git clone https://github.com/Zooeyii/macos-computer-use-mcp.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
log_step "Installing dependencies..."
npm install

# Build
log_step "Building..."
npm run build

# Verify
if [[ ! -f "dist/cli.js" ]]; then
    log_error "Build failed - dist/cli.js not found"
    exit 1
fi

log_info "Build successful!"

# Generate MCP config snippet
CONFIG_SNIPPET=$(cat <<EOF
{
  "computer-use-standalone": {
    "type": "stdio",
    "command": "node",
    "args": ["${INSTALL_DIR}/dist/cli.js"]
  }
}
EOF
)

# Print success message
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Add this to your Claude Code MCP config (~/.claude/mcp.json):"
echo ""
echo -e "${YELLOW}$CONFIG_SNIPPET${NC}"
echo ""
echo "Or run directly:"
echo ""
echo -e "  ${BLUE}node ${INSTALL_DIR}/dist/cli.js${NC}"
echo ""
echo -e "${YELLOW}Important:${NC} Grant Accessibility permission to your terminal:"
echo "  System Settings → Privacy & Security → Accessibility"
echo ""
echo -e "${YELLOW}Optional:${NC} Grant Screen Recording for screenshots:"
echo "  System Settings → Privacy & Security → Screen Recording"
echo ""
