# Centera Guidance MCP (Remote, Vercel)

Remote MCP server endpoint for Centera guardrails + repo browsing, deployable to Vercel using Streamable HTTP.

## Endpoint

Once deployed, clients connect to:

`https://<deployment>/api/mcp`

## Authentication (Required)

This server requires a Bearer token.

Set `MCP_AUTH_TOKEN` in Vercel project Environment Variables.

## GitHub Source Configuration

The server browses a GitHub repository (committed code), not the Vercel filesystem.

You can use a **private** GitHub repo. In that case you must set `GITHUB_TOKEN` in Vercel.

Environment variables:

- `GITHUB_OWNER` (required)
- `GITHUB_REPO` (required)
- `GITHUB_REF` (optional, default: `main`) used for list/read (GitHub code search always targets the default branch)
- `GITHUB_TOKEN` (recommended; required for private repos and higher rate limits)

## Deploy To Vercel (Monorepo)

1. Create a new Vercel Project and import this GitHub repository.
2. In Vercel project settings, set **Root Directory** to `mcp/centera-guidance-remote`.
3. Set Environment Variables (Project -> Settings -> Environment Variables):
   - `MCP_AUTH_TOKEN` (required): a long random string
   - `GITHUB_OWNER` (required): GitHub org/user (example: `Cogneracz`)
   - `GITHUB_REPO` (required): repo name (example: `centera`)
   - `GITHUB_REF` (optional): branch or ref to read/list (example: `main`)
   - `GITHUB_TOKEN` (required for private repos): a GitHub token with read access to the repo
4. Deploy. The MCP URL will be `https://<deployment>/api/mcp`.

## Local Development

```bash
cd mcp/centera-guidance-remote
npm install
export MCP_AUTH_TOKEN="change-me"
export GITHUB_OWNER="your-org"
export GITHUB_REPO="centera"
export GITHUB_REF="main"
export GITHUB_TOKEN="ghp_..." # optional for public
npm run dev
```

## Codex Setup (Remote URL)

```bash
export CENTERA_MCP_TOKEN="change-me"
codex mcp add centera-guidance-remote --bearer-token-env-var CENTERA_MCP_TOKEN --url https://<deployment>/api/mcp
```

## Notes

- Streamable HTTP is the recommended transport for remote MCP servers.
- The server is read-only and limited to GitHub content.

## High-Value Navigation Tools

These tools are designed to keep the assistant aligned with Centera conventions by resolving which instruction files apply to a given path:

- `centera_list_instruction_files` (optional `includeReadme`) lists instruction files across the repo.
- `centera_get_instruction_tree` returns parent/child relationships between instruction-bearing directories.
- `centera_get_effective_instructions` returns the ordered instruction files (root -> deepest) and a merged view (and/or summary) for a given repo path.
- `centera_bootstrap` returns a one-call context bundle (effective instructions + architecture + playbooks + suggested next calls).
