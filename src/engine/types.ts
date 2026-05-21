export interface ValidationResult {
  email: string;
  status: 'valid' | 'invalid' | 'risky';
  score: number;
  reason: string | null;
  suggestion?: string;
}

export interface MxResult {
  hasDomain: boolean;
  hasMx: boolean;
  isCatchAllHeuristic: boolean;
  mxHosts: string[];
}
