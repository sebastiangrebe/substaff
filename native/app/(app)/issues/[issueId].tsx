import { View, Text, ScrollView, RefreshControl, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { formatDateTime } from "@substaff/app-core/utils/format";
import { statusLabel } from "@substaff/app-core/utils/labels";
import { useApi } from "../../../hooks/useApi";
import { useState } from "react";
import { StatusIcon } from "../../../components/shared/StatusIcon";
import { PriorityIcon } from "../../../components/shared/PriorityIcon";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { Identity } from "../../../components/shared/Identity";
import { Separator } from "../../../components/ui/separator";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import type { IssueComment } from "@substaff/shared";

export default function IssueDetailScreen() {
  const { issueId } = useLocalSearchParams<{ issueId: string }>();
  const { issuesApi } = useApi();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState("");

  const { data: issue, refetch } = useQuery({
    queryKey: queryKeys.issues.detail(issueId),
    queryFn: () => issuesApi.get(issueId),
    enabled: !!issueId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: queryKeys.issues.comments(issueId),
    queryFn: () => issuesApi.listComments(issueId),
    enabled: !!issueId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => issuesApi.addComment(issueId, body),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) }),
    ]);
    setRefreshing(false);
  }

  if (!issue) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-8 w-full mb-4" />
        <Skeleton className="h-20 w-full" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: issue.identifier ?? "Issue", headerBackTitle: "Issues" }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          className="flex-1 bg-background"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="p-4">
            {/* Header */}
            <View className="flex-row items-center gap-2 mb-2">
              <StatusIcon status={issue.status} />
              <Text className="text-xs text-muted-foreground font-mono">
                {issue.identifier ?? issue.id.slice(0, 8)}
              </Text>
            </View>
            <Text className="text-xl font-bold text-foreground mb-3">{issue.title}</Text>

            {/* Properties */}
            <View className="bg-card border border-border rounded-lg p-4 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm text-muted-foreground">Status</Text>
                <StatusIcon status={issue.status} showLabel />
              </View>
              <Separator />
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-sm text-muted-foreground">Priority</Text>
                <PriorityIcon priority={issue.priority} showLabel />
              </View>
              {issue.assigneeAgentId && (
                <>
                  <Separator />
                  <View className="flex-row items-center justify-between pt-3">
                    <Text className="text-sm text-muted-foreground">Assignee</Text>
                    <Text className="text-sm text-foreground">{issue.assigneeAgentId.slice(0, 8)}</Text>
                  </View>
                </>
              )}
              {issue.project?.name && (
                <>
                  <Separator className="mt-3" />
                  <View className="flex-row items-center justify-between pt-3">
                    <Text className="text-sm text-muted-foreground">Project</Text>
                    <Text className="text-sm text-foreground">{issue.project.name}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Description */}
            {issue.description ? (
              <View className="bg-card border border-border rounded-lg p-4 mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Description</Text>
                <Text className="text-sm text-foreground leading-relaxed">{issue.description}</Text>
              </View>
            ) : null}

            {/* Metadata */}
            <View className="flex-row gap-4 mb-6">
              <Text className="text-xs text-muted-foreground">
                Created {timeAgo(issue.createdAt)}
              </Text>
              {issue.updatedAt && (
                <Text className="text-xs text-muted-foreground">
                  Updated {timeAgo(issue.updatedAt)}
                </Text>
              )}
            </View>

            {/* Comments */}
            <Text className="text-base font-semibold text-foreground mb-3">
              Comments{comments.length > 0 ? ` (${comments.length})` : ""}
            </Text>

            {comments.map((comment: IssueComment) => (
              <View key={comment.id} className="bg-card border border-border rounded-lg p-3 mb-2">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-medium text-foreground">
                    {comment.authorAgentId ? `Agent ${comment.authorAgentId.slice(0, 8)}` : "User"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {timeAgo(comment.createdAt)}
                  </Text>
                </View>
                <Text className="text-sm text-foreground">{comment.body}</Text>
              </View>
            ))}

            {/* Add comment */}
            <View className="bg-card border border-border rounded-lg p-3 mt-1 mb-4">
              <TextInput
                className="text-sm text-foreground min-h-[60px] mb-2"
                placeholder="Add a comment..."
                placeholderTextColor="#9ca3af"
                value={commentText}
                onChangeText={setCommentText}
                multiline
                textAlignVertical="top"
              />
              <View className="flex-row justify-end">
                <Button
                  size="sm"
                  onPress={() => {
                    if (commentText.trim()) addCommentMutation.mutate(commentText.trim());
                  }}
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                >
                  {addCommentMutation.isPending ? "Posting..." : "Post"}
                </Button>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
