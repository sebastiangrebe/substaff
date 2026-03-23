import { createProjectsApi } from "@substaff/app-core/api/projects";
import { api } from "./client";

export const projectsApi = createProjectsApi(api);
