import type { LucideIcon } from "lucide-react";

interface FeatureInfo {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface FeatureInfoSectionProps {
  title: string;
  subtitle: string;
  features: FeatureInfo[];
}

export function FeatureInfoSection({ title, subtitle, features }: FeatureInfoSectionProps) {
  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="flex gap-3 p-3 rounded-lg border border-border/50 bg-card"
          >
            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <feature.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{feature.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
