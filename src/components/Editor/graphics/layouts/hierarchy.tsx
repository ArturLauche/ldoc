import type { SmartGraphicItem } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

/** Leaves at the bottom of the tree, used to decide when leaf groups hang. */
function countLeaves(items: SmartGraphicItem[]): number {
  return items.reduce((total, item) => total + (item.children.length ? countLeaves(item.children) : 1), 0);
}

/**
 * Classic top-down org chart. Levels are colored by depth. Broad trees hang
 * their leaf groups as short lists so the chart stays within the page, and
 * fold into an indented tree in narrow editors.
 */
export function OrgChart({ items }: LayoutRendererProps) {
  const leaves = countLeaves(items);
  const stack = leaves > 5 ? 'true' : 'narrow';
  return (
    <div className="sg-org min-w-fit gap-4" role="list" data-fold={leaves > 3 ? 'true' : undefined}>
      {items.map((item) => (
        <OrgBranch key={item.id} item={item} depth={0} stack={stack} />
      ))}
    </div>
  );
}

function OrgBranch({ item, depth, stack }: { item: SmartGraphicItem; depth: number; stack: string }) {
  const leaves = item.children.length > 1 && item.children.every((child) => child.children.length === 0);
  return (
    <div className="sg-org-branch" role="listitem">
      <GraphicNode
        item={item}
        index={depth}
        className={cn(
          'flex min-h-[2.75rem] w-max min-w-[5rem] max-w-[min(11rem,40cqw)] items-center justify-center rounded-lg px-3 py-2 text-center',
          depth === 0 ? 'font-semibold' : 'font-medium',
        )}
      />
      {item.children.length ? (
        <div className={cn('sg-org-children', leaves && 'is-leaves')} data-stack={leaves ? stack : undefined} role="list">
          {item.children.map((child) => (
            <OrgBranch key={child.id} item={child} depth={depth + 1} stack={stack} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Left-to-right tree with elbow connectors; an indented tree in narrow editors. */
export function HorizontalHierarchy({ items }: LayoutRendererProps) {
  return (
    <div className="flex min-w-fit flex-col gap-3" role="list">
      {items.map((item) => (
        <HorizontalBranch key={item.id} item={item} depth={0} />
      ))}
    </div>
  );
}

function HorizontalBranch({ item, depth }: { item: SmartGraphicItem; depth: number }) {
  return (
    <div className="sg-htree-node" role="listitem">
      <GraphicNode
        item={item}
        index={depth}
        className={cn(
          'flex min-h-[2.5rem] w-fit min-w-[8rem] max-w-full shrink-0 items-center rounded-lg px-3 py-2 text-start @lg:min-h-[2.75rem] @lg:w-[clamp(6rem,22cqw,11rem)] @lg:min-w-0',
          depth === 0 ? 'font-semibold' : 'font-medium',
        )}
      />
      {item.children.length ? (
        <div className="sg-htree-children" role="list">
          {item.children.map((child) => (
            <div key={child.id} className="sg-htree-branch" role="none">
              <HorizontalBranch item={child} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Indented outline tree; reads well at any width and with long labels. */
export function IndentedTree({ items }: LayoutRendererProps) {
  return (
    <div className="flex flex-col gap-3" role="list">
      {items.map((item) => (
        <TreeBranch key={item.id} item={item} depth={0} />
      ))}
    </div>
  );
}

function TreeBranch({ item, depth }: { item: SmartGraphicItem; depth: number }) {
  return (
    <div role="listitem">
      <GraphicNode
        item={item}
        index={depth}
        className={cn(
          'flex min-h-[2.5rem] w-fit min-w-[8rem] max-w-full items-center rounded-lg px-3 py-2 text-start',
          depth === 0 ? 'font-semibold' : 'font-medium',
        )}
      />
      {item.children.length ? (
        <div className="sg-tree-children" role="list">
          {item.children.map((child) => (
            <div key={child.id} className="sg-tree-branch" role="none">
              <TreeBranch item={child} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
