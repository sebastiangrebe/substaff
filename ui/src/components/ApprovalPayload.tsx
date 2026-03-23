import { UserPlus, Lightbulb, ShieldCheck } from "lucide-react";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
};

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Name</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label="Role" value={payload.role} />
      <PayloadField label="Title" value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Capabilities</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Adapter</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
    </div>
  );
}

function StrategyObjectives({ objectives }: { objectives: unknown[] }) {
  return (
    <div className="space-y-3">
      {objectives.map((obj: any, i: number) => (
        <div key={i} className="rounded-md border border-border/50 p-3 space-y-2">
          <p className="text-sm font-medium">{obj.title ?? `Objective ${i + 1}`}</p>
          {obj.keyResults && Array.isArray(obj.keyResults) && (
            <ul className="space-y-1 pl-1">
              {obj.keyResults.map((kr: any, j: number) => (
                <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/60" />
                  <span>
                    {kr.title}
                    {kr.targetValue != null && (
                      <span className="ml-1 font-medium text-foreground">
                        (target: {kr.targetValue}{kr.unit ? ` ${kr.unit}` : ""}{kr.direction ? ` ${kr.direction}` : ""})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const summary = payload.summary ?? payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  const objectives = Array.isArray(payload.objectives) ? payload.objectives : null;

  return (
    <div className="mt-3 space-y-2.5 text-sm">
      {payload.title && <PayloadField label="Title" value={payload.title} />}
      {summary && (
        <p className="text-sm text-muted-foreground">{String(summary)}</p>
      )}
      {payload.rationale && (
        <p className="text-xs text-muted-foreground italic">{String(payload.rationale)}</p>
      )}
      {objectives && <StrategyObjectives objectives={objectives} />}
      {!summary && !objectives && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function GenericPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <pre className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "approve_ceo_strategy") return <CeoStrategyPayload payload={payload} />;
  // For unknown types, try strategy renderer if it has recognizable fields, otherwise generic
  if (payload.summary || payload.objectives || payload.plan || payload.strategy) {
    return <CeoStrategyPayload payload={payload} />;
  }
  return <GenericPayload payload={payload} />;
}
