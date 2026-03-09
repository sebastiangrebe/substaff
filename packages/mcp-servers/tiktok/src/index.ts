#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TikTokClient } from "./client.js";

const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
if (!accessToken) {
  console.error("TIKTOK_ACCESS_TOKEN environment variable is required");
  process.exit(1);
}

const client = new TikTokClient(accessToken);

const server = new McpServer({
  name: "tiktok",
  version: "0.2.7",
});

// -- getCreatorInfo --
server.tool(
  "getCreatorInfo",
  "Get the TikTok creator's profile info and posting permissions. MUST be called before posting any content. Returns: available privacy_level_options (unaudited apps only have SELF_ONLY), whether duet/stitch/comments are disabled, and max_video_post_duration_sec. If only SELF_ONLY is available, the app has not passed TikTok audit — public posting is not possible.",
  {},
  async () => {
    try {
      const result = await client.getCreatorInfo();
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// -- postVideo --
server.tool(
  "postVideo",
  "Direct-post a video from a publicly accessible URL to the creator's TikTok profile. PREREQUISITE: call getCreatorInfo first to check available privacy levels and max duration. The videoUrl must be publicly accessible (not behind auth). Returns a publish_id — use checkPublishStatus to verify the post succeeded.",
  {
    videoUrl: z.string().describe("Publicly accessible URL of the video to post"),
    title: z.string().describe("Video title/caption (max 2200 characters)"),
    privacyLevel: z.string().default("SELF_ONLY").describe("Privacy level: SELF_ONLY, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, or PUBLIC_TO_EVERYONE"),
    disableDuet: z.boolean().default(false).describe("Disable duets on this video"),
    disableComment: z.boolean().default(false).describe("Disable comments on this video"),
    disableStitch: z.boolean().default(false).describe("Disable stitches on this video"),
    videoCoverTimestampMs: z.number().default(0).describe("Timestamp in ms for the cover image"),
  },
  async (args) => {
    try {
      const result = await client.postVideo(args);
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: `Video publish initiated. Publish ID: ${result.data.publish_id}\nUse checkPublishStatus to monitor progress.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// -- postPhoto --
server.tool(
  "postPhoto",
  "Post photos from publicly accessible URLs to the creator's TikTok profile. PREREQUISITE: call getCreatorInfo first to check available privacy levels. All photoUrls must be publicly accessible. Returns a publish_id — use checkPublishStatus to verify the post succeeded.",
  {
    photoUrls: z.array(z.string()).describe("Array of publicly accessible URLs of the photos to post"),
    title: z.string().describe("Photo post title/caption (max 2200 characters)"),
    privacyLevel: z.string().default("SELF_ONLY").describe("Privacy level: SELF_ONLY, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, or PUBLIC_TO_EVERYONE"),
    disableComment: z.boolean().default(false).describe("Disable comments on this post"),
    photoCoverIndex: z.number().default(0).describe("Index of the photo to use as cover (0-based)"),
  },
  async (args) => {
    try {
      const result = await client.postPhoto(args);
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: `Photo post initiated. Publish ID: ${result.data.publish_id}\nUse checkPublishStatus to monitor progress.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// -- uploadVideoDraft --
server.tool(
  "uploadVideoDraft",
  "Upload a video to the creator's TikTok inbox for review before posting. The videoUrl must be publicly accessible (not behind auth). The creator will see it in their TikTok app inbox and can choose to post it manually. This is useful when the app is unaudited (SELF_ONLY only) — the creator can adjust privacy when posting from their app. Returns a publish_id — use checkPublishStatus to track upload progress.",
  {
    videoUrl: z.string().describe("Publicly accessible URL of the video to upload to inbox"),
  },
  async (args) => {
    try {
      const result = await client.uploadVideoDraft({ videoUrl: args.videoUrl });
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: `Video uploaded to creator's inbox. Publish ID: ${result.data.publish_id}\nThe creator will review and post from their TikTok app.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// -- checkPublishStatus --
server.tool(
  "checkPublishStatus",
  "Check the status of a TikTok publish request. MUST be called after postVideo, postPhoto, or uploadVideoDraft to verify the content was published successfully. Possible statuses: PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE, FAILED. If FAILED, check fail_reason for details. Poll this endpoint if status is still processing.",
  {
    publishId: z.string().describe("The publish_id returned from a post or upload request"),
  },
  async (args) => {
    try {
      const result = await client.checkPublishStatus(args.publishId);
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      const status = result.data;
      let text = `Status: ${status.status}`;
      if (status.fail_reason) text += `\nFail reason: ${status.fail_reason}`;
      if (status.publicaly_available_post_id?.length) {
        text += `\nPublished post IDs: ${status.publicaly_available_post_id.join(", ")}`;
      }
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// -- listVideos --
server.tool(
  "listVideos",
  "List the creator's published TikTok videos. Returns video IDs, titles, descriptions, durations, cover images, and share URLs. Use this after posting to retrieve the public share URL for reporting. Supports pagination via cursor — if hasMore is true, pass the returned cursor to get the next page.",
  {
    maxCount: z.number().default(20).describe("Maximum number of videos to return (default 20, max 20)"),
    cursor: z.number().optional().describe("Pagination cursor from a previous response"),
  },
  async (args) => {
    try {
      const result = await client.listVideos({
        maxCount: args.maxCount,
        cursor: args.cursor,
      });
      if (result.error?.code && result.error.code !== "ok") {
        return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            { videos: result.data.videos, hasMore: result.data.has_more, cursor: result.data.cursor },
            null,
            2,
          ),
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
