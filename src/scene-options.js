// Build the settings once; update existing controls without stealing input focus.
export function createSceneOptions(container, scenes, { rotation, durations, onToggle, onDuration }) {
  const controls = scenes.map((scene, index) => {
    const row = document.createElement('div');row.className = 'scene-option';
    const name = document.createElement('span');name.className = 'scene-option-name';
    name.textContent = `${String(index + 1).padStart(2, '0')} · ${scene.title}`;
    const duration = document.createElement('input');
    duration.type = 'number';duration.min = '0';duration.max = '600';duration.step = '1';
    duration.inputMode = 'numeric';
    duration.className = 'scene-duration';duration.dataset.renderMode = scene.renderMode;
    duration.setAttribute('aria-label', `${scene.title} duration in seconds`);
    duration.setAttribute('aria-describedby', 'scene-timing-help');
    duration.addEventListener('keydown', event => { if (event.key === 'Enter') duration.blur(); });
    duration.addEventListener('change', () => {
      onDuration(index, duration.value === '' ? NaN : Number(duration.value));
      duration.value = durations.get(scene.renderMode);
    });
    const toggle = document.createElement('button');toggle.type = 'button';toggle.className = 'switch';
    toggle.dataset.sceneIndex = index;toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', `${scene.title} in Auto Director rotation`);
    toggle.append(document.createElement('i'));
    toggle.addEventListener('click', () => onToggle(index));
    row.append(name, duration, toggle);container.append(row);
    return { row, duration, toggle, scene, index };
  });
  return {
    update(current) {
      for (const { row, duration, toggle, scene, index } of controls) {
        const enabled = rotation.isEnabled(index);
        toggle.classList.toggle('active', enabled);toggle.setAttribute('aria-checked', String(enabled));
        row.classList.toggle('is-disabled', !enabled);row.classList.toggle('is-current', index === current);
        if (document.activeElement !== duration) duration.value = durations.get(scene.renderMode);
      }
    },
  };
}
