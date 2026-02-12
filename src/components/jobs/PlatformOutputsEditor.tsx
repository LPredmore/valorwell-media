import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformOutputTab } from "./PlatformOutputTab";
import { PLATFORMS, FORMAT_PLATFORMS, type PlatformKey } from "@/lib/platforms";
import type { PlatformOutput } from "@/hooks/useJob";

interface Props {
  outputs: PlatformOutput[];
  format: string;
}

export function PlatformOutputsEditor({ outputs, format }: Props) {
  const platforms = FORMAT_PLATFORMS[format] || [];
  const outputsByPlatform = Object.fromEntries(outputs.map((o) => [o.platform, o]));

  if (platforms.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Platform Outputs</h3>
      <Tabs defaultValue={platforms[0]} className="w-full">
        <TabsList className="w-full flex-wrap justify-start">
          {platforms.map((p) => (
            <TabsTrigger key={p} value={p} className="text-xs">
              {PLATFORMS[p].label}
            </TabsTrigger>
          ))}
        </TabsList>
        {platforms.map((p) => {
          const output = outputsByPlatform[p];
          if (!output) return null;
          return (
            <TabsContent key={p} value={p}>
              <PlatformOutputTab output={output} platform={p} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
