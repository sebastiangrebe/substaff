import { useTheme } from "@/context/ThemeContext"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "!bg-[var(--popover)] !text-[var(--popover-foreground)] !border-[var(--border)] !shadow-lg !rounded-[var(--radius)] !font-[inherit] !text-sm",
          title: "!text-[var(--foreground)] !font-medium !text-sm",
          description: "!text-[var(--muted-foreground)] !text-xs",
          actionButton:
            "!bg-[var(--primary)] !text-[var(--primary-foreground)] !rounded-[var(--radius)] !text-xs !font-medium !px-2.5 !py-1",
          closeButton:
            "!border-[var(--border)] !bg-[var(--popover)] !text-[var(--muted-foreground)] hover:!text-[var(--foreground)]",
          success: "!border-l-4 !border-l-emerald-500 dark:!border-l-emerald-400",
          error: "!border-l-4 !border-l-red-500 dark:!border-l-red-400",
          warning: "!border-l-4 !border-l-amber-500 dark:!border-l-amber-400",
          info: "!border-l-4 !border-l-[var(--primary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
