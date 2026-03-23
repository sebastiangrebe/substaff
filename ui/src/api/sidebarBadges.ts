import { createSidebarBadgesApi } from "@substaff/app-core/api/sidebarBadges";
import { api } from "./client";

export const sidebarBadgesApi = createSidebarBadgesApi(api);
