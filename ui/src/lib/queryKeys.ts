export { queryKeys } from "@substaff/app-core/queries";
import { createSharedQueries } from "@substaff/app-core/queries";
import { heartbeatsApi } from "../api/heartbeats";
import { sidebarBadgesApi } from "../api/sidebarBadges";

export { createSharedQueries };

export const sharedQueries = createSharedQueries({ heartbeatsApi, sidebarBadgesApi });
