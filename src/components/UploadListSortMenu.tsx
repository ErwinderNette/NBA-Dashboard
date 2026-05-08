import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UploadListSortOrder } from "@/utils/uploadListSort";

type UploadListSortMenuProps = {
  value: UploadListSortOrder;
  onChange: (order: UploadListSortOrder) => void;
  className?: string;
};

export function UploadListSortMenu({ value, onChange, className }: UploadListSortMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("h-9 w-9 shrink-0 border-slate-200 bg-white hover:bg-slate-50", className)}
          aria-label="Sortierung der Dateiliste"
          title="Sortierung"
        >
          <ArrowUpDown className="h-4 w-4 text-slate-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,16rem)]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as UploadListSortOrder)}
        >
          <DropdownMenuRadioItem value="newest">Neueste zuerst</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="oldest">Älteste zuerst</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="publisher">Nach Publisher (A–Z)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
