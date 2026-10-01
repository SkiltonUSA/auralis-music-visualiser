// Native range thumbs travel over (track width - thumb width). Correct the
// gradient stop to the thumb centre, including when the control is resized.
export function updateRangeFill(input) {
  const min = Number(input.min), max = Number(input.max), value = Number(input.value);
  const ratio = max > min && Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  input.style.setProperty('--range-percent', `${Number((ratio * 100).toFixed(4))}%`);
  input.style.setProperty('--range-offset', `${Number((5 - ratio * 10).toFixed(4))}px`);
}
