import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  LayoutGrid, 
  ArrowRight, 
  GitBranch, 
  Circle, 
  Layers,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  generateSvg: (items: string[], colors: string[]) => string;
}

const defaultColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const fallbackItems = ['Item 1', 'Item 2', 'Item 3', 'Item 4'];

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

const smartArtTemplates: SmartArtTemplate[] = [
  {
    id: 'process',
    name: 'Process Flow',
    icon: <ArrowRight className="h-5 w-5" />,
    category: 'Process',
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
    generateSvg: (items, colors) => {
      const topLabel = items[0] || 'Top';
      const childLabels = items.slice(1, 5);
      const childCount = Math.max(childLabels.length, 3);
      const topWidth = 140;
      const childWidth = 120;
      const gap = 24;
      const padding = 24;
      const totalChildWidth = childCount * childWidth + (childCount - 1) * gap;
      const width = Math.max(340, totalChildWidth + padding * 2);
      const topX = (width - topWidth) / 2;
      const topCenter = width / 2;
      const topY = 12;
      const connectorY = 70;
      const childY = 96;

      const childPositions = Array.from({ length: childCount }, (_, index) => ({
        x: padding + index * (childWidth + gap),
        label: childLabels[index] || `Item ${index + 1}`,
      }));

      const connectorStart = childPositions[0].x + childWidth / 2;
      const connectorEnd =
        childPositions[childPositions.length - 1].x + childWidth / 2;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 190" width="${width}" height="190">
        <defs>
          <marker id="arrow-hierarchy" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
          </marker>
        </defs>
        <rect x="${topX}" y="${topY}" width="${topWidth}" height="44" rx="8" fill="${colors[0]}"/>
        <text x="${topCenter}" y="${topY + 28}" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${topLabel}</text>
        <line x1="${topCenter}" y1="${topY + 44}" x2="${topCenter}" y2="${connectorY}" stroke="#666" stroke-width="2" marker-end="url(#arrow-hierarchy)"/>
        <line x1="${connectorStart}" y1="${connectorY}" x2="${connectorEnd}" y2="${connectorY}" stroke="#666" stroke-width="2"/>
        ${childPositions
          .map(
            (child, index) => `
        <line x1="${child.x + childWidth / 2}" y1="${connectorY}" x2="${child.x + childWidth / 2}" y2="${childY}" stroke="#666" stroke-width="2" marker-end="url(#arrow-hierarchy)"/>
        <rect x="${child.x}" y="${childY}" width="${childWidth}" height="44" rx="8" fill="${colors[(index + 1) % colors.length]}"/>
        <text x="${child.x + childWidth / 2}" y="${childY + 28}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${child.label}</text>
        `
          )
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
    generateSvg: (items, colors) => {
      const count = Math.min(items.length, 5);
      const centerX = 170;
      const centerY = 170;
      const radius = 95;
      const nodeRadius = 34;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="340" height="340">
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
        const controlRadius = radius - 40;
        const controlX = centerX + controlRadius * Math.cos(midAngle);
        const controlY = centerY + controlRadius * Math.sin(midAngle);
        const startX = centerX + (radius - nodeRadius + 6) * Math.cos(angle);
        const startY = centerY + (radius - nodeRadius + 6) * Math.sin(angle);
        const endX = centerX + (radius - nodeRadius + 6) * Math.cos(nextAngle);
        const endY = centerY + (radius - nodeRadius + 6) * Math.sin(nextAngle);
        
        svg += `<path d="M${startX} ${startY} Q${controlX} ${controlY} ${endX} ${endY}" stroke="#666" fill="none" stroke-width="2" marker-end="url(#arrow-cycle)"/>`;
      }
      
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
      const count = Math.min(items.length, 4);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240" width="300" height="240">`;
      
      for (let i = 0; i < count; i++) {
        const yOffset = i * 55 + 10;
        const widthFactor = (i + 1) / count;
        const baseWidth = 280 * widthFactor;
        const xOffset = (300 - baseWidth) / 2;
        const color = colors[i % colors.length];
        
        svg += `<rect x="${xOffset}" y="${yOffset}" width="${baseWidth}" height="50" rx="6" fill="${color}"/>`;
        svg += `<text x="150" y="${yOffset + 30}" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
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
    generateSvg: (items, colors) => {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
        <circle cx="100" cy="100" r="70" fill="${colors[0]}" opacity="0.6"/>
        <circle cx="200" cy="100" r="70" fill="${colors[1]}" opacity="0.6"/>
        <text x="70" y="105" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[0] || 'A'}</text>
        <text x="150" y="105" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[2] || 'Both'}</text>
        <text x="230" y="105" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[1] || 'B'}</text>
      </svg>`;
    }
  },
  {
    id: 'matrix',
    name: 'Matrix',
    icon: <LayoutGrid className="h-5 w-5" />,
    category: 'Matrix',
    generateSvg: (items, colors) => {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">
        <rect x="10" y="10" width="95" height="95" rx="8" fill="${colors[0]}"/>
        <text x="57" y="62" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[0] || 'Q1'}</text>
        <rect x="115" y="10" width="95" height="95" rx="8" fill="${colors[1]}"/>
        <text x="162" y="62" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[1] || 'Q2'}</text>
        <rect x="10" y="115" width="95" height="95" rx="8" fill="${colors[2]}"/>
        <text x="57" y="167" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[2] || 'Q3'}</text>
        <rect x="115" y="115" width="95" height="95" rx="8" fill="${colors[3]}"/>
        <text x="162" y="167" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[3] || 'Q4'}</text>
      </svg>`;
    }
  },
];

export const SmartArtPicker = ({ editor }: SmartArtPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SmartArtTemplate | null>(null);
  const [items, setItems] = useState<string[]>(['Item 1', 'Item 2', 'Item 3', 'Item 4']);

  if (!editor) return null;

  const handleInsertSmartArt = () => {
    if (!selectedTemplate) return;

    const renderItems = normalizeItems(items);
    const svg = selectedTemplate.generateSvg(renderItems, defaultColors);
    const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    
    editor
      .chain()
      .focus()
      .setImage({ src: dataUri, alt: selectedTemplate.name })
      .updateAttributes('image', { align: 'center', width: '100' })
      .run();
    
    setIsOpen(false);
    setSelectedTemplate(null);
    setItems(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
    toast.success('SmartArt inserted');
  };

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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Insert SmartArt</DialogTitle>
            <DialogDescription>
              Choose a diagram type and customize the content.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {/* Template Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Choose a layout</Label>
              <div className="grid grid-cols-3 gap-2">
                {smartArtTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border border-border/50 hover:border-primary/50 transition-all",
                      selectedTemplate?.id === template.id && "border-primary bg-primary/10"
                    )}
                  >
                    {template.icon}
                    <span className="text-xs">{template.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Editor */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Edit content</Label>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <Input
                    key={index}
                    value={item}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[index] = e.target.value;
                      setItems(newItems);
                    }}
                    placeholder={`Item ${index + 1}`}
                    className="h-8 text-sm"
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItems([...items, `Item ${items.length + 1}`])}
                  className="w-full"
                >
                  Add Item
                </Button>
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <div className="mt-4 p-4 bg-background/50 rounded-lg border border-border/30 overflow-auto max-h-40">
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: selectedTemplate.generateSvg(normalizeItems(items), defaultColors) 
                    }} 
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInsertSmartArt} disabled={!selectedTemplate}>
              Insert
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
