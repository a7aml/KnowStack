import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  minWidth?: string;
}

export function Table({ children, className, minWidth = "560px", style, ...rest }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full text-left text-sm", className)}
        style={{ minWidth, ...style }}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeadRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-subtle">
      {children}
    </tr>
  );
}

export function Th({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("py-2 pr-4 font-medium", className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("py-3 pr-4", className)} {...rest}>
      {children}
    </td>
  );
}

export function Tr({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border last:border-0", className)} {...rest}>
      {children}
    </tr>
  );
}
