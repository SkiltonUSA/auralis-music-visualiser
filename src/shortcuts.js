const actions = { l: 'load', m: 'microphone', d: 'demo', s: 'options', a: 'director', f: 'fullscreen', h: 'interface', o: 'visualOnly', ArrowLeft: 'previous', ArrowRight: 'next' };

export function shortcutAction(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return null;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  if (target?.closest?.('button, a, [role="button"]') && (event.code === 'Space' || event.key === 'Enter')) return null;
  if (/^[1-9]$/.test(event.key)) return `scene:${Number(event.key) - 1}`;
  if (event.code === 'Space') return 'pause';
  if (event.key === 'Escape') return 'escape';
  return actions[event.key] || actions[event.key?.toLowerCase()] || null;
}
