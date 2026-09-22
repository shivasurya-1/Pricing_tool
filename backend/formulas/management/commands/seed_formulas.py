"""
One-time migration: seed every auto-calculated field from the frontend's hardcoded
TypeScript (src/lib/pulleyTechDataCalc.ts computeAutoFields(), src/lib/pulleyPricingCalc.ts
computePulleyPricing()) as an editable FormulaDefinition row — see the backend build
plan's "Formula Registry" section for the full enumeration this mirrors.

Conventions used so every formula stays a plain restricted arithmetic expression:
  - `iff(cond, a, b)` replaces a ternary/ IF — one syntax valid on both the Python
    (simpleeval) and JS (expr-eval) evaluators, unlike native ternary syntax which
    differs between the two languages.
  - `pow(x, y)` replaces `**`/`^` for the same cross-language reason.
  - A boolean "is this process outsourced" flag (e.g. srcStressReliefIsOutsource) is
    resolved by the calling code from the categorical In-house/Outsource/Logistics
    field before evaluation — formulas themselves never do string comparison.
  - Per-operation labour rate variables (e.g. c1RateInrPerHour) and section totals
    (totalA..totalE) are likewise resolved by the caller from CostRateValue /
    already-evaluated formulas, keeping every expression here a simple, editable
    one-line calculation.
  - Fields with NO formula in the client's own workbook (A3, B5, D1, D3, D8, E6) are
    still seeded, as `expression="0"`, so they show up on the Formulas page ready for
    the client to fill in once Section 3 of the clarification questionnaire is answered.
"""

from django.core.management.base import BaseCommand

from formulas.models import FormulaDefinition, Section, TECH_DATA_AUTO_SECTION_KEY, TECH_DATA_AUTO_SECTION_LABEL

# (registry key, display label — the label is the actual value stored in every
# FormulaDefinition.section field below; the key only identifies the Section row
# itself). Was FormulaSection's fixed choices; Section is now a plain
# user-manageable registry (see formulas/models.py), but these are still the 7
# sections this command's own seed data is organized into.
FORMULA_SECTIONS = [
    (TECH_DATA_AUTO_SECTION_KEY, TECH_DATA_AUTO_SECTION_LABEL),
    ("SectionA", "Pricing Section A — Raw Materials"),
    ("SectionB", "Pricing Section B — Ancillary Parts"),
    ("SectionC", "Pricing Section C — In-House Processing"),
    ("SectionD", "Pricing Section D — Outsourced Processing"),
    ("SectionE", "Pricing Section E — Packing & Shipment"),
    ("SectionF", "Pricing Section F — Summary"),
]

IN_HOUSE_OPS = [
    ("c1", "Rolling / Bending Shell", "rollingBending"),
    ("c2", "Welding – Shell & Hub", "weldingMigMag"),
    ("c3", "Machining / Turning Body", "latheTurning"),
    ("c4", "Assembly + Engineering", "assemblyLabour"),
    ("c5", "Testing / Inspection / QC", "engineeringDesign"),
    ("c6", "Painting & Surface Prep", "paintingSurfacePrep"),
    ("c7", "Hub Pre-Turning", "latheTurning"),
]


def tech_data_auto_rows() -> list[dict]:
    rows = [
        dict(key="sheetLength", label="Sheet Development Length", expression="iff(shellOD > 0, (shellOD + 10 - shellRawThickness) * PI + 100, 0)", vars=["shellOD", "shellRawThickness"], unit="mm"),
        dict(key="shellPlateWeight", label="Shell Plate Weight", expression="shellRawThickness * (sheetWidth / 1000) * (sheetLength / 1000) * 7.85", vars=["shellRawThickness", "sheetWidth", "sheetLength"], unit="kg"),
        dict(key="hubMass", label="Hub Mass (2 hubs)", expression="iff(hubMinOD > 0, 2 * (PI / 4) * (pow(hubMinOD / 1000, 2) - pow(hubID / 1000, 2)) * (hubWidth / 1000) * 7850, 0)", vars=["hubMinOD", "hubID", "hubWidth"], unit="kg"),
        dict(key="shaftMass", label="Shaft Mass", expression="iff(shaftDiameter > 0, (PI / 4) * pow(shaftDiameter / 1000, 2) * (shaftLength / 1000) * 7850, 0)", vars=["shaftDiameter", "shaftLength"], unit="kg"),
        dict(key="laggingArea", label="Lagging Area", expression="iff(shellOD > 0, PI * (shellOD / 1000) * (shellFaceWidth / 1000), 0)", vars=["shellOD", "shellFaceWidth"], unit="m²"),
        dict(key="laggingCost", label="Lagging Cost", expression="laggingArea * laggingRate", vars=["laggingArea", "laggingRate"], unit="INR"),
        dict(key="totalBearingsHousings", label="Total Bearings + Sleeves + Housings (2x each)", expression="2 * (bearing1Price + bearing2Price + sleevePrice + housingPrice)", vars=["bearing1Price", "bearing2Price", "sleevePrice", "housingPrice"], unit="INR"),
    ]
    for key, label, _rate_key in IN_HOUSE_OPS:
        rows.append(dict(key=f"{key}TotalHours", label=f"{label} — Total Hours", expression=f"({key}RunMin + {key}SetupMin) / 60", vars=[f"{key}RunMin", f"{key}SetupMin"], unit="h"))
        rows.append(dict(key=f"{key}Cost", label=f"{label} — Cost", expression=f"{key}TotalHours * {key}RateInrPerHour", vars=[f"{key}TotalHours", f"{key}RateInrPerHour"], unit="INR"))
    return rows


def section_a_rows() -> list[dict]:
    return [
        dict(key="sectionA.a1", label="A1. Shell / Body Material (IS 2062 E350)", expression="shellRatePerKg * shellPlateWeight", vars=["shellRatePerKg", "shellPlateWeight"], unit="INR"),
        dict(key="sectionA.a2", label="A2. End Disc / End Plate Material (IS 2062)", expression="endDiscRatePerKg * hubMass", vars=["endDiscRatePerKg", "hubMass"], unit="INR"),
        dict(key="sectionA.a3", label="A3. Hub Material (Cast Steel GS-52)", expression="0", vars=[], unit="INR"),
        dict(key="sectionA.a4", label="A4. Shaft Material (C45 / 42CrMo4+QT)", expression="shaftMaterialRateInrPerKg * shaftMass", vars=["shaftMaterialRateInrPerKg", "shaftMass"], unit="INR"),
        dict(key="sectionA.a5", label="A5. Weld Consumables (per kg pulley)", expression="weldConsumablesInrPerKgPulley * shellPlateWeight", vars=["weldConsumablesInrPerKgPulley", "shellPlateWeight"], unit="INR"),
        dict(key="sectionA.a6", label="A6. Grease (per kg pulley)", expression="greaseInrPerKgPulley * hubMass", vars=["greaseInrPerKgPulley", "hubMass"], unit="INR"),
    ]


def section_b_rows() -> list[dict]:
    return [
        dict(key="sectionB.b1", label="B1. Bearings (2× Drive + 2× Non-Drive)", expression="bearing1Price + bearing2Price", vars=["bearing1Price", "bearing2Price"], unit="INR"),
        dict(key="sectionB.b2", label="B2. Adapter Sleeves (2×)", expression="2 * sleevePrice", vars=["sleevePrice"], unit="INR"),
        dict(key="sectionB.b3", label="B3. Bearing Housings (2×)", expression="2 * housingPrice", vars=["housingPrice"], unit="INR"),
        dict(key="sectionB.b4", label="B4. Locking Device", expression="lockingDevicePrice * 2", vars=["lockingDevicePrice"], unit="INR"),
        dict(key="sectionB.b5", label="B5. Lagging (supply & material only)", expression="0", vars=[], unit="INR"),
        dict(key="sectionB.b6", label="B6. Dead Shaft Parts (inner tube, supports, seals)", expression="deadShaftParts", vars=["deadShaftParts"], unit="INR"),
    ]


def section_c_rows() -> list[dict]:
    return [
        dict(key=f"sectionC.{key}", label=label, expression=f"{key}Cost", vars=[f"{key}Cost"], unit="INR")
        for key, label, _rate_key in IN_HOUSE_OPS
    ]


def section_d_rows() -> list[dict]:
    return [
        dict(key="sectionD.d1", label="D1. Machining / Turning Body (Outsourced)", expression="0", vars=[], unit="INR"),
        dict(key="sectionD.d2", label="D2. Stress Relief Annealing (Outsourced)", expression="iff(srcStressReliefIsOutsource, stressReliefInrPerKg * shellPlateWeight, 0)", vars=["srcStressReliefIsOutsource", "stressReliefInrPerKg", "shellPlateWeight"], unit="INR"),
        dict(key="sectionD.d3", label="D3. Heat Treatment – Normalising (Outsourced)", expression="0", vars=[], unit="INR"),
        dict(key="sectionD.d4", label="D4. Painting / Blasting (Outsourced)", expression="iff(srcPaintingIsOutsource, paintingSurfacePrepInrPerM2 * laggingArea, 0)", vars=["srcPaintingIsOutsource", "paintingSurfacePrepInrPerM2", "laggingArea"], unit="INR"),
        dict(key="sectionD.d5", label="D5. Lagging Application Labour (Outsourced)", expression="iff(srcLaggingIsOutsource, laggingCost, 0)", vars=["srcLaggingIsOutsource", "laggingCost"], unit="INR"),
        dict(key="sectionD.d6", label="D6. Dynamic Balancing (Outsourced per set)", expression="iff(srcBalancingIsOutsource, balancingInrPerSet, 0)", vars=["srcBalancingIsOutsource", "balancingInrPerSet"], unit="INR"),
        dict(key="sectionD.d7", label="D7. Rolling / Bending Shell (Outsourced)", expression="iff(srcRollingBendingIsOutsource, machiningOutsourcedInrPerKg * shellPlateWeight * 0.5, 0)", vars=["srcRollingBendingIsOutsource", "machiningOutsourcedInrPerKg", "shellPlateWeight"], unit="INR"),
        dict(key="sectionD.d8", label="D8. Shaft Machining (always at specialty vendor)", expression="0", vars=[], unit="INR"),
    ]


def section_e_rows() -> list[dict]:
    return [
        dict(key="sectionE.e1", label="E1. Packing – Wood Crate (per 100 kg)", expression="(totalPulleyMass / 100) * packingWoodCratePer100kg", vars=["totalPulleyMass", "packingWoodCratePer100kg"], unit="INR"),
        dict(key="sectionE.e2", label="E2. Inbound Freight – Shaft (per kg)", expression="shaftMass * inboundFreightShaftPerKg", vars=["shaftMass", "inboundFreightShaftPerKg"], unit="INR"),
        dict(key="sectionE.e3", label="E3. Inbound Freight – Plates (per kg)", expression="shellPlateWeight * inboundFreightPlatesPerKg", vars=["shellPlateWeight", "inboundFreightPlatesPerKg"], unit="INR"),
        dict(key="sectionE.e4", label="E4. Inbound Freight – Purchased Parts (per order)", expression="inboundFreightPurchasedPartsPerOrder", vars=["inboundFreightPurchasedPartsPerOrder"], unit="INR"),
        dict(key="sectionE.e5", label="E5. Outbound Shipping FOB (per kg)", expression="totalPulleyMass * outboundShippingFobPerKg", vars=["totalPulleyMass", "outboundShippingFobPerKg"], unit="INR"),
        dict(key="sectionE.e6", label="E6. Other Miscellaneous Logistics / Inspection", expression="0", vars=[], unit="INR"),
    ]


def section_f_rows() -> list[dict]:
    return [
        dict(key="sectionF.totalDirectCostPerUnit", label="Total Direct Cost (A+B+C+D+E) per unit", expression="totalA + totalB + totalC + totalD + totalE", vars=["totalA", "totalB", "totalC", "totalD", "totalE"], unit="INR"),
        dict(key="sectionF.totalDirectCost", label="Total Direct Cost x Qty", expression="totalDirectCostPerUnit * qty", vars=["totalDirectCostPerUnit", "qty"], unit="INR"),
        dict(key="sectionF.listPrice", label="Gross List Price (HK0 x markup)", expression="totalDirectCost * priceFactorMarkup", vars=["totalDirectCost", "priceFactorMarkup"], unit="INR"),
        dict(key="sectionF.netOemPrice", label="Net OEM Price (- OEM discount)", expression="listPrice * (1 - oemDiscount)", vars=["listPrice", "oemDiscount"], unit="INR"),
        dict(key="sectionF.priceInclGst", label="Price incl. GST", expression="netOemPrice * (1 + gstRate)", vars=["netOemPrice", "gstRate"], unit="INR"),
        dict(key="sectionF.netPriceEur", label="Net Price EUR equivalent", expression="netOemPrice / exchangeRateEurToInr", vars=["netOemPrice", "exchangeRateEurToInr"], unit="EUR"),
        dict(key="sectionF.grossMarginPercent", label="Gross Margin %", expression="iff(listPrice > 0, ((listPrice - totalDirectCost) / listPrice) * 100, 0)", vars=["listPrice", "totalDirectCost"], unit="%"),
        dict(key="sectionF.itemTotal", label="Item Total (Qty x Net OEM Price)", expression="netOemPrice * qty", vars=["netOemPrice", "qty"], unit="INR"),
    ]


class Command(BaseCommand):
    help = "Seed every auto-calculated formula from the frontend's hardcoded TS as an editable FormulaDefinition."

    def handle(self, *args, **options):
        for order, (key, label) in enumerate(FORMULA_SECTIONS):
            Section.objects.get_or_create(key=key, defaults={"label": label, "order": order})

        groups = [
            (TECH_DATA_AUTO_SECTION_LABEL, tech_data_auto_rows()),
            ("Pricing Section A — Raw Materials", section_a_rows()),
            ("Pricing Section B — Ancillary Parts", section_b_rows()),
            ("Pricing Section C — In-House Processing", section_c_rows()),
            ("Pricing Section D — Outsourced Processing", section_d_rows()),
            ("Pricing Section E — Packing & Shipment", section_e_rows()),
            ("Pricing Section F — Summary", section_f_rows()),
        ]
        total = 0
        for section, rows in groups:
            for order, row in enumerate(rows):
                FormulaDefinition.objects.update_or_create(
                    key=row["key"],
                    defaults={
                        "label": row["label"],
                        "section": section,
                        "expression": row["expression"],
                        "input_variables": row["vars"],
                        "output_unit": row["unit"],
                        "order": order,
                    },
                )
                total += 1
        self.stdout.write(self.style.SUCCESS(f"Seeded {total} formula definitions."))
