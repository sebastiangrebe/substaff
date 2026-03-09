---
name: integration-tiktok
description: >
  TikTok integration guide for Substaff agents. Use when working with TikTok
  MCP tools — posting videos, photos, uploading drafts, checking publish status,
  and listing videos. Covers privacy level restrictions, unaudited app limitations,
  the getCreatorInfo prerequisite, and the posting workflow.
---

# TikTok Integration

The TikTok integration uses `@substaff/mcp-tiktok` for publishing videos and photos to TikTok.

## Prerequisites — Check Before Posting

1. **Always call `getCreatorInfo` first** to check:
   - Available `privacy_level_options` (unaudited apps can only post as `SELF_ONLY`)
   - Whether duet/stitch/comments are disabled for the creator
   - Maximum video duration (`max_video_post_duration_sec`)
2. Respect the creator's settings — do not attempt to enable features they have disabled.

## Posting Workflow

1. Call `getCreatorInfo` — verify permissions.
2. For video content: use `postVideo` with a **publicly accessible video URL**.
3. For photo content: use `postPhoto` with an array of **publicly accessible image URLs**.
4. For draft/review flow: use `uploadVideoDraft` — the creator reviews in their TikTok app before publishing.
5. After posting, call `checkPublishStatus` with the returned `publish_id` to verify success.
6. Use `listVideos` to retrieve published video details (share URLs, view counts).

## Privacy Levels

| Level | Description | Requires |
|-------|-------------|----------|
| `SELF_ONLY` | Only the creator can see it | Default, always available |
| `MUTUAL_FOLLOW_FRIENDS` | Only mutual followers | Audited app |
| `FOLLOWER_OF_CREATOR` | Only the creator's followers | Audited app |
| `PUBLIC_TO_EVERYONE` | Public | Audited app |

Unaudited apps are restricted to `SELF_ONLY`. If the task requires public posting and only `SELF_ONLY` is available, mark the task as `blocked` and explain the app needs TikTok audit approval.

## Reporting

Always report published content details in task comments, including `publish_id` and share URLs from `listVideos`.
