/**
 * Extracted from the client sample workbook's "Cost Rate Tables" and
 * "Raw Forging Prices" tabs. This is the rate card the Pricing Tool
 * formulas below read from — editable master data screen comes next.
 */

export const PULLEY_COST_RATES = {
  exchangeRateEurToInr: 110,
  gstRate: 0.18,
  oemDiscount: 0.1,
  priceFactorMarkup: 1.8,
  deliverySafetyFactor: 1.2,

  /** Material rates as actually used by Pricing Tool Section A — sourced from the Raw Forging
   * Prices tab (Shell/End Disc = 'Raw Forging Prices'!$I$14/$J$14 flat for every model; Shaft =
   * IF(material='42CrMo4+QT', 'Raw Forging Prices'!$F$4, $F$3)). Cost Rate Tables' own Material
   * Rates section mirrors these values — confirmed with the client — rather than holding a
   * separate figure, so there is only ever one number per material across the app. */
  rawForgingRates: {
    shellPlateInrPerKg: 110,
    endDiscInrPerKg: 210,
    shaftC45InrPerKg: 310,
    shaft42CrMo4InrPerKg: 330,
  },
  weldConsumablesInrPerKgPulley: 6,
  greaseInrPerKgPulley: 18,

  labourRatesInrPerHour: {
    latheTurning: 711.27,
    rollingBending: 893.35,
    weldingMigMag: 497.86,
    grindingFinishing: 491.32,
    assemblyLabour: 911.83,
    engineeringDesign: 338.12,
    paintingSurfacePrep: 924.99,
  },
  heatTreatmentInrPerKg: 8.5,
  stressReliefInrPerKg: 7.2,
  balancingInrPerSet: 1440,
  machiningOutsourcedInrPerKg: 87.17,

  logistics: {
    packingWoodCratePer100kg: 650,
    inboundFreightShaftPerKg: 2.2,
    inboundFreightPlatesPerKg: 1.8,
    inboundFreightPurchasedPartsPerOrder: 1500,
    outboundShippingFobPerKg: 3.5,
  },
}
