/**
 * Mirrors the client's "In-House Hours" tab's own cost-head legend (columns A-E) exactly —
 * the simple lookup table the client actually wants shown, replacing the detailed MHR & LHR
 * machine-economics breakdown. Cost Centre is blank in the source sheet for every row.
 */

export interface InHouseHourRate {
  costHead: string
  operation: string
  costCentre: string
  activityDescription: string
  mhrRate: number
}

export const IN_HOUSE_HOURS_RATES: InHouseHourRate[] = [
  { costHead: '10b. Rolling / Bending Shell', operation: 'Rolling / bending', costCentre: '—', activityDescription: 'C1. Rolling / Bending Shell', mhrRate: 79.01 },
  { costHead: '10c. Welding – Shell & Hub', operation: 'Welding (MIG/MAG) / Grinding-finishing', costCentre: '—', activityDescription: 'C2. Welding – Shell & Hub', mhrRate: 24.52 },
  { costHead: '10d. Machining / Turning Body', operation: 'Lathe turning', costCentre: '—', activityDescription: 'C3. Machining / Turning Body', mhrRate: 42.90 },
  { costHead: '10p. Assembly + Engineering', operation: 'Engineering / design', costCentre: '—', activityDescription: 'C4. Assembly + Engineering', mhrRate: 17.03 },
  { costHead: '10q. Testing / Inspection / QC', operation: 'Testing / Inspection', costCentre: '—', activityDescription: 'C5. Testing / Inspection / QC', mhrRate: 12.96 },
  { costHead: '10o. Painting & Surface Prep', operation: 'Engineering / design', costCentre: '—', activityDescription: 'C6. Painting & Surface Prep', mhrRate: 0 },
]
