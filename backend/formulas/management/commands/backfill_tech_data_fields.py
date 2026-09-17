"""
One-time backfill: transcribes every field currently in the frontend's hardcoded
src/data/pulleyTechDataSchema.ts (TECH_DATA_SECTIONS) into TechDataFieldDefinition
rows, so the Technical Data Sheet's schema itself becomes admin-editable (adding a
brand-new field, Manual or Auto) rather than requiring a code change + deploy.

Same hand-transcription approach as seed_formulas.py (no TS parser exists) — this
is the sibling command that seeds the ~70 field *definitions* (manual + auto),
where seed_formulas.py only ever seeded the ~21 auto *expressions*. Every field
seeded here is flagged is_core=True (can't be deleted, key/field_type locked) and,
where a matching FormulaDefinition already exists (from seed_formulas.py), linked
via `formula` so it renders as Auto.

Six fields (bearing1Price, bearing2Price, sleevePrice, housingPrice, laggingRate,
lockingDevicePrice) are read-only in the UI but have NO formula — their value comes
from a catalog lookup (PRICE_FIELD_SOURCE/lookupCatalogPrice) triggered when a
paired "designation" field changes, not from FormulaDefinition-backed evaluation.
These are flagged is_catalog_derived=True instead of getting a `formula`.
"""

from django.core.management.base import BaseCommand

from formulas.models import FormulaDefinition, TechDataFieldDefinition

CATALOG_DERIVED_KEYS = {"bearing1Price", "bearing2Price", "sleevePrice", "housingPrice", "laggingRate", "lockingDevicePrice"}

# One row per field: (key, label, section, unit, field_type, options, auto)
# `auto=True` means "look up a FormulaDefinition with this key and link it, or flag
# is_catalog_derived if it's one of the six catalog-priced fields above."
FIELD_ROWS: list[tuple[str, str, str, str, str, list[str], bool]] = [
    # 1. PROJECT INFORMATION
    ("quoteReference", "Project / Quote Reference", "1. PROJECT INFORMATION", "", "text", [], False),
    ("pulleyTag", "Pulley Tag / Name", "1. PROJECT INFORMATION", "", "text", [], False),
    ("pulleyStructure", "Pulley Structure", "1. PROJECT INFORMATION", "", "text", [], False),
    ("qty", "Number of Pulleys (qty)", "1. PROJECT INFORMATION", "nos", "number", [], False),
    # 2. PULLEY BODY DIMENSIONS
    ("shellOD", "Shell Outer Diameter  Dshell", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("shellFaceWidth", "Shell Face Width  Lface", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("shellRawThickness", "Shell Raw Thickness", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("sheetWidth", "Sheet Width", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("sheetLength", "Sheet Length", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], True),
    ("overallDiaWithLagging", "Overall Pulley Diameter with Lagging", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("bearingHousingDistance", "Bearing Housing Distance  L1", "2. PULLEY BODY DIMENSIONS", "mm", "number", [], False),
    ("totalPulleyMass", "Total Pulley Mass  mtotal", "2. PULLEY BODY DIMENSIONS", "kg", "number", [], False),
    ("shellPlateWeight", "Sheel Plate Weight", "2. PULLEY BODY DIMENSIONS", "kg", "number", [], True),
    ("shellRatePerKg", "Shell Rate Per Kg", "2. PULLEY BODY DIMENSIONS", "INR", "number", [], False),
    # 3. HUB SPECIFICATIONS
    ("hubType", "Hub Type", "3. HUB SPECIFICATIONS", "", "text", [], False),
    ("hubWidth", "Hub Width  Whub", "3. HUB SPECIFICATIONS", "mm", "number", [], False),
    ("hubMinOD", "Min. Outer Diameter of Hub  DN", "3. HUB SPECIFICATIONS", "mm", "number", [], False),
    ("hubID", "Hub Inner Diameter  d_LD (= LD bore)", "3. HUB SPECIFICATIONS", "mm", "number", [], False),
    ("hubMass", "Hub Mass (est., 2 hubs)", "3. HUB SPECIFICATIONS", "kg", "number", [], True),
    ("endDiskRatePerKg", "End Disk Per Kg", "3. HUB SPECIFICATIONS", "INR", "number", [], False),
    # 4. SHAFT SPECIFICATIONS
    ("shaftLength", "Shaft Total Length  Lshaft", "4. SHAFT SPECIFICATIONS", "mm", "number", [], False),
    ("shaftDiameter", "Shaft Centre Diameter  d4", "4. SHAFT SPECIFICATIONS", "mm", "number", [], False),
    ("shaftMaterial", "Shaft Material", "4. SHAFT SPECIFICATIONS", "", "text", [], False),
    ("shaftMass", "Shaft Mass", "4. SHAFT SPECIFICATIONS", "kg", "number", [], True),
    ("shaftRatePerKg", "Shaft Per Kg", "4. SHAFT SPECIFICATIONS", "INR", "number", [], False),
    # 5. BEARINGS, HOUSINGS & SLEEVES
    ("bearing1Designation", "Bearing 1 Designation", "5. BEARINGS, HOUSINGS & SLEEVES", "", "select", [], False),
    ("bearing1Price", "Bearing 1 Price", "5. BEARINGS, HOUSINGS & SLEEVES", "INR/ea", "number", [], True),
    ("bearing2Designation", "Bearing 2 Designation", "5. BEARINGS, HOUSINGS & SLEEVES", "", "select", [], False),
    ("bearing2Price", "Bearing 2 Price", "5. BEARINGS, HOUSINGS & SLEEVES", "INR/ea", "number", [], True),
    ("sleeveCode", "Adapter Sleeve Code", "5. BEARINGS, HOUSINGS & SLEEVES", "", "select", [], False),
    ("sleevePrice", "Sleeve Price", "5. BEARINGS, HOUSINGS & SLEEVES", "INR/ea", "number", [], True),
    ("housingDesignation", "Housing Designation", "5. BEARINGS, HOUSINGS & SLEEVES", "", "select", [], False),
    ("housingPrice", "Housing Price", "5. BEARINGS, HOUSINGS & SLEEVES", "INR/ea", "number", [], True),
    ("totalBearingsHousings", "Total Bearings + Sleeves + Housings (2x each)", "5. BEARINGS, HOUSINGS & SLEEVES", "INR", "number", [], True),
    # 6. LAGGING
    ("laggingType", "Lagging Type", "6. LAGGING", "", "select", [], False),
    ("laggingThickness", "Lagging Thickness", "6. LAGGING", "mm", "number", [], False),
    ("laggingArea", "Lagging Area", "6. LAGGING", "m²", "number", [], True),
    ("laggingRate", "Lagging Rate", "6. LAGGING", "INR/m²", "number", [], True),
    ("laggingCost", "Lagging Cost", "6. LAGGING", "INR", "number", [], True),
    # 7. LOCKING DEVICE & DEAD SHAFT PARTS
    ("lockingDeviceType", "Locking Device Type", "7. LOCKING DEVICE & DEAD SHAFT PARTS", "", "select", [], False),
    ("lockingDevicePrice", "Locking Device INR Price", "7. LOCKING DEVICE & DEAD SHAFT PARTS", "INR", "number", [], True),
    ("deadShaftParts", "Dead Shaft Parts (inner tube, supports, seals)", "7. LOCKING DEVICE & DEAD SHAFT PARTS", "INR", "number", [], False),
    # 8. SOURCING SELECTION
    ("srcRollingBending", "Rolling / Bending Shell", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcWelding", "Welding (Shell + Hub)", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcStressRelief", "Stress Relief Annealing", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcMachining", "Turning / Machining (Body)", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcLagging", "Lagging Application", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcBalancing", "Static Balancing", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
    ("srcPainting", "Painting / Blasting", "8. SOURCING SELECTION", "", "select", ["In-house", "Outsource", "Logistics"], False),
]

IN_HOUSE_OPS = [
    ("c1", "C1. Rolling / Bending Shell"),
    ("c2", "C2. Welding – Shell & Hub"),
    ("c3", "C3. Machining / Turning Body"),
    ("c4", "C4. Assembly + Engineering"),
    ("c5", "C5. Testing / Inspection / QC"),
    ("c6", "C6. Painting & Surface Prep"),
    ("c7", "C7. Hub Pre-Turning"),
]


def in_house_hours_rows() -> list[tuple[str, str, str, str, str, list[str], bool]]:
    rows = []
    for key, label in IN_HOUSE_OPS:
        rows.append((f"{key}RunMin", f"{label} — Run Time", "9. IN-HOUSE PROCESSING HOURS", "min", "number", [], False))
        rows.append((f"{key}SetupMin", f"{label} — Setup Time", "9. IN-HOUSE PROCESSING HOURS", "min", "number", [], False))
        rows.append((f"{key}TotalHours", f"{label} — Total Hours", "9. IN-HOUSE PROCESSING HOURS", "h", "number", [], True))
        rows.append((f"{key}Cost", f"{label} — Cost", "9. IN-HOUSE PROCESSING HOURS", "INR", "number", [], True))
    return rows


class Command(BaseCommand):
    help = "Backfill TechDataFieldDefinition rows from the frontend's hardcoded pulleyTechDataSchema.ts."

    def handle(self, *args, **options):
        all_rows = FIELD_ROWS + in_house_hours_rows()
        formulas_by_key = {f.key: f for f in FormulaDefinition.objects.all()}

        section_orders: dict[str, int] = {}
        total = 0
        for key, label, section, unit, field_type, options, auto in all_rows:
            order = section_orders.get(section, 0)
            section_orders[section] = order + 1

            formula = None
            is_catalog_derived = False
            if auto:
                if key in CATALOG_DERIVED_KEYS:
                    is_catalog_derived = True
                else:
                    formula = formulas_by_key.get(key)
                    if formula is None:
                        self.stderr.write(self.style.WARNING(f"'{key}' expected an auto formula but none was found — run seed_formulas first. Seeding as Manual for now."))

            TechDataFieldDefinition.objects.update_or_create(
                key=key,
                defaults={
                    "label": label,
                    "section": section,
                    "unit": unit,
                    "field_type": field_type,
                    "options": options,
                    "formula": formula,
                    "order": order,
                    "is_core": True,
                    "is_catalog_derived": is_catalog_derived,
                },
            )
            total += 1

        self.stdout.write(self.style.SUCCESS(f"Backfilled {total} technical data sheet field definitions."))
