import { cn } from "@/lib/utils";

export function CodeInline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-md bg-muted px-1.5 py-0.5 text-[0.78rem] font-mono text-foreground/80",
        className,
      )}
    >
      {children}
    </code>
  );
}
