import type {
  ObjectiveStatus,
  ObjectiveTimePeriod,
  KeyResultStatus,
  KeyResultUnit,
  KeyResultDirection,
  KeyResultVizType,
} from "../constants.js";

export interface Objective {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  ownerAgentId: string | null;
  timePeriod: ObjectiveTimePeriod;
  periodStart: string | null;
  periodEnd: string | null;
  status: ObjectiveStatus;
  parentId: string | null;
  goalId: string | null;
  approvalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KeyResult {
  id: string;
  companyId: string;
  objectiveId: string;
  title: string;
  description: string | null;
  targetValue: number;
  currentValue: number;
  startingValue: number;
  unit: KeyResultUnit;
  direction: KeyResultDirection;
  visualizationType: KeyResultVizType;
  ownerAgentId: string | null;
  status: KeyResultStatus;
  createdAt: string;
  updatedAt: string;
}

export interface KpiEntry {
  id: string;
  companyId: string;
  keyResultId: string;
  value: number;
  recordedAt: string;
  sourceAgentId: string | null;
  sourceUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface KeyResultWithEntries extends KeyResult {
  entries: KpiEntry[];
  progressPercent: number;
}

export interface ObjectiveWithKeyResults extends Objective {
  keyResults: KeyResultWithEntries[];
  overallProgressPercent: number;
}
