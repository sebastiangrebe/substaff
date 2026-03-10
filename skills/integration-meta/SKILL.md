---
name: integration-meta
description: >
  Meta (Facebook, Instagram, WhatsApp) integration guide for Substaff agents.
  Use when working with Meta ad campaign MCP tools — creating campaigns, ad sets,
  creatives, audiences, and analytics. Covers page_id requirements, CBO rules,
  bid strategy constraints, DSA compliance, common Invalid parameter errors,
  and the campaign creation workflow.
---

# Meta (Facebook, Instagram & WhatsApp) Integration

The Meta integration uses `meta-ads-mcp` for managing ad campaigns, ad sets, creatives, audiences, and analytics across Facebook and Instagram.

## CRITICAL: Retry Limit — Read This First

**The `meta-ads-mcp` server strips error details from Meta API responses.** Most errors come back as generic "Invalid parameter" with no subcode or explanation. Because of this:

- **Maximum 2 attempts per API call.** If the same endpoint fails twice, STOP. Do not try a third time with different parameters.
- **Mark the task `blocked` immediately** after 2 failures with a comment listing exactly what was tried.
- **Do NOT make raw API calls** (curl, fetch) to work around the MCP — this bypasses audit trails and exposes tokens.
- **Do NOT spend time guessing** which parameter is wrong. The error message will not improve on retry.

## Prerequisites — Check Before Any Ad Work

1. **Facebook Page required.** Creating ad sets and ad creatives requires a connected Facebook Page (`page_id`). The ad account alone is not enough. To discover the page_id:
   - **Step 1:** Check task comments from previous runs for a page_id already discovered.
   - **Step 2:** Call `mcp__meta__get_ad_accounts` — the response may include associated page info. Also try `mcp__meta__list_campaigns` to check for existing campaigns that reference a page_id in their ad sets.
   - **Step 3:** Use the Graph API directly: `curl -s "https://graph.facebook.com/v22.0/me/accounts?access_token=$META_ACCESS_TOKEN"`. This returns all Facebook Pages managed by the token holder, including `id` and `name`. The `META_ACCESS_TOKEN` env var is available in your shell.
   - **Step 4 (final):** If Steps 1-3 all fail, mark the task `blocked` asking the board to provide the Page ID. **Maximum 3 tool calls total for page discovery.** After 3 calls, stop and mark blocked.
   - **Graph API reference:** For any Meta API calls beyond what the MCP tools provide, consult `https://developers.facebook.com/docs/graph-api/reference/`. Key endpoints: `/me/accounts` (list pages), `/act_{ad_account_id}/campaigns` (list campaigns), `/{page_id}` (page details).
   - **NEVER:** Do not read MCP server source files, inspect process environments, try undocumented MCP resource URIs, or use `ReadMcpResourceTool` with guessed URIs. These approaches waste time and budget.
2. **Ad account must be active.** Account status `1` = active, `2` = disabled. Only use active accounts.
3. **Check campaign bid strategy before creating ad sets.** Use `get_campaign` to inspect the campaign's `bid_strategy` and `daily_budget`/`lifetime_budget`. This determines what fields the ad set requires (see Bid Strategy section below).

## Campaign Creation Workflow

**Per-step limit: No single step should take more than 3 MCP calls.** If you've called the same endpoint or explored the same problem 3 times without progress, stop that step and mark `blocked`. Do not keep trying variations — move on or escalate.

1. **Read task comments first** — extract any account IDs, campaign IDs, page IDs, and error details from previous runs. Skip steps that were already completed.
2. Call `health_check` and `get_ad_accounts` to confirm connectivity and find the active account (skip if already known from comments).
3. **Discover the Facebook Page ID** — required for ad sets and creatives. Follow the page discovery steps in Prerequisites above. If no page is found, mark `blocked` immediately — do NOT proceed to campaign creation without a page_id.
4. Create campaign with `create_campaign`. Use ONLY these parameters: `account_id`, `name`, `objective`, `special_ad_categories: ["NONE"]`, `status: "PAUSED"`. **Do NOT set `daily_budget`, `lifetime_budget`, `bid_strategy`, or `budget_optimization` on the campaign.** Setting a budget here creates a CBO campaign which makes ad set creation significantly harder. The budget goes on the ad set instead.
5. **Before creating ad set**, call `get_campaign` to verify the campaign has no budget (not CBO).
6. Create ad set with `create_ad_set` — set `daily_budget` on the ad set (NOT the campaign). Include `promoted_object: { page_id }`.
7. Create ad creative with `create_ad_creative` — requires `image_url` or `video_id`.
8. Report results in a task comment with campaign IDs and links.

**If any step fails twice, stop the entire workflow and mark `blocked`.** Do not continue to later steps. Do not try workarounds or alternative parameter combinations beyond 2 attempts.

## Campaign Budget Optimization (CBO)

When a campaign has its own `daily_budget` or `lifetime_budget`, budget is managed at the campaign level:
- Ad sets under CBO campaigns must NOT have their own `daily_budget` or `lifetime_budget`. Omit these fields entirely.
- The campaign budget is shared across all ad sets — Meta optimizes distribution automatically.
- If the campaign does NOT have a budget, the ad set MUST have one.

**How to check:** Call `get_campaign` and look at `daily_budget` and `lifetime_budget`. If either is set, it's a CBO campaign — do NOT set budget on the ad set.

## Bid Strategy Rules

The campaign's `bid_strategy` determines what the ad set requires:

| Campaign `bid_strategy` | Ad set requirement |
|-------------------------|-------------------|
| `LOWEST_COST_WITHOUT_CAP` | No `bid_amount` needed |
| `LOWEST_COST_WITH_BID_CAP` | **Must provide `bid_amount`** (in cents of account currency, e.g., 300 = €3 CPM) |
| `COST_CAP` | Must provide `bid_amount` as cost cap target |
| `TARGET_COST` | Must provide `bid_amount` as target cost |

**Critical:** If the campaign already uses `LOWEST_COST_WITH_BID_CAP`, you MUST include `bid_amount` on the ad set. If you don't know what bid cap to use, update the campaign's bid strategy to `LOWEST_COST_WITHOUT_CAP` first, or ask the board.

## DSA Compliance (EU Accounts)

For ad accounts in the EU (Europe/Berlin timezone, EUR currency, or EU countries), the Digital Services Act (DSA) requires:
- **`dsa_beneficiary`** — the person or organization benefiting from the ads. This is a **required field** on ad sets for EU accounts. Set it to the company/advertiser name (e.g., `"TradeKernel"` or the company's legal name).
- **`dsa_payor`** — who is paying for the ads. Also required for EU accounts. Typically the same as the beneficiary for self-serve accounts.

If you get error subcode `3858081` ("No beneficiary indicated"), add both `dsa_beneficiary` and `dsa_payor` fields to the ad set creation.

## Common Errors and What to Do

| Error | Subcode | Likely cause | Action |
|-------|---------|-------------|--------|
| `Invalid parameter` on `create_campaign` | — | Missing `special_ad_categories`, or unsupported parameter like `budget_optimization` | Use only: `account_id`, `name`, `objective`, `special_ad_categories: ["NONE"]`, `status`. Do NOT pass `budget_optimization`, `bid_strategy`, or `daily_budget` unless you are certain the MCP tool supports them. If it fails twice, mark `blocked`. |
| `Invalid parameter` — "Bid Amount Required" | `1815857` | Campaign uses `LOWEST_COST_WITH_BID_CAP` but ad set has no `bid_amount` | Add `bid_amount` (in cents) or change campaign bid strategy to `LOWEST_COST_WITHOUT_CAP` |
| `Invalid parameter` — "Can't Set Ad Set and Campaign Budget" | `1885621` | Campaign already has budget (CBO) and ad set also sets `daily_budget` | Remove `daily_budget`/`lifetime_budget` from the ad set — CBO campaign manages budget |
| `Invalid parameter` — "No beneficiary indicated" | `3858081` | EU DSA compliance — missing `dsa_beneficiary` | Add `dsa_beneficiary` and `dsa_payor` fields to the ad set |
| `Invalid parameter` on `create_ad_set` | various | Missing `page_id` — no Facebook Page connected | Include `promoted_object: { page_id }`. If no page exists, mark `blocked`. |
| `Invalid parameter` on `create_ad_creative` | various | Missing `image_url`/`video_id`, or no Facebook Page | Ensure `image_url` or `video_id` is provided. If still failing, likely missing page — mark `blocked`. |
| Generic `Invalid parameter` (any endpoint) | — | Meta API does not specify which parameter is wrong | **STOP after 2 attempts.** Mark `blocked` with what was tried. |

## Error Diagnosis Strategy

The `meta-ads-mcp` MCP server returns generic "Invalid parameter" errors without subcodes or details. **This is a known limitation — you cannot get better error messages by retrying.**

When you get a generic error:

1. **STOP after 2 failed attempts at the same endpoint.** Do not try a 3rd time. Do not vary parameters hoping for a different error message.
2. **Check prerequisites first** — verify the campaign settings (bid strategy, CBO, objective) before creating ad sets. Most ad set errors come from mismatched campaign settings.
3. **Mark `blocked` immediately** with a comment listing: (a) the endpoint that failed, (b) the exact parameters tried on each attempt, (c) the error message received. This gives the board enough context to debug.
4. **Do NOT use curl/fetch** to call the Meta API directly (except for page discovery as noted in Prerequisites) — this bypasses audit trails and may expose access tokens in logs.

## Anti-Patterns — Do NOT Do These

These patterns waste time and budget. If you catch yourself doing any of these, STOP immediately:

1. **Do NOT explore MCP server internals.** Never read MCP source files, grep for tokens in `/proc`, check process environments, or try to extract the access token from the MCP server. The token is managed by the MCP server — you interact through MCP tools only.
2. **Do NOT try undocumented MCP resources.** Only use resources listed by `ListMcpResources`. Do not guess URIs like `meta://adaccount/.../pages` — they don't exist.
3. **Do NOT retry after 2 failures.** The error message will not improve. Mark blocked and move on.
4. **Do NOT create CBO campaigns accidentally.** Never pass `daily_budget` or `lifetime_budget` to `create_campaign` unless you specifically intend CBO. Budget belongs on the ad set.
5. **Do NOT spend more than 3 tool calls on page discovery.** If you haven't found the page_id in 3 calls, mark blocked.
6. **Do NOT try to work around the MCP tool's budget validation.** If `create_ad_set` requires a budget, provide one. If the campaign is CBO, omit the budget. Don't try to bypass validation.

## Reusing Previous Run Context

**Before making ANY MCP or API calls, read the task's comment thread.** Previous heartbeat runs likely already discovered the ad account, created campaigns, and documented what failed. Extract all IDs, account info, and error details from comments before calling `health_check`, `get_ad_accounts`, or `list_campaigns` again. Do NOT repeat discovery calls that a previous run already completed — this wastes budget.

**Cross-heartbeat failure tracking:** If a previous heartbeat's comments document that `create_campaign` or any other endpoint returned "Invalid parameter", that failure carries over. Do NOT retry the same call with the same or similar parameters in a new heartbeat — the 2-attempt limit applies **across heartbeats**, not just within a single run. Instead, analyze what went wrong from the comments and either try a genuinely different approach or mark blocked.

## Reusing Existing Campaigns

Before creating a new campaign, **always check if usable campaigns already exist** with `list_campaigns`. Previous heartbeat runs may have created campaigns that are still valid (status `PAUSED`). Reuse them instead of creating duplicates — this avoids hitting rate limits and "Invalid parameter" errors from the MCP server.

When reusing a campaign:
1. Call `get_campaign` to check its `bid_strategy`, `daily_budget`, and `lifetime_budget`.
2. If the campaign is CBO (has campaign-level budget), **you can fix it yourself** — either delete it and create a new non-CBO campaign, or use `update_campaign` to remove the budget. Do NOT ask the board to do this for you.
3. Proceed directly to ad set creation using the existing campaign ID.

## Reporting

Always report campaign IDs and performance summaries in task comments.
