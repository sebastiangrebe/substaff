import { createAccessApi } from "@substaff/app-core/api/access";
import { api } from "./client";

export const accessApi = createAccessApi(api);
