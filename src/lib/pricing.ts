import type { CostBreakdownLine } from '@/types'

/**
 * Mock commercial pricing formulas per spec §22 / §46.
 * These are placeholders — the real Excel-derived formulas/rate tables
 * will replace this module in a future phase (see spec §60).
 */

export interface CostInputs {
  itemId: string
  baseCost: number
  freight: number
  duties: number
  otherCharges: number
  discount: number
  marginPercent: number
  taxPercent: number
}

export function calculateCostBreakdown(input: CostInputs): CostBreakdownLine {
  const adjustedCost = input.baseCost + input.freight + input.duties + input.otherCharges - input.discount
  const marginValue = adjustedCost * (input.marginPercent / 100)
  const sellingPrice = adjustedCost + marginValue
  const taxValue = sellingPrice * (input.taxPercent / 100)
  const finalPrice = sellingPrice + taxValue

  return {
    itemId: input.itemId,
    baseCost: input.baseCost,
    freight: input.freight,
    duties: input.duties,
    otherCharges: input.otherCharges,
    discount: input.discount,
    adjustedCost,
    marginPercent: input.marginPercent,
    marginValue,
    sellingPrice,
    taxPercent: input.taxPercent,
    taxValue,
    finalPrice,
  }
}

export function marginStatus(
  currentMarginPercent: number,
  targetMarginPercent: number,
): 'healthy' | 'warning' | 'below' {
  if (currentMarginPercent >= targetMarginPercent) return 'healthy'
  if (currentMarginPercent >= targetMarginPercent - 5) return 'warning'
  return 'below'
}

export const marginStatusColor: Record<'healthy' | 'warning' | 'below', string> = {
  healthy: 'text-[var(--color-green)] bg-[var(--color-green-50)] border-[var(--color-green-100)]',
  warning: 'text-[var(--color-amber)] bg-[var(--color-amber-50)] border-[var(--color-amber-100)]',
  below: 'text-[var(--color-red)] bg-[var(--color-red-50)] border-[var(--color-red-100)]',
}

export function summarizeCostBreakdown(lines: CostBreakdownLine[]) {
  const totalCost = lines.reduce((s, l) => s + l.adjustedCost, 0)
  const totalSellingPrice = lines.reduce((s, l) => s + l.sellingPrice, 0)
  const totalTax = lines.reduce((s, l) => s + l.taxValue, 0)
  const totalFreight = lines.reduce((s, l) => s + l.freight, 0)
  const totalDiscount = lines.reduce((s, l) => s + l.discount, 0)
  const grandTotal = lines.reduce((s, l) => s + l.finalPrice, 0)
  const grossMargin = totalSellingPrice - totalCost
  const marginPercent = totalCost > 0 ? (grossMargin / totalCost) * 100 : 0

  return {
    totalCost,
    totalSellingPrice,
    grossMargin,
    marginPercent,
    totalTax,
    totalFreight,
    totalDiscount,
    grandTotal,
  }
}
