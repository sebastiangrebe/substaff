import type { AdapterConfigFieldsProps } from "../types";

export function E2BSandboxConfigFields({ mode, values, set, config, eff, mark, models }: AdapterConfigFieldsProps) {
  if (mode === "create" && values && set) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
          <select
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            value={values.model || ""}
            onChange={(e) => set({ model: e.target.value })}
          >
            <option value="">Select a model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const currentModel = eff<string>("adapterConfig", "model", (config.model as string) || "");

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
        <select
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
          value={currentModel}
          onChange={(e) => mark("adapterConfig", "model", e.target.value)}
        >
          <option value="">Select a model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
