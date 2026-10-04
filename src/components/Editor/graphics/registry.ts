import type { ComponentType } from 'react';
import type { SmartGraphicLayoutId } from '@/lib/smartGraphic';
import { AlternatingTimeline, HorizontalTimeline, VerticalTimeline } from './layouts/timeline';
import { BasicCycle, LoopCycle, SegmentedCycle } from './layouts/cycle';
import { BlockList, CardList, HorizontalList, NumberedList } from './layouts/list';
import { GridMatrix, SwotMatrix, TitledMatrix } from './layouts/matrix';
import { HorizontalHierarchy, IndentedTree, OrgChart } from './layouts/hierarchy';
import { ArrowProcess, ChevronProcess, StaircaseProcess, StepProcess } from './layouts/process';
import { BasicPyramid, Funnel, InvertedPyramid, PyramidList } from './layouts/pyramid';
import {
  ConvergingRelationship,
  DivergingRelationship,
  NestedCircles,
  OpposingIdeas,
  RadialHub,
  VennDiagram,
} from './layouts/relationship';
import type { LayoutRendererProps } from './types';

/**
 * One renderer per stored layout id. The `Record` type makes a new layout id
 * fail to compile until it has a renderer.
 */
export const LAYOUT_RENDERERS: Record<SmartGraphicLayoutId, ComponentType<LayoutRendererProps>> = {
  'list-block': BlockList,
  'list-horizontal': HorizontalList,
  'list-numbered': NumberedList,
  'list-cards': CardList,
  'process-chevron': ChevronProcess,
  'process-steps': StepProcess,
  'process-arrow': ArrowProcess,
  'process-staircase': StaircaseProcess,
  'timeline-horizontal': HorizontalTimeline,
  'timeline-vertical': VerticalTimeline,
  'timeline-alternating': AlternatingTimeline,
  'cycle-basic': BasicCycle,
  'cycle-segmented': SegmentedCycle,
  'cycle-loop': LoopCycle,
  'hierarchy-org': OrgChart,
  'hierarchy-horizontal': HorizontalHierarchy,
  'hierarchy-tree': IndentedTree,
  'relationship-opposing': OpposingIdeas,
  'relationship-radial': RadialHub,
  'relationship-converging': ConvergingRelationship,
  'relationship-diverging': DivergingRelationship,
  'relationship-venn': VennDiagram,
  'relationship-nested': NestedCircles,
  'matrix-grid': GridMatrix,
  'matrix-swot': SwotMatrix,
  'matrix-titled': TitledMatrix,
  'pyramid-basic': BasicPyramid,
  'pyramid-inverted': InvertedPyramid,
  'pyramid-list': PyramidList,
  'pyramid-funnel': Funnel,
};
