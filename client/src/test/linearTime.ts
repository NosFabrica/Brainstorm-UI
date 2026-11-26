import { expect } from "vitest";

/** Below this a sample is mostly timer resolution: enough calls are timed together to reach it. */
const MIN_SAMPLE_MS = 10;

/**
 * Milliseconds of CPU this process has spent. CPU time, not wall-clock: time the worker spends
 * descheduled on a busy machine is not counted, which is most of what makes a timing test flaky.
 */
function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

/**
 * How a function's time grows when its input grows fourfold: about 4 for linear work, 16 for
 * quadratic. A ratio, not a budget, so it reads the same on a fast laptop and on a CI runner four
 * test files deep.
 *
 * `make(n)` builds the input of size n, once per size and outside the timing; `run` does the work.
 * After a warm-up of each size (so the JIT has compiled what it will), each sample times as many
 * calls as the small input needs to take MIN_SAMPLE_MS, the same count at both sizes. The sizes
 * alternate, and the fastest of `runs` samples of each is compared: what load adds to a sample
 * only ever lengthens it.
 */
export function growthRatio<I>(
  make: (n: number) => I,
  run: (input: I) => void,
  n: number,
  { runs = 5 }: { runs?: number } = {},
): number {
  const small = make(n);
  const large = make(4 * n);
  run(large);
  let calls = 0;
  const start = cpuMs();
  do {
    run(small);
    calls++;
  } while (cpuMs() - start < MIN_SAMPLE_MS);
  const sample = (input: I) => {
    const t = cpuMs();
    for (let i = 0; i < calls; i++) run(input);
    return cpuMs() - t;
  };
  let fastest = { small: Infinity, large: Infinity };
  for (let i = 0; i < runs; i++) {
    fastest = {
      small: Math.min(fastest.small, sample(small)),
      large: Math.min(fastest.large, sample(large)),
    };
  }
  return fastest.large / fastest.small;
}

/**
 * Fails unless `run`'s time grows about linearly with its input (see growthRatio). The line is 8,
 * halfway between linear (4) and quadratic (16) on a log scale: small inputs that fit in cache
 * measure a little over 4 (5 for wiki pages of a few kB), and an n·log n pass about 4.5.
 */
export function expectLinear<I>(make: (n: number) => I, run: (input: I) => void, n: number): void {
  expect(growthRatio(make, run, n)).toBeLessThan(8);
}
