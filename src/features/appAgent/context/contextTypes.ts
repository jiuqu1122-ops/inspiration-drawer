export type { ContextScope } from '../skills/types';
import type { ContextScope } from '../skills/types';

export interface AppAgentContextRequest {
  scopes: ContextScope[];
  detail?: 'compact' | 'full';
}
