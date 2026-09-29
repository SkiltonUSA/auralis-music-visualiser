const seeded = value => Math.abs(Math.sin(value * 91.733) * 43758.5453) % 1;

export function createValleyParticles() {
  return Array.from({ length: 48 }, (_, index) => ({
    phase: seeded(index + 101),
    duration: 24 + seeded(index + 211) * 14,
    spread: (seeded(index + 317) * 2 - 1) * .46,
    size: .9 + seeded(index + 419) * 1.1,
    tint: seeded(index + 523) * 2 - 1,
  }));
}

// Project constant-speed travel through depth into an upward fan. All rays
// originate at the centre and leave through the top, never the terrain below.
// The renderer's pause-aware clock avoids wall-clock jumps and beat speed kicks.
export function projectValleyParticle(particle, time, width, height) {
  const age = ((time / particle.duration + particle.phase) % 1 + 1) % 1;
  const perspective = a => (1 / (4 - 3 * a) - .25) / .75;
  const travel = perspective(age);
  const tail = perspective(Math.max(0, age - .14 / particle.duration));
  const fadeIn = Math.min(1, age / .08);
  const fadeOut = Math.min(1, (1 - age) / .12);
  return {
    x: width * (.5 + particle.spread * travel),
    y: height * (.52 - .60 * travel),
    tailX: width * (.5 + particle.spread * tail),
    tailY: height * (.52 - .60 * tail),
    size: particle.size * (.65 + travel * 1.15),
    opacity: fadeIn * fadeOut * (.35 + travel * .65),
  };
}
