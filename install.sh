#!/usr/bin/env bash
# ============================================================================
# Jump Start Framework Installer
# ============================================================================
# Installs the Jump Start spec-driven agentic coding framework into the
# current directory (or a specified target). Sets up all agent definitions,
# templates, Copilot integration files, and directory structure.
#
# Usage:
#   ./install.sh                    # Install into current directory
#   ./install.sh /path/to/project   # Install into specified directory
#   ./install.sh --help             # Show usage information
#
# What gets installed:
#   .jumpstart/          Framework core (agents, templates, config)
#   .github/             GitHub Copilot integration (agents, prompts, instructions)
#   specs/               Spec artifact directory (with subdirs)
#   src/                 Source code directory
#   tests/               Test directory
#   AGENTS.md            Root-level agent instructions (Copilot coding agent)
#   CLAUDE.md            Claude Code integration
#   .cursorrules         Cursor IDE integration
#   .gitignore           (only if one does not already exist)
# ============================================================================

set -euo pipefail

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Colours (disabled if not a terminal) ----
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ---- Helper functions ----
info()    { echo -e "${BLUE}[info]${NC}  $1"; }
success() { echo -e "${GREEN}[ok]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $1"; }
error()   { echo -e "${RED}[error]${NC} $1" >&2; }

show_help() {
    cat << 'EOF'
Jump Start Framework Installer v${VERSION}

USAGE
    ./install.sh [TARGET_DIR] [OPTIONS]

ARGUMENTS
    TARGET_DIR    Directory to install into (default: current directory)

OPTIONS
    --name NAME   Set the project name in config.yaml
    --force       Overwrite existing Jump Start files without prompting
    --copilot     Install only the GitHub Copilot integration files
    --dry-run     Show what would be installed without making changes
    --help        Show this help message

EXAMPLES
    ./install.sh
    ./install.sh ~/projects/my-app --name "My App"
    ./install.sh --copilot          # Add Copilot files to existing install
    ./install.sh --dry-run          # Preview changes
EOF
}

# ---- Parse arguments ----
TARGET_DIR="."
PROJECT_NAME=""
FORCE=false
COPILOT_ONLY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --help|-h)     show_help; exit 0 ;;
        --name)        PROJECT_NAME="$2"; shift 2 ;;
        --force)       FORCE=true; shift ;;
        --copilot)     COPILOT_ONLY=true; shift ;;
        --dry-run)     DRY_RUN=true; shift ;;
        -*)            error "Unknown option: $1"; show_help; exit 1 ;;
        *)             TARGET_DIR="$1"; shift ;;
    esac
done

# Resolve to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || echo "$TARGET_DIR")"

# ---- Verify source files exist ----
if [ ! -d "$SCRIPT_DIR/.jumpstart" ]; then
    error "Cannot find .jumpstart/ directory relative to the installer."
    error "Make sure install.sh is in the Jump Start framework root directory."
    exit 1
fi

# ---- Safe copy helper ----
# Copies a file, warning (or skipping) if the destination already exists
safe_copy() {
    local src="$1"
    local dst="$2"
    local rel_dst="${dst#$TARGET_DIR/}"

    if [ "$DRY_RUN" = true ]; then
        if [ -f "$dst" ]; then
            echo "  [overwrite] $rel_dst"
        else
            echo "  [create]    $rel_dst"
        fi
        return
    fi

    if [ -f "$dst" ] && [ "$FORCE" = false ]; then
        warn "Exists, skipping: $rel_dst (use --force to overwrite)"
        return
    fi

    local dir
    dir="$(dirname "$dst")"
    mkdir -p "$dir"
    cp "$src" "$dst"
    success "$rel_dst"
}

# Copies an entire directory tree
safe_copy_dir() {
    local src_dir="$1"
    local dst_dir="$2"

    find "$src_dir" -type f | while read -r src_file; do
        local rel="${src_file#$src_dir/}"
        safe_copy "$src_file" "$dst_dir/$rel"
    done
}

# ---- Banner ----
echo ""
echo -e "${BOLD}Jump Start Framework Installer v${VERSION}${NC}"
echo -e "Target: ${BLUE}${TARGET_DIR}${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}(dry run -- no files will be written)${NC}"
fi
echo ""

# ---- Create target directory if needed ----
if [ ! -d "$TARGET_DIR" ]; then
    if [ "$DRY_RUN" = true ]; then
        echo "  [mkdir]     $TARGET_DIR"
    else
        mkdir -p "$TARGET_DIR"
        info "Created $TARGET_DIR"
    fi
fi

# ---- Install framework core ----
if [ "$COPILOT_ONLY" = false ]; then
    echo -e "${BOLD}Installing framework core...${NC}"

    # .jumpstart/ directory (agents, templates, commands, config)
    safe_copy_dir "$SCRIPT_DIR/.jumpstart" "$TARGET_DIR/.jumpstart"

    # specs/ directory structure
    for dir in specs specs/decisions specs/research; do
        if [ "$DRY_RUN" = true ]; then
            echo "  [mkdir]     $dir/"
        else
            mkdir -p "$TARGET_DIR/$dir"
        fi
    done

    # src/ and tests/ directories
    for dir in src tests; do
        if [ "$DRY_RUN" = true ]; then
            echo "  [mkdir]     $dir/"
        else
            mkdir -p "$TARGET_DIR/$dir"
        fi
    done

    # .gitkeep files for empty directories
    for dir in specs/decisions specs/research src tests; do
        if [ "$DRY_RUN" = false ]; then
            touch "$TARGET_DIR/$dir/.gitkeep" 2>/dev/null || true
        fi
    done

    # Root-level tool integration files
    safe_copy "$SCRIPT_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
    safe_copy "$SCRIPT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
    safe_copy "$SCRIPT_DIR/.cursorrules" "$TARGET_DIR/.cursorrules"

    # README (only if none exists)
    if [ ! -f "$TARGET_DIR/README.md" ]; then
        safe_copy "$SCRIPT_DIR/README.md" "$TARGET_DIR/README.md"
    else
        warn "README.md already exists, skipping (framework README available in source)"
    fi

    # .gitignore (only if none exists)
    if [ -f "$SCRIPT_DIR/.gitignore" ] && [ ! -f "$TARGET_DIR/.gitignore" ]; then
        safe_copy "$SCRIPT_DIR/.gitignore" "$TARGET_DIR/.gitignore"
    fi

    echo ""
fi

# ---- Install GitHub Copilot integration ----
echo -e "${BOLD}Installing GitHub Copilot integration...${NC}"

# .github/copilot-instructions.md (always-on repo instructions)
safe_copy "$SCRIPT_DIR/.github/copilot-instructions.md" "$TARGET_DIR/.github/copilot-instructions.md"

# .github/agents/*.agent.md (custom agents, one per phase)
safe_copy_dir "$SCRIPT_DIR/.github/agents" "$TARGET_DIR/.github/agents"

# .github/prompts/*.prompt.md (utility prompts)
safe_copy_dir "$SCRIPT_DIR/.github/prompts" "$TARGET_DIR/.github/prompts"

# .github/instructions/*.instructions.md (file-specific instructions)
safe_copy_dir "$SCRIPT_DIR/.github/instructions" "$TARGET_DIR/.github/instructions"

echo ""

# ---- Set project name in config if provided ----
if [ -n "$PROJECT_NAME" ] && [ "$DRY_RUN" = false ] && [ -f "$TARGET_DIR/.jumpstart/config.yaml" ]; then
    # Use sed to replace the project name
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^  name: \"\"/  name: \"$PROJECT_NAME\"/" "$TARGET_DIR/.jumpstart/config.yaml"
    else
        sed -i "s/^  name: \"\"/  name: \"$PROJECT_NAME\"/" "$TARGET_DIR/.jumpstart/config.yaml"
    fi
    # Set created_at date
    local_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%d")
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^  created_at: \"\"/  created_at: \"$local_date\"/" "$TARGET_DIR/.jumpstart/config.yaml"
    else
        sed -i "s/^  created_at: \"\"/  created_at: \"$local_date\"/" "$TARGET_DIR/.jumpstart/config.yaml"
    fi
    success "Project name set to: $PROJECT_NAME"
    echo ""
fi

# ---- Skill Level Prompt (Item 76) ----
if [ -t 0 ] && [ -t 1 ] && [ "$DRY_RUN" = false ]; then
    echo ""
    echo -e "${BOLD}Experience Level${NC}"
    echo ""
    echo "  Jump Start adapts its explanations and hints to your skill level."
    echo "  1) beginner    — verbose explanations, all hints enabled"
    echo "  2) intermediate — balanced guidance (default)"
    echo "  3) expert      — minimal scaffolding, terse output"
    echo ""
    read -p "  Select your skill level [1-3, default 2]: " skill_choice
    case "$skill_choice" in
        1) SKILL_LEVEL="beginner" ;;
        3) SKILL_LEVEL="expert" ;;
        *) SKILL_LEVEL="intermediate" ;;
    esac

    CONFIG_FILE="$TARGET_DIR/.jumpstart/config.yaml"
    if [ -f "$CONFIG_FILE" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^  skill_level: \"intermediate\"/  skill_level: \"$SKILL_LEVEL\"/" "$CONFIG_FILE"
        else
            sed -i "s/^  skill_level: \"intermediate\"/  skill_level: \"$SKILL_LEVEL\"/" "$CONFIG_FILE"
        fi
        success "Skill level set to: $SKILL_LEVEL"
    fi
    echo ""
fi

# ---- Context7 MCP Integration (interactive) ----
if [ -t 0 ] && [ -t 1 ]; then
    echo ""
    echo -e "${BOLD}Context7 MCP Integration${NC}"
    echo ""
    echo "  Context7 provides up-to-date library documentation to your AI coding"
    echo "  assistant via the Model Context Protocol (MCP). This is optional."
    echo "  Get your API key at: https://context7.com"
    echo ""

    read -p "  Would you like to install the Context7 MCP? (y/n) " install_ctx7
    if [[ $install_ctx7 =~ ^[Yy]$ ]]; then
        read -p "  Enter your Context7 API key (ctx7sk-...): " context7_key

        # Validate key format
        if [[ ! "$context7_key" =~ ^ctx7sk- ]]; then
            warn "Invalid API key format. Context7 keys start with 'ctx7sk-'. Skipping."
        else
            CTX7_INSTALLED=false

            # Claude Code CLI
            if command -v claude &> /dev/null; then
                echo ""
                read -p "  Configure Context7 for Claude Code? (y/n) " use_claude
                if [[ $use_claude =~ ^[Yy]$ ]]; then
                    if [ "$DRY_RUN" = true ]; then
                        echo "  [dry-run] claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key <key>"
                    else
                        claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key "$context7_key" 2>/dev/null && \
                            success "Claude Code: Context7 MCP configured" || \
                            warn "Claude Code: Failed to configure (run the command manually)"
                        CTX7_INSTALLED=true
                    fi
                fi
            fi

            # VS Code (.vscode/mcp.json)
            read -p "  Configure Context7 for VS Code (GitHub Copilot)? (y/n) " use_vscode
            if [[ $use_vscode =~ ^[Yy]$ ]]; then
                VSCODE_MCP="$TARGET_DIR/.vscode/mcp.json"
                if [ "$DRY_RUN" = true ]; then
                    echo "  [dry-run] Write VS Code MCP config to .vscode/mcp.json"
                else
                    mkdir -p "$TARGET_DIR/.vscode"
                    # Create or merge into existing file
                    if [ -f "$VSCODE_MCP" ]; then
                        # Simple check: if context7 already exists, skip
                        if grep -q '"context7"' "$VSCODE_MCP" 2>/dev/null; then
                            warn "VS Code: context7 already configured in .vscode/mcp.json"
                        else
                            # Backup and rewrite (basic approach)
                            cp "$VSCODE_MCP" "${VSCODE_MCP}.bak"
                            warn "VS Code: Backed up existing .vscode/mcp.json to .vscode/mcp.json.bak"
                        fi
                    fi
                    if ! grep -q '"context7"' "$VSCODE_MCP" 2>/dev/null; then
                        cat > "$VSCODE_MCP" << VSEOF
{
  "servers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
VSEOF
                        success "VS Code: Context7 MCP configured in .vscode/mcp.json"
                        CTX7_INSTALLED=true
                    fi
                fi
            fi

            # Cursor (.cursor/mcp.json)
            read -p "  Configure Context7 for Cursor? (y/n) " use_cursor
            if [[ $use_cursor =~ ^[Yy]$ ]]; then
                CURSOR_MCP="$TARGET_DIR/.cursor/mcp.json"
                if [ "$DRY_RUN" = true ]; then
                    echo "  [dry-run] Write Cursor MCP config to .cursor/mcp.json"
                else
                    mkdir -p "$TARGET_DIR/.cursor"
                    if [ -f "$CURSOR_MCP" ] && grep -q '"context7"' "$CURSOR_MCP" 2>/dev/null; then
                        warn "Cursor: context7 already configured in .cursor/mcp.json"
                    else
                        [ -f "$CURSOR_MCP" ] && cp "$CURSOR_MCP" "${CURSOR_MCP}.bak"
                        cat > "$CURSOR_MCP" << CREOF
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "$context7_key"]
    }
  }
}
CREOF
                        success "Cursor: Context7 MCP configured in .cursor/mcp.json"
                        CTX7_INSTALLED=true
                    fi
                fi
            fi

            # Windsurf
            read -p "  Configure Context7 for Windsurf? (y/n) " use_windsurf
            if [[ $use_windsurf =~ ^[Yy]$ ]]; then
                if [ "$DRY_RUN" = true ]; then
                    echo "  [dry-run] Would configure Windsurf MCP"
                else
                    WINDSURF_DIR=""
                    if [[ "$OSTYPE" == "darwin"* ]]; then
                        WINDSURF_DIR="$HOME/.codeium/windsurf"
                    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
                        WINDSURF_DIR="${APPDATA:-$USERPROFILE}/.codeium/windsurf"
                    else
                        WINDSURF_DIR="$HOME/.codeium/windsurf"
                    fi
                    WINDSURF_MCP="$WINDSURF_DIR/mcp_config.json"
                    mkdir -p "$WINDSURF_DIR"
                    cat > "$WINDSURF_MCP" << WEOF
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "$context7_key"]
    }
  }
}
WEOF
                    success "Windsurf: Context7 MCP configured"
                    CTX7_INSTALLED=true
                fi
            fi

            # Update .gitignore
            if [ "$CTX7_INSTALLED" = true ] && [ "$DRY_RUN" = false ]; then
                GITIGNORE="$TARGET_DIR/.gitignore"
                CTX7_IGNORE_ENTRIES=(".vscode/mcp.json" ".cursor/mcp.json")
                for entry in "${CTX7_IGNORE_ENTRIES[@]}"; do
                    if [ -f "$GITIGNORE" ] && grep -qF "$entry" "$GITIGNORE"; then
                        : # Already present
                    else
                        echo "" >> "$GITIGNORE"
                        echo "# Context7 MCP config (contains API key)" >> "$GITIGNORE"
                        echo "$entry" >> "$GITIGNORE"
                    fi
                done
                info "Updated .gitignore with MCP config entries"
                echo ""
                echo -e "  ${YELLOW}⚠  Your API key is stored in local config files.${NC}"
                echo "  Make sure these files are in your .gitignore (already added)."
                echo ""
            fi
        fi
    else
        echo ""
        info "Skipped Context7 MCP setup."
        echo ""
    fi
fi

# ---- Summary ----
echo -e "${BOLD}Installation complete.${NC}"
echo ""
echo "Installed file layout:"
echo ""
echo "  .jumpstart/"
echo "    agents/              5 agent personas (challenger, analyst, pm, architect, developer)"
echo "    templates/           6 artifact templates + ADR template"
echo "    commands/            Slash command definitions"
echo "    config.yaml          Framework configuration"
echo ""
echo "  .github/"
echo "    copilot-instructions.md    Always-on repo instructions for Copilot"
echo "    agents/                    5 custom agents (selectable in Copilot chat)"
echo "    prompts/                   Utility prompts (status, review)"
echo "    instructions/              File-specific instructions for specs/"
echo ""
echo "  AGENTS.md              Agent instructions (Copilot coding agent, Copilot CLI)"
echo "  CLAUDE.md              Claude Code integration"
echo "  .cursorrules           Cursor IDE integration"
echo "  specs/                 Artifact output directory"
echo "  src/                   Source code directory"
echo "  tests/                 Test directory"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. Open the project in VS Code with GitHub Copilot installed"
echo "  2. Open Copilot Chat and select the agent dropdown"
echo "  3. Choose \"Jump Start: Challenger\" to begin Phase 0"
echo "  4. Describe your idea or problem when prompted"
echo ""
echo "  Alternatively, with Claude Code:  /jumpstart.challenge [your idea]"
echo "  Or check status any time:         Select the jumpstart-status prompt"
echo ""
