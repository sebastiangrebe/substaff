import { createSecretsApi } from "@substaff/app-core/api/secrets";
import { api } from "./client";

export const secretsApi = createSecretsApi(api);
