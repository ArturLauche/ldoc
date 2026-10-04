import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import {
  SMART_GRAPHIC_COLOR_SETS,
  SMART_GRAPHIC_STYLES,
  type SmartGraphicColorSet,
  type SmartGraphicStyle,
} from '@/lib/smartGraphic';
import type { TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { solidTone } from './graphicContext';

const COLOR_KEYS: Record<SmartGraphicColorSet, TranslationKey> = {
  theme: 'graphicColorTheme',
  blue: 'graphicColorBlue',
  green: 'graphicColorGreen',
  orange: 'graphicColorOrange',
  purple: 'graphicColorPurple',
  gray: 'graphicColorGray',
};

const STYLE_KEYS: Record<SmartGraphicStyle, TranslationKey> = {
  filled: 'graphicStyleFilled',
  outline: 'graphicStyleOutline',
  subtle: 'graphicStyleSubtle',
  intense: 'graphicStyleIntense',
};

const optionClass = (selected: boolean) =>
  cn(
    'relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary bg-accent font-medium text-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
  );

/** Color set and shape style, each shown with a real sample. */
export function DesignPicker({
  colorSet,
  style,
  onChange,
}: {
  colorSet: SmartGraphicColorSet;
  style: SmartGraphicStyle;
  onChange: (patch: { colorSet?: SmartGraphicColorSet; style?: SmartGraphicStyle }) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-foreground">{t('graphicColorSet')}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {SMART_GRAPHIC_COLOR_SETS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === colorSet}
              onClick={() => onChange({ colorSet: item })}
              className={optionClass(item === colorSet)}
            >
              {/* Palette tokens are scoped to graphic canvases, so samples borrow that scope. */}
              <span aria-hidden="true" className="lwrite-graphic-canvas flex h-5 w-full overflow-hidden rounded" data-color={item}>
                {[1, 2, 3, 4].map((step) => (
                  <span key={step} className="flex-1" style={{ backgroundColor: `var(--sg-${step})` }} />
                ))}
              </span>
              <span className="truncate">{t(COLOR_KEYS[item])}</span>
              {item === colorSet ? <SelectedMark /> : null}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-foreground">{t('graphicStyle')}</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {SMART_GRAPHIC_STYLES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === style}
              onClick={() => onChange({ style: item })}
              className={optionClass(item === style)}
            >
              <span aria-hidden="true" className="lwrite-graphic-canvas flex w-full justify-center p-1" data-color={colorSet}>
                <span className="block h-4 w-full rounded" style={solidTone(item, 0) as CSSProperties} />
              </span>
              <span className="truncate">{t(STYLE_KEYS[item])}</span>
              {item === style ? <SelectedMark /> : null}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function SelectedMark() {
  return (
    <span className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Check className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}
