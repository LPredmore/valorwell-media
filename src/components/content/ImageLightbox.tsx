import { Download, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  imageUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ imageUrl, open, onOpenChange }: Props) {
  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cover-image.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // fallback: open in new tab
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background border-border">
        <div className="relative">
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <img
            src={imageUrl}
            alt="Cover image"
            className="w-full h-auto max-h-[80vh] object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
