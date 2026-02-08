# MCP Retail

This repository contains two MCP servers intended to help AI coding tools follow Centera project guardrails and architecture.

## Packages

- `mcp/centera-guidance/` (local, stdio): read-only repo browsing + guardrails for a local Centera checkout
- `mcp/centera-guidance-remote/` (remote, Streamable HTTP): deployable to Vercel; browses a configured GitHub repo

## What The MCP Server Can Do

Tools (both local + remote):

- `centera_list_dir`: list directory entries
- `centera_read_file`: read a file (size-limited)
- `centera_search`: search for code (local uses `rg` when available; remote uses GitHub code search)
- `centera_guardrails_check`: advisory warnings for risky paths (generated code, i18n, OpenAPI-first, etc.)
- `centera_describe_architecture`: JSON snapshot (frontend features, backend modules, OpenAPI path, OpenSpec specs)

Remote-only (navigation helpers):

- `centera_list_instruction_files`: list instruction files (`AGENTS.md`, `CLAUDE.md`, optionally `README.md`)
- `centera_get_instruction_tree`: parent/child relationships between instruction-bearing directories
- `centera_get_effective_instructions`: compute effective instructions for a target path (root -> deepest), returning merged markdown and/or summary
- `centera_bootstrap`: one-call context bundle (instructions + architecture + playbooks + suggested next calls)

Resources (remote also exposes these via GitHub):

- `centera://docs/agents`, `centera://docs/claude`, `centera://docs/openspec/agents`, `centera://docs/openapi`, etc.
- UI/navigation helpers: `centera://docs/frontend/detail-layout`, `centera://docs/frontend/save-actions`, etc.

Prompts:

- `centera_frontend_change`, `centera_backend_change`, `centera_openapi_change`

## Deploy And Test On Vercel

Deploy the Next.js app under `mcp/centera-guidance-remote/` and set these env vars in Vercel:

- `MCP_AUTH_TOKEN` (required)
- `GITHUB_OWNER` (required)
- `GITHUB_REPO` (required)
- `GITHUB_REF` (optional, default: `main`)
- `GITHUB_TOKEN` (recommended; required for private repos and higher rate limits)

The MCP endpoint will be:

`https://<deployment>/api/mcp`

### Smoke Test (After Deploy)

From your machine (requires Node 20+ and `npm install` in `mcp/centera-guidance-remote/`):

```bash
cd mcp/centera-guidance-remote
npm install

export MCP_URL="https://<deployment>/api/mcp"
export MCP_TOKEN="your MCP_AUTH_TOKEN"

node -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const t=new StreamableHTTPClientTransport(new URL(process.env.MCP_URL),{requestInit:{headers:{Authorization:'Bearer '+process.env.MCP_TOKEN}}}); const c=new Client({name:'mcp-retail-smoke',version:'0.0.0'}); await c.connect(t); const tools=await c.listTools(); console.log(tools.tools.map(x=>x.name)); const arch=await c.callTool({name:'centera_describe_architecture',arguments:{}}); console.log(arch.content?.[0]?.type); await c.close();"
```

### Codex Setup (Remote URL)

```bash
export CENTERA_MCP_TOKEN="your MCP_AUTH_TOKEN"
codex mcp add centera-guidance-remote --bearer-token-env-var CENTERA_MCP_TOKEN --url https://<deployment>/api/mcp
```
