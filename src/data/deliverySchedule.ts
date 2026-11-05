/**
 * Mirrors the client's "Delivery Schedule" tab exactly — every phase/activity,
 * default sourcing, standard days and override days. The critical-path total
 * only sums specific rows (see CRITICAL_PATH_KEYS below), matching the
 * source workbook's own formula — Phase 1 (body manufacturing) is tracked
 * but deliberately excluded, since it runs in parallel with procurement.
 */

export type DeliverySourcing = 'In-house' | 'Outsource' | 'Logistics' | '—'

export interface DeliveryActivity {
  key: string
  phase: string
  label: string
  sourcing: DeliverySourcing
  stdDays: number
  overrideDays?: number
  unit: 'days' | 'h'
  note?: string
}

export const DELIVERY_ACTIVITIES: DeliveryActivity[] = [
  { key: 'bomRelease', phase: 'Phase 0: Planning & Procurement', label: 'BOM Release & Engineering Sign-off', sourcing: 'In-house', stdDays: 2, unit: 'h', note: 'Hours converted: ~2h = 0.25 day' },
  { key: 'purchasingCritical', phase: 'Phase 0: Planning & Procurement', label: 'Purchasing – Critical Parts', sourcing: 'In-house', stdDays: 5, unit: 'days', note: 'Internal purchasing dept' },

  { key: 'shellPlateProcurement', phase: 'Phase 1: Pulley Body', label: 'Shell Plate Procurement', sourcing: 'Outsource', stdDays: 35, overrideDays: 35, unit: 'days', note: 'Plate mill lead time' },
  { key: 'logisticPlates', phase: 'Phase 1: Pulley Body', label: 'Logistic – Plates to Works', sourcing: 'Logistics', stdDays: 1, overrideDays: 1, unit: 'days' },
  { key: 'weldPreparation', phase: 'Phase 1: Pulley Body', label: 'Weld Preparation', sourcing: 'In-house', stdDays: 1, overrideDays: 2, unit: 'days', note: 'Calc from geometry' },
  { key: 'rollingBendingCalibration', phase: 'Phase 1: Pulley Body', label: 'Rolling / Bending + Calibration', sourcing: 'In-house', stdDays: 1, overrideDays: 2, unit: 'days', note: 'In-house rolling' },
  { key: 'tackingGrindingShell', phase: 'Phase 1: Pulley Body', label: 'Tacking & Grinding Shell', sourcing: 'In-house', stdDays: 1, overrideDays: 1, unit: 'days' },
  { key: 'heatUpWeld', phase: 'Phase 1: Pulley Body', label: 'Heat-up & Longitudinal Weld', sourcing: 'In-house', stdDays: 1, overrideDays: 1, unit: 'days' },
  { key: 'readyTube', phase: 'Phase 1: Pulley Body', label: 'Ready Tube (outsourced shell option)', sourcing: 'Outsource', stdDays: 40, overrideDays: 14, unit: 'days', note: 'If tube outsourced: 14d' },
  { key: 'logisticReadyTube', phase: 'Phase 1: Pulley Body', label: 'Logistic – Ready Tube', sourcing: 'Logistics', stdDays: 0, overrideDays: 1, unit: 'days', note: 'Only if outsourced' },
  { key: 'hubMaterialProcurement', phase: 'Phase 1: Pulley Body', label: 'Hub Material Procurement', sourcing: 'Outsource', stdDays: 35, overrideDays: 35, unit: 'days', note: 'Cast / forged hub' },
  { key: 'logisticHubMaterial', phase: 'Phase 1: Pulley Body', label: 'Logistic – Hub Material', sourcing: 'Logistics', stdDays: 1, overrideDays: 1, unit: 'days' },
  { key: 'hubPreTurning', phase: 'Phase 1: Pulley Body', label: 'Hub Pre-Turning', sourcing: 'In-house', stdDays: 2, overrideDays: 5, unit: 'days', note: 'Depends on size' },
  { key: 'hubShellTackingGrinding', phase: 'Phase 1: Pulley Body', label: 'Hub-to-Shell Tacking & Grinding', sourcing: 'In-house', stdDays: 1, overrideDays: 2, unit: 'days' },
  { key: 'hubShellWeld', phase: 'Phase 1: Pulley Body', label: 'Hub-to-Shell Weld', sourcing: 'In-house', stdDays: 1, overrideDays: 2, unit: 'days' },

  { key: 'stressReliefAnnealing', phase: 'Phase 2: Post-Weld Processing', label: 'Stress Relief Annealing', sourcing: 'Outsource', stdDays: 7, overrideDays: 7, unit: 'days', note: 'Outsourced heat treater' },
  { key: 'logisticStressRelief', phase: 'Phase 2: Post-Weld Processing', label: 'Logistic – Stress Relief (both ways)', sourcing: 'Logistics', stdDays: 6, overrideDays: 6, unit: 'days', note: 'To/from heat treater' },
  { key: 'machiningBody', phase: 'Phase 2: Post-Weld Processing', label: 'Machining – Body (turning, boring, facing)', sourcing: 'Outsource', stdDays: 7, overrideDays: 10, unit: 'days', note: 'Can be in-house or outsourced' },
  { key: 'testDynamicBalancing', phase: 'Phase 2: Post-Weld Processing', label: 'Test & Dynamic Balancing', sourcing: 'In-house', stdDays: 3, overrideDays: 3, unit: 'days' },

  { key: 'shaftProcurement', phase: 'Phase 3: Purchased Components', label: 'Shaft (Procurement / Machining)', sourcing: 'Outsource', stdDays: 84, overrideDays: 84, unit: 'days', note: 'Forged shaft lead time' },
  { key: 'bearingProcurement', phase: 'Phase 3: Purchased Components', label: 'Bearing (Procurement)', sourcing: 'Outsource', stdDays: 60, overrideDays: 60, unit: 'days', note: 'SKF/FAG India: 60-120d' },
  { key: 'housingProcurement', phase: 'Phase 3: Purchased Components', label: 'Bearing Housing (Procurement)', sourcing: 'Outsource', stdDays: 84, overrideDays: 84, unit: 'days', note: 'MASTA/SKF housing' },
  { key: 'sleeveProcurement', phase: 'Phase 3: Purchased Components', label: 'Adapter Sleeve (Procurement)', sourcing: 'Outsource', stdDays: 30, overrideDays: 60, unit: 'days' },
  { key: 'lockingDeviceProcurement', phase: 'Phase 3: Purchased Components', label: 'Locking Device (Procurement)', sourcing: 'Outsource', stdDays: 60, overrideDays: 60, unit: 'days', note: 'NMTG / BIKON' },

  { key: 'laggingApplication', phase: 'Phase 4: Lagging', label: 'Lagging Application', sourcing: 'Outsource', stdDays: 14, overrideDays: 14, unit: 'days', note: 'Rubber hot vulcanised' },
  { key: 'logisticLagging', phase: 'Phase 4: Lagging', label: 'Logistic – Lagging (both ways)', sourcing: 'Logistics', stdDays: 2, overrideDays: 2, unit: 'days' },

  { key: 'finalAssemblyInspection', phase: 'Phase 5: Final Assembly & Dispatch', label: 'Final Assembly & Inspection', sourcing: 'In-house', stdDays: 3, overrideDays: 4, unit: 'days' },
  { key: 'paintingPacking', phase: 'Phase 5: Final Assembly & Dispatch', label: 'Painting & Packing', sourcing: 'In-house', stdDays: 3, overrideDays: 4, unit: 'days' },
  { key: 'weekendBuffer', phase: 'Phase 5: Final Assembly & Dispatch', label: 'Weekend Buffer', sourcing: '—', stdDays: 5, overrideDays: 5, unit: 'days', note: '~10% for weekends' },
]

export const PHASES = [...new Set(DELIVERY_ACTIVITIES.map((a) => a.phase))]

/** Rows that go into the parallel-procurement MAX() group (Phase 3). */
export const MAX_GROUP_KEYS = ['shaftProcurement', 'bearingProcurement', 'housingProcurement', 'sleeveProcurement', 'lockingDeviceProcurement']

/** Every other row that sums into the critical path — Phase 1 (body manufacturing) is
 * deliberately excluded, since it runs in parallel and Phase 3 procurement is longer. */
export const SUM_GROUP_KEYS = [
  'bomRelease',
  'purchasingCritical',
  'stressReliefAnnealing',
  'logisticStressRelief',
  'machiningBody',
  'testDynamicBalancing',
  'laggingApplication',
  'logisticLagging',
  'finalAssemblyInspection',
  'paintingPacking',
  'weekendBuffer',
]

/**
 * Links a Delivery Schedule activity to the Technical Data Sheet's Section 8 process
 * that actually decides it for a real RFQ — the one clear 1:1 label match in the source
 * workbook. Only 4 of the 7 Section 8 processes have a matching Delivery Schedule row;
 * welding, balancing and painting don't (same gap as the outsourced-cost formulas), so
 * those activities stay on their generic default rather than a guessed mapping.
 */
export const ACTIVITY_TO_SRC_KEY: Record<string, string> = {
  rollingBendingCalibration: 'srcRollingBending',
  stressReliefAnnealing: 'srcStressRelief',
  machiningBody: 'srcMachining',
  laggingApplication: 'srcLagging',
}

/** Replicates the source formula exactly: Override only applies when Outsourced. */
export function computeActivityDays(sourcing: DeliverySourcing, stdDays: number, overrideDays: number | undefined): number {
  if (sourcing === 'Outsource') return overrideDays !== undefined && overrideDays !== null ? overrideDays : stdDays
  if (sourcing === 'In-house') return stdDays
  if (sourcing === 'Logistics') return stdDays
  return 0
}

/**
 * Stable IDs for the workbook rows, used by the "Depends on" column. Rows added on the
 * page get N1, N2, ... (see DeliverySchedulePage).
 */
export const ACTIVITY_CODES: Record<string, string> = {
  bomRelease: 'A1', purchasingCritical: 'A2',
  shellPlateProcurement: 'B1', logisticPlates: 'B2', weldPreparation: 'B3', rollingBendingCalibration: 'B4', tackingGrindingShell: 'B5', heatUpWeld: 'B6',
  readyTube: 'R1', logisticReadyTube: 'R2',
  hubMaterialProcurement: 'H1', logisticHubMaterial: 'H2', hubPreTurning: 'H3', hubShellTackingGrinding: 'H4', hubShellWeld: 'H5',
  stressReliefAnnealing: 'C1', logisticStressRelief: 'C2', machiningBody: 'C3', testDynamicBalancing: 'C4',
  shaftProcurement: 'PU1', bearingProcurement: 'PU2', housingProcurement: 'PU3', sleeveProcurement: 'PU4', lockingDeviceProcurement: 'PU5',
  laggingApplication: 'L1', logisticLagging: 'L2',
  finalAssemblyInspection: 'F1', paintingPacking: 'F2', weekendBuffer: 'F3',
}

export type SchedulePreset = 'A' | 'B'
const PURCHASED = ['PU1', 'PU2', 'PU3', 'PU4', 'PU5']

/**
 * Starting points for the "Depends on" column, keyed by the codes above. Rows not listed are
 * excluded (Included unticked).
 *  A — the workbook's own logic: post-weld work waits for the longest purchased item, so the
 *      total is the same 139 days as =MAX(F28:F32)+F6+F7+... Body manufacturing is excluded.
 *  B — body built in parallel with purchasing (an assumption, not the workbook's).
 */
export const PRESET_DEPS: Record<SchedulePreset, Record<string, string[]>> = {
  A: {
    A1: [], A2: ['A1'], PU1: ['A2'], PU2: ['A2'], PU3: ['A2'], PU4: ['A2'], PU5: ['A2'],
    C1: PURCHASED, C2: ['C1'], C3: ['C2'], C4: ['C3'], L1: ['C4'], L2: ['L1'], F1: ['L2'], F2: ['F1'], F3: ['F2'],
  },
  B: {
    A1: [], A2: ['A1'], B1: ['A2'], B2: ['B1'], B3: ['B2'], B4: ['B3'], B5: ['B4'], B6: ['B5'],
    H1: ['A2'], H2: ['H1'], H3: ['H2'], H4: ['B6', 'H3'], H5: ['H4'],
    C1: ['H5'], C2: ['C1'], C3: ['C2'], C4: ['C3'], L1: ['C4'], L2: ['L1'],
    PU1: ['A2'], PU2: ['A2'], PU3: ['A2'], PU4: ['A2'], PU5: ['A2'],
    F1: ['L2', ...PURCHASED], F2: ['F1'], F3: ['F2'],
  },
}
