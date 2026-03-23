import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export {
  formatCents,
  formatDate,
  formatDateTime,
  relativeTime,
  formatTokens,
  issueUrl,
  agentRouteRef,
  agentUrl,
  projectRouteRef,
  projectUrl,
} from "@substaff/app-core/utils/format";
