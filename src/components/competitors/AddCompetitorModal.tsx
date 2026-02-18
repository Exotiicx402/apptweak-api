import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink } from "lucide-react";

interface AddCompetitorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: { name: string; facebook_page_id: string; notes?: string }) => void;
  isAdding: boolean;
}

export function AddCompetitorModal({ open, onOpenChange, onAdd, isAdding }: AddCompetitorModalProps) {
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pageId.trim()) return;
    onAdd({ name: name.trim(), facebook_page_id: pageId.trim(), notes: notes.trim() || undefined });
    setName("");
    setPageId("");
    setNotes("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Competitor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Competitor Name</Label>
            <Input
              id="name"
              placeholder="e.g. Kalshi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageId">Facebook Page ID</Label>
            <Input
              id="pageId"
              placeholder="e.g. 123456789"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Find the Page ID by visiting the competitor's Facebook page → About → Page Transparency section, or use{" "}
              <a
                href="https://www.facebook.com/ads/library/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-0.5 hover:underline"
              >
                Meta Ad Library
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and search for their page.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              placeholder="e.g. Direct prediction market competitor"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding || !name.trim() || !pageId.trim()}>
              {isAdding ? "Adding..." : "Add Competitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
