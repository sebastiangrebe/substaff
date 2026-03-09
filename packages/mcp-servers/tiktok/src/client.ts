/**
 * TikTok Content Posting API client.
 * Uses fetch to call the TikTok v2 API endpoints.
 */

const API_BASE = "https://open.tiktokapis.com";

export class TikTokClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`TikTok API error ${res.status}: ${errText}`);
    }

    return res.json() as Promise<T>;
  }

  /** Get creator info and posting permissions. Must call before posting. */
  async getCreatorInfo(): Promise<CreatorInfoResponse> {
    return this.request<CreatorInfoResponse>(
      "POST",
      "/v2/post/publish/creator_info/query/",
    );
  }

  /** Direct-post a video from a publicly accessible URL. */
  async postVideo(params: PostVideoParams): Promise<PublishResponse> {
    return this.request<PublishResponse>(
      "POST",
      "/v2/post/publish/video/init/",
      {
        post_info: {
          title: params.title,
          privacy_level: params.privacyLevel ?? "SELF_ONLY",
          disable_duet: params.disableDuet ?? false,
          disable_comment: params.disableComment ?? false,
          disable_stitch: params.disableStitch ?? false,
          video_cover_timestamp_ms: params.videoCoverTimestampMs ?? 0,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: params.videoUrl,
        },
      },
    );
  }

  /** Post photos from publicly accessible URLs. */
  async postPhoto(params: PostPhotoParams): Promise<PublishResponse> {
    return this.request<PublishResponse>(
      "POST",
      "/v2/post/publish/content/init/",
      {
        post_info: {
          title: params.title,
          privacy_level: params.privacyLevel ?? "SELF_ONLY",
          disable_comment: params.disableComment ?? false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: params.photoCoverIndex ?? 0,
          photo_images: params.photoUrls,
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      },
    );
  }

  /** Upload a video to the creator's inbox for review before posting. */
  async uploadVideoDraft(params: UploadVideoDraftParams): Promise<PublishResponse> {
    return this.request<PublishResponse>(
      "POST",
      "/v2/post/publish/inbox/video/init/",
      {
        source_info: {
          source: "PULL_FROM_URL",
          video_url: params.videoUrl,
        },
      },
    );
  }

  /** Check the status of a publish request. */
  async checkPublishStatus(publishId: string): Promise<PublishStatusResponse> {
    return this.request<PublishStatusResponse>(
      "POST",
      "/v2/post/publish/status/fetch/",
      { publish_id: publishId },
    );
  }

  /** List the creator's published videos. */
  async listVideos(params?: ListVideosParams): Promise<ListVideosResponse> {
    return this.request<ListVideosResponse>(
      "POST",
      "/v2/video/list/",
      {
        max_count: params?.maxCount ?? 20,
        ...(params?.cursor ? { cursor: params.cursor } : {}),
      },
    );
  }
}

// -- Types --

export interface CreatorInfoResponse {
  data: {
    creator_avatar_url: string;
    creator_username: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  };
  error: { code: string; message: string; log_id: string };
}

export interface PostVideoParams {
  videoUrl: string;
  title: string;
  privacyLevel?: string;
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}

export interface PostPhotoParams {
  photoUrls: string[];
  title: string;
  privacyLevel?: string;
  disableComment?: boolean;
  photoCoverIndex?: number;
}

export interface UploadVideoDraftParams {
  videoUrl: string;
}

export interface ListVideosParams {
  maxCount?: number;
  cursor?: number;
}

export interface PublishResponse {
  data: { publish_id: string };
  error: { code: string; message: string; log_id: string };
}

export interface PublishStatusResponse {
  data: {
    status: string;
    fail_reason?: string;
    publicaly_available_post_id?: string[];
    uploaded_bytes?: number;
  };
  error: { code: string; message: string; log_id: string };
}

export interface ListVideosResponse {
  data: {
    videos: Array<{
      id: string;
      title: string;
      create_time: number;
      cover_image_url: string;
      video_description: string;
      duration: number;
      share_url: string;
    }>;
    cursor: number;
    has_more: boolean;
  };
  error: { code: string; message: string; log_id: string };
}
