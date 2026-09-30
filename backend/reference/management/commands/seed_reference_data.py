"""
One-time migration: seed the Cost Rate Tables, Raw Forging Prices (shaft/shell bands), and the 5 catalogs from the
frontend's existing static TS files (src/data/pulleyCostRates.ts, pulleyCatalogs.ts),
so the backend starts from numbers already verified against the client's workbook —
see the backend build plan's "Build Order" step 2.

Catalog entries are parsed straight out of the TS source (regular `{ key: value, ... }`
object literals, one per line) rather than retyped by hand, so there is no risk of a
transcription error across the ~270 rows.
"""

import re
from pathlib import Path

from django.core.management.base import BaseCommand

from reference.models import (
    BearingCatalogEntry,
    GlobalParameter,
    HousingCatalogEntry,
    InHouseHourRate,
    LagDataEntry,
    LaggingCatalogEntry,
    LcdDataEntry,
    LockingDeviceCatalogEntry,
    LogisticsPackingRate,
    MachiningLabourRate,
    MaterialRate,
    ShaftForgingBand,
    ShellForgingBand,
    SleeveCatalogEntry,
)

FRONTEND_SRC = Path(__file__).resolve().parents[4] / "src" / "data"

OBJECT_RE = re.compile(r"\{([^{}]*)\}")
PAIR_RE = re.compile(r"(\w+)\s*:\s*('(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?)")


def parse_ts_array(file_text: str, const_name: str) -> list[dict]:
    """Extract every `{ ... }` object literal inside `export const <const_name> = [...]`."""
    start = file_text.index(f"export const {const_name}")
    equals_sign = file_text.index("=", start)
    array_start = file_text.index("[", equals_sign)
    depth = 0
    end = array_start
    for i, ch in enumerate(file_text[array_start:], start=array_start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    block = file_text[array_start:end]

    rows = []
    for obj_match in OBJECT_RE.finditer(block):
        row = {}
        for key, value in PAIR_RE.findall(obj_match.group(1)):
            if value.startswith("'"):
                row[key] = value[1:-1]
            elif "." in value:
                row[key] = float(value)
            else:
                row[key] = int(value)
        if row:
            rows.append(row)
    return rows


def lagging_key(lagging_type: str) -> str:
    """'Rubber vulc. 12mm' -> 'rubber_vulc_12mm' — same rule as migration 0004."""
    return re.sub(r"[^0-9A-Za-z]+", "_", lagging_type).strip("_").lower()


class Command(BaseCommand):
    help = "Seed reference data (cost rates, raw forging rates, component catalogs) from the frontend's TS source files."

    def handle(self, *args, **options):
        self.seed_cost_rates()
        self.seed_raw_forging_rates()
        self.seed_lag_data()
        self.seed_lcd_data()
        self.seed_catalogs()
        self.seed_in_house_hours()
        self.stdout.write(self.style.SUCCESS("Reference data seeded."))

    def seed_cost_rates(self):
        tables = [
            (GlobalParameter, "parameter", "value", [
                ("exchangeRateEurToInr", "Exchange Rate EUR → INR", 110, "INR/EUR"),
                ("gstRate", "GST Rate", 0.18, "%"),
                ("oemDiscount", "OEM Discount", 0.1, "%"),
                ("priceFactorMarkup", "Price Factor HK0 (markup)", 1.8, "×"),
                ("deliverySafetyFactor", "Delivery Safety Factor", 1.2, "×"),
                # Process rates that aren't hourly, so they don't fit Machining & Labour's INR/h column.
                ("paintingSurfacePrep", "Painting / surface prep", 924.99, "INR/m²"),
                ("heatTreatmentInrPerKg", "Heat treatment / annealing (per kg)", 8.5, "INR/kg"),
                ("stressReliefInrPerKg", "Stress relief (per kg)", 7.2, "INR/kg"),
                ("balancingInrPerSet", "Balancing (per set)", 1440, "INR/set"),
                ("machiningOutsourcedInrPerKg", "Machining body – outsourced (per kg)", 87.17, "INR/kg"),
            ]),
            (MaterialRate, "material", "inr_per_kg", [
                ("weldConsumablesInrPerKgPulley", "Weld consumables (per kg pulley)", 6, None),
                ("greaseInrPerKgPulley", "Grease (per kg pulley)", 18, None),
            ]),
            (MachiningLabourRate, "operation", "inr_per_hour", [
                ("latheTurning", "Lathe turning", 711.27, None),
                ("rollingBending", "Rolling / bending", 893.35, None),
                ("weldingMigMag", "Welding (MIG/MAG)", 497.86, None),
                ("grindingFinishing", "Grinding / finishing", 491.32, None),
                ("assemblyLabour", "Assembly labour", 911.83, None),
                ("engineeringDesign", "Engineering / design", 338.12, None),
            ]),
            (LogisticsPackingRate, "item", "rate", [
                ("packingWoodCratePer100kg", "Packing – wood crate (per 100 kg)", 650, "INR/100kg"),
                ("inboundFreightShaftPerKg", "Inbound freight – shaft (per kg)", 2.2, "INR/kg"),
                ("inboundFreightPlatesPerKg", "Inbound freight – plates (per kg)", 1.8, "INR/kg"),
                ("inboundFreightPurchasedPartsPerOrder", "Inbound freight – purchased parts (per order)", 1500, "INR/order"),
                ("outboundShippingFobPerKg", "Outbound shipping FOB (per kg)", 3.5, "INR/kg"),
            ]),
        ]
        total = 0
        for model, name_field, value_field, rows in tables:
            for order, (key, name, value, unit) in enumerate(rows):
                defaults = {name_field: name, value_field: value, "order": order}
                if unit is not None:
                    defaults["unit"] = unit
                model.objects.update_or_create(key=key, defaults=defaults)
            total += len(rows)
        self.stdout.write(f"  cost rates: {total}")

    def seed_raw_forging_rates(self):
        # Transcribed from the client workbook's "Raw Forging Prices" sheet (B2:F5 shaft,
        # A12:J17 shell). Shaft rate = column F (the ₹/kg Pricing Tool reads); blank means
        # "As per RFQ / Need Basis". Shell rates = columns I (Plate) and J (End Disc/Hub);
        # the workbook's "???" cells are left blank.
        shaft_rows = [
            dict(material="C45", diameter="Ø 80 - 180", length="2000 - 3000", as_forge_rate_inr_per_kg=310),
            dict(material="42CrMo4+QT", diameter="Ø 200 - 880", length="2300 - 7300", as_forge_rate_inr_per_kg=330),
            dict(material="30CrNiMo8+QT/36CrNiMo4+QT/34CrNiMo6+QT", diameter="Ø 300 - 450", length="2300 - 7300", as_forge_rate_inr_per_kg=None),
        ]
        shell_rows = [
            dict(sourcing="Outsourced", diameter_body="300 - <=500", face_width_body="800-1200", wall_thickness="10-12",
                 welded_in_plate_thickness="50-80", t_bottom_thickness="", plate_rate_inr_per_kg=None, end_disc_hub_rate_inr_per_kg=None),
            dict(sourcing="Inhouse", diameter_body=">550-1000", face_width_body="1200-2500", wall_thickness="15-40",
                 welded_in_plate_thickness="50-90", t_bottom_thickness="100-150", plate_rate_inr_per_kg=110, end_disc_hub_rate_inr_per_kg=210),
            dict(sourcing="Inhouse", diameter_body="1000-1500", face_width_body="1500-2500", wall_thickness="20-40",
                 welded_in_plate_thickness="", t_bottom_thickness="100-200", plate_rate_inr_per_kg=110, end_disc_hub_rate_inr_per_kg=210),
            dict(sourcing="Inhouse", diameter_body="1500-2000", face_width_body="1500-2500", wall_thickness="20-40",
                 welded_in_plate_thickness="", t_bottom_thickness="100-200", plate_rate_inr_per_kg=130, end_disc_hub_rate_inr_per_kg=210),
            dict(sourcing="Inhouse", diameter_body=">2000", face_width_body="1500-2500", wall_thickness="20-40",
                 welded_in_plate_thickness="", t_bottom_thickness="100-200", plate_rate_inr_per_kg=None, end_disc_hub_rate_inr_per_kg=210),
        ]
        for order, row in enumerate(shaft_rows):
            ShaftForgingBand.objects.get_or_create(
                material=row.pop("material"), diameter=row.pop("diameter"), defaults={**row, "order": order},
            )
        for order, row in enumerate(shell_rows):
            ShellForgingBand.objects.get_or_create(
                sourcing=row.pop("sourcing"), diameter_body=row.pop("diameter_body"), defaults={**row, "order": order},
            )
        self.stdout.write(f"  raw forging bands: {len(shaft_rows)} shaft, {len(shell_rows)} shell")

    def seed_lag_data(self):
        # Transcribed from the client workbook's LAG_DATA sheet (A1:E12).
        rows = [
            ("Rubber vulc. 12mm", 12, 19387, 14, "Rubber hot vulcanized 12mm"),
            ("Rubber vulc. 15mm", 15, 20702, 14, "Rubber hot vulcanized 15mm"),
            ("Rubber vulc. 20mm", 20, 22439, 14, "Rubber hot vulcanized 20mm"),
            ("Rubber vulc. 25mm", 25, 24222, 14, "Rubber hot vulcanized 25mm"),
            ("Rubber vulc. 30mm", 30, 26241, 14, "Rubber hot vulcanized 30mm"),
            ("Rubber ceramic 15mm", 15, 27344, 14, "Rubber + ceramic inserts 15mm"),
            ("Rubber ceramic 20mm", 20, 29574, 14, "Rubber + ceramic inserts 20mm"),
            ("Rubber ceramic 25mm", 25, 31828, 14, "Rubber + ceramic inserts 25mm"),
            ("Ceramic tile 6mm", 6, 148661, 7, "Full ceramic tiles 6mm"),
            ("Ceramic tile 10mm", 10, 193950, 7, "Full ceramic tiles 10mm"),
            ("No lagging", 0, 0, 0, "No lagging – bare shell"),
        ]
        for lagging_type, thickness, price, days, description in rows:
            LagDataEntry.objects.get_or_create(
                lagging_type=lagging_type,
                defaults={"thickness_mm": thickness, "price_inr_per_m2": price, "delivery_days": days, "description": description},
            )
        self.stdout.write(f"  lag data: {len(rows)}")

    def seed_lcd_data(self):
        # Transcribed from the client workbook's LCD_DATA sheet (A2:D7).
        rows = [
            ("NMTG N7036-100 × 150", "₹25,000 – ₹35,000", 30000, "Estimate"),
            ("NMTG N7036-120 × 170", "₹32,000 – ₹45,000", 40000, "Estimate"),
            ("NMTG N7036-140 × 200", "₹42,000 – ₹58,000", 50000, "Estimate"),
            ("NMTG N7036-170 × 240", "₹60,000 – ₹80,000", 70000, "Estimate"),
            ("NMTG N7036-180 × 250", "₹65,000 – ₹90,000", 80000, "Estimate"),
        ]
        for model_size, indicative_price, negotiated_rate, remarks in rows:
            LcdDataEntry.objects.get_or_create(
                model_size=model_size,
                defaults={"indicative_price": indicative_price, "negotiated_rate_inr": negotiated_rate, "remarks": remarks},
            )
        self.stdout.write(f"  lcd data: {len(rows)}")

    def seed_catalogs(self):
        catalogs_ts = (FRONTEND_SRC / "pulleyCatalogs.ts").read_text(encoding="utf-8")

        bearings = parse_ts_array(catalogs_ts, "BRG_CATALOG")
        for row in bearings:
            BearingCatalogEntry.objects.update_or_create(
                designation=row["designation"],
                defaults={"bore_mm": row["boreMm"], "price_inr": row["priceInr"], "price_eur": row["priceEur"], "delivery_days": row["deliveryDays"]},
            )

        sleeves = parse_ts_array(catalogs_ts, "SLEEVE_CATALOG")
        for row in sleeves:
            SleeveCatalogEntry.objects.update_or_create(
                sleeve_code=row["sleeveCode"], for_bearing=row.get("forBearing", ""),
                defaults={"price_eur": row["priceEur"], "price_inr": row["priceInr"]},
            )

        housings = parse_ts_array(catalogs_ts, "HOUSING_CATALOG")
        for row in housings:
            HousingCatalogEntry.objects.update_or_create(
                housing_designation=row["housingDesignation"], for_bearing=row.get("forBearing", ""),
                defaults={"price_inr": row["priceInr"], "delivery_days": row["deliveryDays"]},
            )

        lagging = parse_ts_array(catalogs_ts, "LAGGING_CATALOG")
        for row in lagging:
            LaggingCatalogEntry.objects.update_or_create(
                lagging_type=row["laggingType"], thickness_mm=row["thicknessMm"],
                defaults={"key": lagging_key(row["laggingType"]), "price_inr_per_m2": row["priceInrPerM2"], "delivery_days": row["deliveryDays"], "description": row.get("description", "")},
            )

        locking = parse_ts_array(catalogs_ts, "LOCKING_DEVICE_CATALOG")
        for row in locking:
            LockingDeviceCatalogEntry.objects.update_or_create(
                model_name=row["model"],
                defaults={"negotiated_rate_inr": row["negotiatedRateInr"], "remarks": row.get("remarks", "")},
            )

        self.stdout.write(
            f"  catalogs: {len(bearings)} bearings, {len(sleeves)} sleeves, {len(housings)} housings, "
            f"{len(lagging)} lagging, {len(locking)} locking devices"
        )

    def seed_in_house_hours(self):
        # Hand-transcribed, same as seed_cost_rates()/seed_raw_forging_rates() above —
        # the frontend's inHouseHoursRates.ts this used to be parsed from has since
        # been deleted (it had no importers left once MhrLhrCalculatorPage.tsx moved
        # to reading this same data live from the backend).
        rows = [
            dict(costHead="10b. Rolling / Bending Shell", operation="Rolling / bending", costCentre="—", activityDescription="C1. Rolling / Bending Shell", mhrRate=79.01),
            dict(costHead="10c. Welding – Shell & Hub", operation="Welding (MIG/MAG) / Grinding-finishing", costCentre="—", activityDescription="C2. Welding – Shell & Hub", mhrRate=24.52),
            dict(costHead="10d. Machining / Turning Body", operation="Lathe turning", costCentre="—", activityDescription="C3. Machining / Turning Body", mhrRate=42.90),
            dict(costHead="10p. Assembly + Engineering", operation="Engineering / design", costCentre="—", activityDescription="C4. Assembly + Engineering", mhrRate=17.03),
            dict(costHead="10q. Testing / Inspection / QC", operation="Testing / Inspection", costCentre="—", activityDescription="C5. Testing / Inspection / QC", mhrRate=12.96),
            dict(costHead="10o. Painting & Surface Prep", operation="Engineering / design", costCentre="—", activityDescription="C6. Painting & Surface Prep", mhrRate=0),
        ]
        for order, row in enumerate(rows):
            InHouseHourRate.objects.update_or_create(
                cost_head=row["costHead"],
                defaults={
                    "operation": row["operation"],
                    "cost_centre": row.get("costCentre", ""),
                    "activity_description": row["activityDescription"],
                    "mhr_rate": row["mhrRate"],
                    "order": order,
                },
            )
        self.stdout.write(f"  in-house hour rates: {len(rows)}")
