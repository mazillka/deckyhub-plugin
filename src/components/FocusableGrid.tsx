import { Focusable } from "@decky/ui";
import type { ReactNode } from "react";

/**
 * Steam's gamepad-nav doesn't reliably support any single "wrapping grid"
 * flow-children value (row-wrap/right-wrap/grid were all tried on real
 * hardware and none enabled left/right). Build the grid as explicit rows
 * instead: each row is its own Focusable with flow-children="right" (a
 * plain horizontal group, which does work), and rows stack vertically via
 * normal page flow.
 */
export function FocusableGrid<T>({
  items,
  columns,
  keyFor,
  children,
}: {
  items: T[];
  columns: number;
  keyFor: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
  return (
    <>
      {rows.map((row, index) => (
        <Focusable key={index} flow-children="right" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          {row.map((item) => (
            <div key={keyFor(item)} style={{ flex: 1, minWidth: 0 }}>
              {children(item)}
            </div>
          ))}
        </Focusable>
      ))}
    </>
  );
}
