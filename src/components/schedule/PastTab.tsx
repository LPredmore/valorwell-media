import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePostedContent } from "@/hooks/useSchedule";

export function PastTab({ postLength }: { postLength?: "Long" | "Short" }) {
  const { data: items, isLoading } = usePostedContent();

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  if (!items?.length) {
    return <div className="py-8 text-center text-muted-foreground">Nothing's gone live yet — your first post will land here.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topic</TableHead>
          <TableHead className="w-44">Date Posted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">{item.post_title || item.topic}</TableCell>
            <TableCell className="text-muted-foreground">
              {item.posted_at
                ? format(new Date(item.posted_at), "MMM d, yyyy h:mm a")
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
