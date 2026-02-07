# Centera Guidance MCP Server

Read-only MCP server that exposes Centera project guardrails, key docs/specs, and safe repo browsing tools (list/read/search).

## Usage

### Run locally (dev)

```bash
cd mcp/centera-guidance
npm install
npm run build
node dist/src/cli.js --repoRoot /absolute/path/to/centera
```

### Run via npx (published package)

```bash
npx -y centera-guidance-mcp@latest --repoRoot /absolute/path/to/centera
```

## Codex Configuration

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.centera-guidance]
type = "stdio"
command = "npx"
args = ["-y", "centera-guidance-mcp@latest", "--repoRoot", "/absolute/path/to/centera"]
startup_timeout_sec = 30
```

Or add it via Codex CLI:

```bash
codex mcp add centera-guidance -- npx -y centera-guidance-mcp@latest --repoRoot /absolute/path/to/centera
```

## Tools

- `centera_list_dir` - list directory contents under repo root
- `centera_read_file` - read a file under repo root (with size limits)
- `centera_search` - search within the repo (uses `rg` when available)
- `centera_guardrails_check` - advisory guardrail warnings based on touched file paths
- `centera_describe_architecture` - JSON snapshot of frontend features, backend modules, OpenAPI path, and OpenSpec specs

## Resources

The server exposes fixed guidance resources such as:

- `centera://docs/agents` -> `AGENTS.md`
- `centera://docs/claude` -> `CLAUDE.md`
- `centera://docs/openspec/agents` -> `openspec/AGENTS.md`
- `centera://docs/openapi` -> `backend/openapi/openapi.yaml`
