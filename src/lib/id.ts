export function nextRfqNumber(existing: string[]): string {
  const nums = existing.map((n) => parseInt(n.split('-').pop() ?? '0', 10)).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 100
  return `RFQ-2026-${String(max + 1).padStart(5, '0')}`
}

export function nextQuotationNumber(existing: string[]): string {
  const nums = existing.map((n) => parseInt(n.split('-').pop() ?? '0', 10)).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 1000
  return `Q-2026-${String(max + 1).padStart(4, '0')}`
}

let counter = 0
export function uid(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}
