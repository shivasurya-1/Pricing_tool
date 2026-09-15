/** Small deterministic PRNG so "Reset Demo Data" always reproduces the same seed data. */
export function mulberry32(seed: number) {
  let a = seed
  return function rand(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeHelpers(seed: number) {
  const rand = mulberry32(seed)
  return {
    rand,
    randInt(min: number, max: number): number {
      return Math.floor(rand() * (max - min + 1)) + min
    },
    randFloat(min: number, max: number, decimals = 1): number {
      const v = rand() * (max - min) + min
      const f = 10 ** decimals
      return Math.round(v * f) / f
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(rand() * arr.length)]
    },
    pickN<T>(arr: T[], n: number): T[] {
      const copy = [...arr]
      const out: T[] = []
      for (let i = 0; i < n && copy.length > 0; i++) {
        const idx = Math.floor(rand() * copy.length)
        out.push(copy[idx])
        copy.splice(idx, 1)
      }
      return out
    },
  }
}
