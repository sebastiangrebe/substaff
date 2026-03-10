import { usePanel } from "../context/PanelContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export function PropertiesPanel() {
  const { panelContent, panelVisible, setPanelVisible } = usePanel();

  if (!panelContent) return null;

  return (
    <Sheet open={panelVisible} onOpenChange={setPanelVisible}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[400px] p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-base">Details</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 h-[calc(100%-60px)]">
          <div className="p-5">{panelContent}</div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
