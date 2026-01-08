import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  LayoutGrid, 
  ArrowRight, 
  GitBranch, 
  Circle, 
  Layers,
  Triangle,
  Square,
  Diamond,
  ArrowDownUp,
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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" width="300" height="180">
        <rect x="100" y="10" width="100" height="40" rx="8" fill="${colors[0]}"/>
        <text x="150" y="35" fill="white" font-size="12" text-anchor="middle" font-family="system-ui">${items[0] || 'Top'}</text>
        <line x1="150" y1="50" x2="150" y2="70" stroke="#666" stroke-width="2"/>
        <line x1="75" y1="70" x2="225" y2="70" stroke="#666" stroke-width="2"/>
        <line x1="75" y1="70" x2="75" y2="90" stroke="#666" stroke-width="2"/>
        <line x1="150" y1="70" x2="150" y2="90" stroke="#666" stroke-width="2"/>
        <line x1="225" y1="70" x2="225" y2="90" stroke="#666" stroke-width="2"/>
        <rect x="25" y="90" width="100" height="40" rx="8" fill="${colors[1]}"/>
        <text x="75" y="115" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[1] || 'Left'}</text>
        <rect x="100" y="90" width="100" height="40" rx="8" fill="${colors[2]}"/>
        <text x="150" y="115" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[2] || 'Center'}</text>
        <rect x="175" y="90" width="100" height="40" rx="8" fill="${colors[3]}"/>
        <text x="225" y="115" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[3] || 'Right'}</text>
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
      const centerX = 150, centerY = 150, radius = 80;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">`;
      
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI - Math.PI/2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const color = colors[i % colors.length];
        
        svg += `<circle cx="${x}" cy="${y}" r="35" fill="${color}"/>`;
        svg += `<text x="${x}" y="${y + 4}" fill="white" font-size="11" text-anchor="middle" font-family="system-ui">${items[i]}</text>`;
        
        // Draw arrow to next
        const nextAngle = ((i + 1) / count) * 2 * Math.PI - Math.PI/2;
        const nextX = centerX + radius * Math.cos(nextAngle);
        const nextY = centerY + radius * Math.sin(nextAngle);
        const midAngle = (angle + nextAngle) / 2 + (nextAngle > angle ? 0 : Math.PI);
        const arcRadius = radius - 40;
        
        svg += `<path d="M${x + 30 * Math.cos(midAngle)} ${y + 30 * Math.sin(midAngle)} Q${centerX} ${centerY} ${nextX - 30 * Math.cos(midAngle)} ${nextY - 30 * Math.sin(midAngle)}" stroke="#666" fill="none" stroke-width="2" marker-end="url(#arrow)"/>`;
      }
      
      svg += `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#666"/></marker></defs>`;
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

    const svg = selectedTemplate.generateSvg(items.filter(i => i.trim()), defaultColors);
    const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
    
    editor.chain().focus().setImage({ src: dataUri, alt: selectedTemplate.name }).run();
    
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
                      __html: selectedTemplate.generateSvg(items.filter(i => i.trim()), defaultColors) 
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
