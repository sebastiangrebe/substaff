import { createAssetsApi } from "@substaff/app-core/api/assets";
import { api } from "./client";

export const assetsApi = createAssetsApi(api);
