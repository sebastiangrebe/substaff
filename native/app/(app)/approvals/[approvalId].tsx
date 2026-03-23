import { View, Text, ScrollView, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { statusLabel } from "@substaff/app-core/utils/labels";
import { useApi } from "../../../hooks/useApi";
import { useState } from "react";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { Separator } from "../../../components/ui/separator";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react-native";
import type { ApprovalComment } from "@substaff/shared";

export default function ApprovalDetailScreen() {
  const { approvalId } = useLocalSearchParams<{ approvalId: string }>();
  const { approvalsApi } = useApi();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const { data: approval, refetch } = useQuery({
    queryKey: queryKeys.approvals.detail(approvalId),
    queryFn: () => approvalsApi.get(approvalId),
    enabled: !!approvalId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: queryKeys.approvals.comments(approvalId),
    queryFn: () => approvalsApi.listComments(approvalId),
    enabled: !!approvalId,
  });

  const { data: linkedIssues = [] } = useQuery({
    queryKey: queryKeys.approvals.issues(approvalId),
    queryFn: () => approvalsApi.listIssues(approvalId),
    enabled: !!approvalId,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.detail(approvalId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.comments(approvalId) });
  }

  const approveMutation = useMutation({
    mutationFn: () => approvalsApi.approve(approvalId, decisionNote || undefined),
    onSuccess: () => {
      invalidateAll();
      setDecisionNote("");
      Alert.alert("Approved", "The request has been approved.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => approvalsApi.reject(approvalId, decisionNote || undefined),
    onSuccess: () => {
      invalidateAll();
      setDecisionNote("");
      Alert.alert("Rejected", "The request has been rejected.");
    },
  });

  const revisionMutation = useMutation({
    mutationFn: () => approvalsApi.requestRevision(approvalId, decisionNote || undefined),
    onSuccess: () => {
      invalidateAll();
      setDecisionNote("");
      Alert.alert("Revision Requested", "The requester has been asked to revise.");
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) => approvalsApi.addComment(approvalId, body),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.comments(approvalId) });
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.comments(approvalId) }),
    ]);
    setRefreshing(false);
  }

  if (!approval) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-32 w-full" />
      </View>
    );
  }

  const isPending = approval.status === "pending";
  const isRevisionRequested = approval.status === "revision_requested";
  const isApproved = approval.status === "approved";

  return (
    <>
      <Stack.Screen options={{ title: "Approval", headerBackTitle: "Approvals" }} />
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
            {/* Success banner */}
            {isApproved && (
              <View className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex-row items-center gap-3">
                <CheckCircle2 size={20} color="#16a34a" />
                <Text className="text-green-700 font-medium flex-1">This request has been approved</Text>
              </View>
            )}

            {/* Header */}
            <View className="flex-row items-start justify-between mb-2">
              <Text className="text-xl font-bold text-foreground flex-1">{approval.type.replace(/_/g, " ")}</Text>
              <StatusBadge status={approval.status} />
            </View>
            <Text className="text-xs text-muted-foreground mb-4">
              Requested {timeAgo(approval.createdAt)}
              {approval.requestedByAgentId && ` by agent`}
            </Text>

            {/* Payload */}
            {approval.payload && Object.keys(approval.payload).length > 0 ? (
              <View className="bg-card border border-border rounded-lg p-4 mb-4">
                <Text className="text-xs font-medium text-muted-foreground mb-2">Request Details</Text>
                {Object.entries(approval.payload).map(([key, value]) => (
                  <View key={key} className="flex-row justify-between py-1">
                    <Text className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</Text>
                    <Text className="text-sm text-foreground" numberOfLines={1}>{String(value)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Decision note */}
            {approval.decisionNote ? (
              <View className="bg-card border border-border rounded-lg p-4 mb-4">
                <Text className="text-xs font-medium text-muted-foreground mb-1">Decision Note</Text>
                <Text className="text-sm text-foreground">{approval.decisionNote}</Text>
              </View>
            ) : null}

            {/* Linked issues */}
            {linkedIssues.length > 0 && (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Linked Issues</Text>
                {linkedIssues.map((issue) => (
                  <View key={issue.id} className="bg-card border border-border rounded-lg p-3 mb-1.5 flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground font-mono">
                      {issue.identifier ?? issue.id.slice(0, 8)}
                    </Text>
                    <Text className="text-sm text-foreground flex-1" numberOfLines={1}>
                      {issue.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action buttons */}
            {(isPending || isRevisionRequested) && (
              <View className="mb-4">
                {/* Decision note input */}
                <TextInput
                  className="bg-card border border-border rounded-lg p-3 text-sm text-foreground mb-3 min-h-[50px]"
                  placeholder="Add a note (optional)..."
                  placeholderTextColor="#9ca3af"
                  value={decisionNote}
                  onChangeText={setDecisionNote}
                  multiline
                  textAlignVertical="top"
                />
                <View className="flex-row gap-2">
                  <Button
                    className="flex-1 bg-green-600"
                    onPress={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <CheckCircle2 size={14} color="#fff" />
                      <Text className="text-white font-semibold text-sm">Approve</Text>
                    </View>
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onPress={() => rejectMutation.mutate()}
                    disabled={rejectMutation.isPending}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <XCircle size={14} color="#fff" />
                      <Text className="text-white font-semibold text-sm">Reject</Text>
                    </View>
                  </Button>
                </View>
                {isPending && (
                  <Button
                    variant="outline"
                    className="mt-2"
                    onPress={() => revisionMutation.mutate()}
                    disabled={revisionMutation.isPending}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color="#18181b" />
                      <Text className="text-sm font-medium text-foreground">Request Revision</Text>
                    </View>
                  </Button>
                )}
              </View>
            )}

            <Separator className="mb-4" />

            {/* Comments */}
            <Text className="text-base font-semibold text-foreground mb-3">
              Comments{comments.length > 0 ? ` (${comments.length})` : ""}
            </Text>

            {comments.map((comment: ApprovalComment) => (
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
                className="text-sm text-foreground min-h-[50px] mb-2"
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
