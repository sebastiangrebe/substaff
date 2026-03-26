export type CommentLinkType = "issue" | "approval" | "goal" | "objective";

export interface Comment {
  id: string;
  companyId: string;
  linkType: CommentLinkType;
  linkId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

/** @deprecated Use Comment instead */
export type IssueComment = Comment;

/** @deprecated Use Comment instead */
export type ApprovalComment = Comment;
