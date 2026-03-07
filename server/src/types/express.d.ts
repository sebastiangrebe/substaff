export {};

declare global {
  namespace Express {
    interface Request {
      actor: {
        type: "board" | "agent" | "none";
        userId?: string;
        agentId?: string;
        vendorId?: string;
        vendorIds?: string[];
        companyId?: string;
        companyIds?: string[];
        isInstanceAdmin?: boolean;
        keyId?: string;
        runId?: string;
        source?: "session" | "agent_key" | "agent_jwt" | "none";
      };
    }
  }
}
