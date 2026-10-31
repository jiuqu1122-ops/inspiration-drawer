// These are renderer capabilities, not a subject-to-style router. The model
// chooses a direction from this turn's user brief; validation must not reinterpret
// a negated keyword, override its choice, or persist a domain-specific default.
export const PRESENTATION_DESIGN_STYLES = [
  'editorial', 'technical', 'minimal', 'cinematic', 'brutalist', 'soft', 'custom',
] as const;
export const PRESENTATION_THEMES = ['light', 'dark', 'warm', 'mono', 'vivid', 'pastel'] as const;

export const resolvePresentationArtDirection = (
  modelStyle?: unknown,
  modelTheme?: unknown,
) => {
  const rawStyle = String(modelStyle || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    'technical style': 'technical', technical_style: 'technical',
    'minimal style': 'minimal', minimal_style: 'minimal',
    'editorial style': 'editorial', 'cinematic style': 'cinematic',
    'brutalist style': 'brutalist', 'soft style': 'soft', 'custom style': 'custom',
  };
  const designStyle = aliases[rawStyle] || rawStyle || 'custom';
  const theme = String(modelTheme || '').trim().toLowerCase() || 'light';
  if (!(PRESENTATION_DESIGN_STYLES as readonly string[]).includes(designStyle)) {
    throw new Error('designStyle 无效。请根据用户本轮要求选择 editorial/technical/minimal/cinematic/brutalist/soft，或用 custom + canvas 自由排版，不要退回固定模板。');
  }
  if (!(PRESENTATION_THEMES as readonly string[]).includes(theme)) {
    throw new Error('theme 无效。请选择 light/dark/warm/mono/vivid/pastel，自定义色彩可用逐页 backgroundColor。');
  }
  return { designStyle, theme };
};
