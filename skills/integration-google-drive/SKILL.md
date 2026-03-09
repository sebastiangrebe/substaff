---
name: integration-google-drive
description: >
  Google Drive and Google Docs integration guide for Substaff agents. Use when
  working with Google Drive MCP tools — creating documents, sheets, or managing
  files on Drive. Covers formatting rules, authentication errors, and the
  createDocument workflow.
---

# Google Drive / Docs Integration

The Google Drive integration uses `@a-bonus/google-docs-mcp` which supports creating properly formatted Google Docs (with headings, bold, lists, tables, etc.), Sheets, and full Drive management.

## Key Rules

- When creating documents, use the `createDocument` tool with `contentFormat: "markdown"` to convert markdown to native Google Docs formatting — never upload raw markdown as plain text.
- If the MCP server fails to start or you get authentication errors, the credentials may be expired or misconfigured. Do NOT waste heartbeat time trying workarounds — mark the task as `blocked` immediately with clear instructions for the board to reconfigure the integration.
