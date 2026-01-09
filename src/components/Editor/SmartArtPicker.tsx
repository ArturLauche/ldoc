import { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  LayoutGrid, 
  ArrowRight, 
  GitBranch, 
  Circle, 
  Layers,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
  Trash2,
  Triangle,
  Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SmartArtPickerProps {
  editor: Editor | null;
}

interface SmartArtTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: string;
  maxItems?: number;
  generateSvg: (items: string[], colors: string[], options?: SmartArtOptions) => string;
}

const defaultColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const fallbackItems = ['Item 1', 'Item 2', 'Item 3', 'Item 4'];
const maxHierarchyDepth = 4;
const maxHierarchyBranching = 4;
const defaultHierarchyDepth = 2;
const defaultHierarchyBranching = 3;

interface SmartArtOptions {
  hierarchyDepth: number;
  hierarchyBranching: number;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeItems = (items: string[]) => {
  const trimmed = items.map((item) => item.trim()).filter(Boolean);
  const baseItems = trimmed.length > 0 ? trimmed : fallbackItems;
  return baseItems.map((item) => escapeXml(item));
};

const clampItems = (items: string[], maxItems?: number) =>
  typeof maxItems === 'number' ? items.slice(0, maxItems) : items;

const getHierarchyMaxItems = (options: SmartArtOptions) => {
  let total = 1;
  for (let level = 1; level <= options.hierarchyDepth; level += 1) {
    total += Math.pow(options.hierarchyBranching, level);
  }
  return total;
};

const encodeSmartArtData = (value: unknown) => {
  try {
    return encodeURIComponent(JSON.stringify(value));
  } catch {
    return null;
  }
};

const decodeSmartArtData = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(decodeURIComponent(value)) as T;
  } catch {
    return fallback;
  }
};

const fitHierarchySettings = (itemCount: number, depth: number, branching: number) => {
  let nextDepth = depth;
  let nextBranching = branching;
  let capacity = getHierarchyMaxItems({
    hierarchyDepth: nextDepth,
    hierarchyBranching: nextBranching,
  });

  while (capacity < itemCount) {
    if (nextDepth < maxHierarchyDepth) {
      nextDepth += 1;
    } else if (nextBranching < maxHierarchyBranching) {
      nextBranching += 1;
    } else {
      break;
    }

    capacity = getHierarchyMaxItems({
      hierarchyDepth: nextDepth,
      hierarchyBranching: nextBranching,
    });
  }

  return {
    depth: nextDepth,
    branching: nextBranching,
    capacity,
  };
};

const smartArtTemplates: SmartArtTemplate[] = [
  {
    id: 'process',
    name: 'Process Flow',
    icon: <ArrowRight className="h-5 w-5" />,
    category: 'Process',
    maxItems: 8,
    generateSvg: (items, colors) => {
      const width = Math.max(400, items.length * 120);
      const boxWidth = 80;
      const gap = 40;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 80" width="${width}" height="80">`;
      
      items.forEach((item, i) => {
        const x = i * (boxWidth + gap) + 20;
        const color = colors[i % colors.length];
        svg += `<rect x="${x}" y="15" width="${boxWidth}" height="50" rx="8" fill="${color}" opacity="0.9"/>`;
        svg += `<text x="${x + boxWidth/2}" y="45" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${item}</text>`;
        
        if (i < items.length - 1) {
          svg += `<path d="M${x + boxWidth + 5} 40 L${x + boxWidth + gap - 5} 40" stroke="${color}" stroke-width="2" marker-end="url(#arrow)"/>`;
        }
      });
      
      svg += `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#666"/></marker></defs>`;
      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'hierarchy',
    name: 'Hierarchy',
    icon: <GitBranch className="h-5 w-5" />,
    category: 'Hierarchy',
    generateSvg: (items, colors, options) => {
      const depth = options?.hierarchyDepth ?? 2;
      const branching = options?.hierarchyBranching ?? 3;
      const nodeWidth = 130;
      const nodeHeight = 46;
      const gap = 24;
      const levelGap = 54;
      const padding = 24;
      const levels: { label: string; x: number; y: number; level: number; index: number }[] = [];
      let labelIndex = 0;

      const levelCounts = Array.from({ length: depth + 1 }, (_, level) =>
        level === 0 ? 1 : Math.pow(branching, level)
      );
      const maxLevelWidth = Math.max(
        ...levelCounts.map(
          (count) => count * nodeWidth + (count - 1) * gap
        )
      );
      const width = maxLevelWidth + padding * 2;

      levelCounts.forEach((count, level) => {
        const levelWidth = count * nodeWidth + (count - 1) * gap;
        const startX = (width - levelWidth) / 2;
        const y = padding + level * (nodeHeight + levelGap);
        Array.from({ length: count }, (_, index) => {
          const label = items[labelIndex] || `Item ${labelIndex + 1}`;
          levels.push({
            label,
            x: startX + index * (nodeWidth + gap),
            y,
            level,
            index,
          });
          labelIndex += 1;
        });
      });

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${
        padding * 2 + (depth + 1) * nodeHeight + depth * levelGap
      }" width="${width}" height="${
        padding * 2 + (depth + 1) * nodeHeight + depth * levelGap
      }">
        <defs>
          <marker id="arrow-hierarchy" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
          </marker>
        </defs>
        ${levels
          .map((node) => {
            const color = colors[node.level % colors.length];
            return `
        <rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="${color}"/>
        <text x="${node.x + nodeWidth / 2}" y="${node.y + 29}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${node.label}</text>
        `;
          })
          .join('')}
        ${levels
          .filter((node) => node.level > 0)
          .map((node) => {
            const parentIndex = Math.floor(node.index / branching);
            const parent = levels.find(
              (candidate) => candidate.level === node.level - 1 && candidate.index === parentIndex
            );
            if (!parent) return '';
            const startX = parent.x + nodeWidth / 2;
            const startY = parent.y + nodeHeight;
            const endX = node.x + nodeWidth / 2;
            const endY = node.y;
            return `
        <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#666" stroke-width="2" marker-end="url(#arrow-hierarchy)"/>
        `;
          })
          .join('')}
      </svg>`;
      return svg;
    }
  },
  {
    id: 'cycle',
    name: 'Cycle',
    icon: <Circle className="h-5 w-5" />,
    category: 'Cycle',
    maxItems: 8,
    generateSvg: (items, colors) => {
      const count = Math.min(items.length, 8);
      const nodeRadius = 30;
      const radius = 80 + count * 6;
      const padding = 40;
      const size = radius * 2 + padding * 2;
      const centerX = size / 2;
      const centerY = size / 2;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <defs>
          <marker id="arrow-cycle" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
          </marker>
        </defs>`;
      
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const color = colors[i % colors.length];
        
        svg += `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${color}"/>`;
        svg += `<text x="${x}" y="${y + 4}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
        
        const nextAngle = ((i + 1) / count) * 2 * Math.PI - Math.PI / 2;
        const nextX = centerX + radius * Math.cos(nextAngle);
        const nextY = centerY + radius * Math.sin(nextAngle);
        const midAngle = (angle + nextAngle) / 2;
        const controlRadius = radius - 34;
        const controlX = centerX + controlRadius * Math.cos(midAngle);
        const controlY = centerY + controlRadius * Math.sin(midAngle);
        const startX = centerX + (radius - nodeRadius + 8) * Math.cos(angle);
        const startY = centerY + (radius - nodeRadius + 8) * Math.sin(angle);
        const endX = centerX + (radius - nodeRadius + 8) * Math.cos(nextAngle);
        const endY = centerY + (radius - nodeRadius + 8) * Math.sin(nextAngle);
        
        svg += `<path d="M${startX} ${startY} Q${controlX} ${controlY} ${endX} ${endY}" stroke="#666" fill="none" stroke-width="2" marker-end="url(#arrow-cycle)"/>`;
      }
      
      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'chevron',
    name: 'Chevron Process',
    icon: <ArrowRight className="h-5 w-5" />,
    category: 'Process',
    maxItems: 6,
    generateSvg: (items, colors) => {
      const itemWidth = 110;
      const itemHeight = 52;
      const overlap = 18;
      const width = items.length * (itemWidth - overlap) + overlap + 40;
      const height = 90;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

      items.forEach((item, index) => {
        const x = 20 + index * (itemWidth - overlap);
        const color = colors[index % colors.length];
        svg += `<path d="M${x} 18 H${x + itemWidth - overlap} L${x + itemWidth} ${height / 2} L${x + itemWidth - overlap} ${height - 18} H${x} L${x + overlap} ${height / 2} Z" fill="${color}" opacity="0.95"/>`;
        svg += `<text x="${x + (itemWidth - overlap) / 2}" y="${height / 2 + 4}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${item}</text>`;
      });

      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    icon: <Triangle className="h-5 w-5" />,
    category: 'Pyramid',
    generateSvg: (items, colors) => {
      const count = Math.min(items.length, 6);
      const height = 55 * count + 10;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 ${height}" width="320" height="${height}">`;
      
      for (let i = 0; i < count; i++) {
        const yOffset = i * 55 + 10;
        const widthFactor = (i + 1) / count;
        const baseWidth = 300 * widthFactor;
        const xOffset = (320 - baseWidth) / 2;
        const color = colors[i % colors.length];
        
        svg += `<rect x="${xOffset}" y="${yOffset}" width="${baseWidth}" height="50" rx="6" fill="${color}"/>`;
        svg += `<text x="160" y="${yOffset + 30}" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
      }
      
      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'radial',
    name: 'Radial List',
    icon: <Circle className="h-5 w-5" />,
    category: 'Relationship',
    maxItems: 8,
    generateSvg: (items, colors) => {
      const count = Math.min(items.length, 8);
      const center = 170;
      const radius = 90;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="340" height="340">`;

      svg += `<circle cx="${center}" cy="${center}" r="48" fill="${colors[0]}" opacity="0.9"/>`;
      svg += `<text x="${center}" y="${center + 4}" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[0]}</text>`;

      for (let i = 1; i < count; i++) {
        const angle = (i / (count - 1)) * 2 * Math.PI - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const color = colors[i % colors.length];
        svg += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#666" stroke-width="2"/>`;
        svg += `<circle cx="${x}" cy="${y}" r="30" fill="${color}" opacity="0.9"/>`;
        svg += `<text x="${x}" y="${y + 4}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
      }

      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'venn',
    name: 'Venn Diagram',
    icon: <Layers className="h-5 w-5" />,
    category: 'Relationship',
    maxItems: 3,
    generateSvg: (items, colors) => {
      const labels = [
        items[0] || 'Group A',
        items[1] || 'Group B',
        items[2] || 'Overlap',
      ];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
        <circle cx="100" cy="100" r="70" fill="${colors[0]}" opacity="0.6"/>
        <circle cx="200" cy="100" r="70" fill="${colors[1]}" opacity="0.6"/>
        <text x="70" y="105" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${labels[0]}</text>
        <text x="150" y="105" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${labels[2]}</text>
        <text x="230" y="105" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${labels[1]}</text>
      </svg>`;
    }
  },
  {
    id: 'matrix',
    name: 'Matrix',
    icon: <LayoutGrid className="h-5 w-5" />,
    category: 'Matrix',
    maxItems: 9,
    generateSvg: (items, colors) => {
      const count = Math.min(items.length, 9);
      const gridSize = Math.ceil(Math.sqrt(count));
      const cell = 90;
      const gap = 12;
      const size = gridSize * cell + (gridSize + 1) * gap;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;

      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        const x = gap + col * (cell + gap);
        const y = gap + row * (cell + gap);
        svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="8" fill="${colors[i % colors.length]}"/>`;
        svg += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
      }

      svg += '</svg>';
      return svg;
    }
  },
  {
    id: 'vertical-list',
    name: 'Vertical List',
    icon: <Layers className="h-5 w-5" />,
    category: 'List',
    maxItems: 8,
    generateSvg: (items, colors) => {
      const rowHeight = 46;
      const gap = 12;
      const width = 320;
      const height = items.length * rowHeight + (items.length - 1) * gap + 20;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

      items.forEach((item, index) => {
        const y = 10 + index * (rowHeight + gap);
        svg += `<rect x="10" y="${y}" width="${width - 20}" height="${rowHeight}" rx="8" fill="${colors[index % colors.length]}"/>`;
        svg += `<text x="${width / 2}" y="${y + 29}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${item}</text>`;
      });

      svg += '</svg>';
      return svg;
    }
  },
];

const groupedTemplates = smartArtTemplates.reduce<Record<string, SmartArtTemplate[]>>(
  (acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  },
  {}
);
const categoryOrder = [
  'Process',
  'Hierarchy',
  'Cycle',
  'Relationship',
  'Matrix',
  'Pyramid',
  'List',
];

export const SmartArtPicker = ({ editor }: SmartArtPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SmartArtTemplate | null>(null);
  const [items, setItems] = useState<string[]>(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
  const [hierarchyDepth, setHierarchyDepth] = useState(defaultHierarchyDepth);
  const [hierarchyBranching, setHierarchyBranching] = useState(defaultHierarchyBranching);
  const [templateSearch, setTemplateSearch] = useState('');
  const [bulkItemsText, setBulkItemsText] = useState('');

  const imageAttributes = editor?.getAttributes('image') ?? {};
  const selectedSmartArtType = (imageAttributes as { smartArtType?: string }).smartArtType ?? null;
  const isEditingSmartArt = Boolean(selectedSmartArtType && editor?.isActive('image'));

  const handleInsertSmartArt = () => {
    if (!selectedTemplate) return;

    const maxItems =
      selectedTemplate.id === 'hierarchy'
        ? getHierarchyMaxItems({ hierarchyDepth, hierarchyBranching })
        : selectedTemplate.maxItems;
    const renderItems = clampItems(normalizeItems(items), maxItems);
    const svg = selectedTemplate.generateSvg(renderItems, defaultColors, {
      hierarchyDepth,
      hierarchyBranching,
    });
    const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    const smartArtItems = encodeSmartArtData(items);
    const smartArtOptions = encodeSmartArtData({ hierarchyDepth, hierarchyBranching });
    
    if (isEditingSmartArt) {
      editor
        .chain()
        .focus()
        .updateAttributes('image', {
          src: dataUri,
          alt: selectedTemplate.name,
          align: 'center',
          width: '100',
          smartArtType: selectedTemplate.id,
          smartArtItems,
          smartArtOptions,
        })
        .run();
      toast.success('SmartArt updated');
    } else {
      editor
        .chain()
        .focus()
        .setImage({ src: dataUri, alt: selectedTemplate.name })
        .updateAttributes('image', {
          align: 'center',
          width: '100',
          smartArtType: selectedTemplate.id,
          smartArtItems,
          smartArtOptions,
        })
        .run();
      toast.success('SmartArt inserted');
    }
    
    setIsOpen(false);
    setSelectedTemplate(null);
    setItems(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
    setHierarchyDepth(defaultHierarchyDepth);
    setHierarchyBranching(defaultHierarchyBranching);
  };

  const handleSelectTemplate = (template: SmartArtTemplate) => {
    setSelectedTemplate(template);
    const maxItems =
      template.id === 'hierarchy'
        ? getHierarchyMaxItems({ hierarchyDepth, hierarchyBranching })
        : template.maxItems;
    if (typeof maxItems === 'number') {
      setItems((prev) => prev.slice(0, maxItems));
    }
  };

  const maxItems = selectedTemplate
    ? selectedTemplate.id === 'hierarchy'
      ? getHierarchyMaxItems({ hierarchyDepth, hierarchyBranching })
      : selectedTemplate.maxItems
    : undefined;
  const canAddItem = typeof maxItems === 'number' ? items.length < maxItems : true;

  const handleEditSmartArt = () => {
    if (!selectedSmartArtType) return;
    const template = smartArtTemplates.find((item) => item.id === selectedSmartArtType);
    if (!template) return;
    const storedItems = decodeSmartArtData<string[]>(imageAttributes.smartArtItems, items);
    const storedOptions = decodeSmartArtData<SmartArtOptions>(imageAttributes.smartArtOptions, {
      hierarchyDepth: defaultHierarchyDepth,
      hierarchyBranching: defaultHierarchyBranching,
    });
    setSelectedTemplate(template);
    setItems(storedItems.length ? storedItems : ['Item 1', 'Item 2', 'Item 3', 'Item 4']);
    setHierarchyDepth(storedOptions.hierarchyDepth || defaultHierarchyDepth);
    setHierarchyBranching(storedOptions.hierarchyBranching || defaultHierarchyBranching);
    setIsOpen(true);
  };

  useEffect(() => {
    if (selectedTemplate?.id !== 'hierarchy') return;
    const limit = getHierarchyMaxItems({ hierarchyDepth, hierarchyBranching });
    if (typeof limit === 'number' && items.length > limit) {
      setItems((prev) => prev.slice(0, limit));
    }
  }, [hierarchyBranching, hierarchyDepth, selectedTemplate, items.length]);

  const handleResetSettings = () => {
    setHierarchyDepth(defaultHierarchyDepth);
    setHierarchyBranching(defaultHierarchyBranching);
  };

  const handleFitHierarchy = () => {
    const fitResult = fitHierarchySettings(items.length, hierarchyDepth, hierarchyBranching);
    setHierarchyDepth(fitResult.depth);
    setHierarchyBranching(fitResult.branching);
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    setItems((prev) => {
      const nextItems = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextItems.length) return prev;
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(targetIndex, 0, moved);
      return nextItems;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleClearItems = () => {
    setItems(['Item 1']);
  };

  const handleApplyBulkItems = () => {
    const parsedItems = bulkItemsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (parsedItems.length === 0) {
      toast.error('Add at least one item before applying.');
      return;
    }

    setItems(parsedItems);
    toast.success('Items updated');
  };

  useEffect(() => {
    if (!isOpen) {
      setTemplateSearch('');
      setBulkItemsText('');
    }
  }, [isOpen]);

  const hierarchyCapacity = getHierarchyMaxItems({
    hierarchyDepth,
    hierarchyBranching,
  });
  const hierarchyIsOverCapacity = selectedTemplate?.id === 'hierarchy' && items.length > hierarchyCapacity;

  if (!editor) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="h-8 w-8 p-0"
            aria-label="Insert SmartArt"
          >
            <Network className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Insert SmartArt</TooltipContent>
      </Tooltip>
      {isEditingSmartArt && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEditSmartArt}
              className="h-8 w-8 p-0"
              aria-label="Edit SmartArt"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit SmartArt</TooltipContent>
        </Tooltip>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditingSmartArt ? 'Edit SmartArt' : 'Insert SmartArt'}</DialogTitle>
            <DialogDescription>
              Choose a diagram type and customize the content.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {/* Template Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Choose a layout</Label>
              <Input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search layouts..."
                className="mb-3"
              />
              <div className="space-y-4 max-h-[420px] overflow-auto pr-2">
                {categoryOrder
                  .filter((category) => groupedTemplates[category]?.length)
                  .map((category) => {
                    const visibleTemplates = groupedTemplates[category].filter((template) =>
                      template.name.toLowerCase().includes(templateSearch.toLowerCase())
                    );
                    if (visibleTemplates.length === 0) return null;
                    return (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {category}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {visibleTemplates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleSelectTemplate(template)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-3 rounded-lg border border-border/50 hover:border-primary/50 transition-all",
                            selectedTemplate?.id === template.id && "border-primary bg-primary/10"
                          )}
                        >
                          {template.icon}
                          <span className="text-xs text-center">{template.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                    );
                  })}
              </div>
            </div>

            {/* Content Editor */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Edit content</Label>
              {selectedTemplate ? (
                <div className="mb-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{selectedTemplate.name}</span>
                    <span>{selectedTemplate.category}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span>
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                    {typeof maxItems === 'number' && (
                      <span>Max {maxItems}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Select a layout to customize items and preview.
                </div>
              )}
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index] = e.target.value;
                        setItems(newItems);
                      }}
                      placeholder={`Item ${index + 1}`}
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleMoveItem(index, 'up')}
                        disabled={index === 0}
                        aria-label="Move item up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleMoveItem(index, 'down')}
                        disabled={index === items.length - 1}
                        aria-label="Move item down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveItem(index)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItems([...items, `Item ${items.length + 1}`])}
                  className="w-full"
                  disabled={!canAddItem}
                >
                  Add Item
                </Button>
                {selectedTemplate && typeof maxItems === 'number' && (
                  <p className="text-xs text-muted-foreground">
                    {items.length} / {maxItems} items used for this layout.
                  </p>
                )}
                {hierarchyIsOverCapacity && (
                  <p className="text-xs text-amber-500">
                    Increase hierarchy depth or branching to fit all items.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearItems}>
                    Clear items
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems(['Item 1', 'Item 2', 'Item 3', 'Item 4'])}
                  >
                    Reset items
                  </Button>
                </div>
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <div className="mt-4 p-4 bg-background/50 rounded-lg border border-border/30 overflow-auto max-h-48">
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: selectedTemplate.generateSvg(
                        clampItems(normalizeItems(items), maxItems),
                        defaultColors,
                        {
                          hierarchyDepth,
                          hierarchyBranching,
                        }
                      ) 
                    }} 
                  />
                </div>
              )}
              <div className="mt-4 space-y-2">
                <Label className="text-sm">Quick add items</Label>
                <Textarea
                  value={bulkItemsText}
                  onChange={(e) => setBulkItemsText(e.target.value)}
                  placeholder="Paste one item per line"
                  rows={4}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleApplyBulkItems}>
                  Apply list
                </Button>
              </div>
              {selectedTemplate?.id === 'hierarchy' && (
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Hierarchy depth</Label>
                    <Input
                      type="number"
                      min={2}
                      max={maxHierarchyDepth}
                      value={hierarchyDepth}
                      onChange={(e) =>
                        setHierarchyDepth(
                          Math.min(
                            maxHierarchyDepth,
                            Math.max(2, Number(e.target.value) || 2)
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Children per level</Label>
                    <Input
                      type="number"
                      min={2}
                      max={maxHierarchyBranching}
                      value={hierarchyBranching}
                      onChange={(e) =>
                        setHierarchyBranching(
                          Math.min(
                            maxHierarchyBranching,
                            Math.max(2, Number(e.target.value) || 2)
                          )
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleFitHierarchy}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Fit to items
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={handleResetSettings}>
                      Reset defaults
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Capacity: {hierarchyCapacity} items
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInsertSmartArt} disabled={!selectedTemplate}>
              {isEditingSmartArt ? 'Update' : 'Insert'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
