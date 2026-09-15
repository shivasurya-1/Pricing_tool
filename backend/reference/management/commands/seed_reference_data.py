"""
One-time migration: seed CostRateValue, RawForgingRate, and the 5 catalogs from the
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
    CostRateCategory,
    CostRateValue,
    HousingCatalogEntry,
    LaggingCatalogEntry,
    LockingDeviceCatalogEntry,
    RawForgingRate,
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


class Command(BaseCommand):
    help = "Seed reference data (cost rates, raw forging rates, component catalogs) from the frontend's TS source files."

    def handle(self, *args, **options):
        self.seed_cost_rates()
        self.seed_raw_forging_rates()
        self.seed_catalogs()
        self.stdout.write(self.style.SUCCESS("Reference data seeded."))

    def seed_cost_rates(self):
        rows = [
            ("exchangeRateEurToInr", "Exchange Rate EUR → INR", CostRateCategory.GLOBAL, 110, "INR/EUR"),
            ("gstRate", "GST Rate", CostRateCategory.GLOBAL, 0.18, "%"),
            ("oemDiscount", "OEM Discount", CostRateCategory.GLOBAL, 0.1, "%"),
            ("priceFactorMarkup", "Price Factor HK0 (markup)", CostRateCategory.GLOBAL, 1.8, "×"),
            ("deliverySafetyFactor", "Delivery Safety Factor", CostRateCategory.GLOBAL, 1.2, "×"),
            ("weldConsumablesInrPerKgPulley", "Weld consumables (per kg pulley)", CostRateCategory.MATERIAL, 6, "INR/kg"),
            ("greaseInrPerKgPulley", "Grease (per kg pulley)", CostRateCategory.MATERIAL, 18, "INR/kg"),
            ("latheTurning", "Lathe turning", CostRateCategory.LABOUR, 711.27, "INR/h"),
            ("rollingBending", "Rolling / bending", CostRateCategory.LABOUR, 893.35, "INR/h"),
            ("weldingMigMag", "Welding (MIG/MAG)", CostRateCategory.LABOUR, 497.86, "INR/h"),
            ("grindingFinishing", "Grinding / finishing", CostRateCategory.LABOUR, 491.32, "INR/h"),
            ("assemblyLabour", "Assembly labour", CostRateCategory.LABOUR, 911.83, "INR/h"),
            ("engineeringDesign", "Engineering / design", CostRateCategory.LABOUR, 338.12, "INR/h"),
            ("paintingSurfacePrep", "Painting / surface prep", CostRateCategory.LABOUR, 924.99, "INR/m²"),
            ("heatTreatmentInrPerKg", "Heat treatment / annealing (per kg)", CostRateCategory.LABOUR, 8.5, "INR/kg"),
            ("stressReliefInrPerKg", "Stress relief (per kg)", CostRateCategory.LABOUR, 7.2, "INR/kg"),
            ("balancingInrPerSet", "Balancing (per set)", CostRateCategory.LABOUR, 1440, "INR/set"),
            ("machiningOutsourcedInrPerKg", "Machining body – outsourced (per kg)", CostRateCategory.LABOUR, 87.17, "INR/kg"),
            ("packingWoodCratePer100kg", "Packing – wood crate (per 100 kg)", CostRateCategory.LOGISTICS, 650, "INR/100kg"),
            ("inboundFreightShaftPerKg", "Inbound freight – shaft (per kg)", CostRateCategory.LOGISTICS, 2.2, "INR/kg"),
            ("inboundFreightPlatesPerKg", "Inbound freight – plates (per kg)", CostRateCategory.LOGISTICS, 1.8, "INR/kg"),
            ("inboundFreightPurchasedPartsPerOrder", "Inbound freight – purchased parts (per order)", CostRateCategory.LOGISTICS, 1500, "INR/order"),
            ("outboundShippingFobPerKg", "Outbound shipping FOB (per kg)", CostRateCategory.LOGISTICS, 3.5, "INR/kg"),
        ]
        for order, (key, label, category, value, unit) in enumerate(rows):
            CostRateValue.objects.update_or_create(key=key, defaults={"label": label, "category": category, "value": value, "unit": unit, "order": order})
        self.stdout.write(f"  cost rates: {len(rows)}")

    def seed_raw_forging_rates(self):
        # What Pricing Tool's Section A actually reads — Raw Forging Prices!$I$14/$J$14 (shell/hub,
        # flat for every model) and the shaft IF() by material grade. See RawForgingPricesPage.tsx
        # for the full displayed size-band reference table (not all bands feed live calc today).
        rows = [
            dict(part="shaft", material="C45", sourcing="", size_band_label="Ø 80 - 180", plate_rate=None, end_disc_rate=None, active=False, order=0),
            dict(part="shaft", material="42CrMo4+QT", sourcing="", size_band_label="Ø 200 - 880", plate_rate=None, end_disc_rate=None, active=True, order=1),
            dict(part="shaft", material="30CrNiMo8+QT/36CrNiMo4+QT/34CrNiMo6+QT", sourcing="", size_band_label="Ø 300 - 450", plate_rate=None, end_disc_rate=None, active=False, order=2),
            dict(part="shell", material="", sourcing="Outsourced", size_band_label="300 – ≤500", plate_rate=None, end_disc_rate=None, active=False, order=0),
            dict(part="shell", material="", sourcing="Inhouse", size_band_label=">550 – 1000", plate_rate=110, end_disc_rate=210, active=True, order=1),
            dict(part="shell", material="", sourcing="Inhouse", size_band_label="1000 – 1500", plate_rate=110, end_disc_rate=210, active=False, order=2),
            dict(part="shell", material="", sourcing="Inhouse", size_band_label="1500 – 2000", plate_rate=130, end_disc_rate=210, active=False, order=3),
            dict(part="shell", material="", sourcing="Inhouse", size_band_label=">2000", plate_rate=None, end_disc_rate=210, active=False, order=4),
        ]
        # C45 / 42CrMo4+QT plate rates live on the shaft rows as "plate_rate" reused for shaft ₹/kg.
        shaft_rate = {"C45": 310, "42CrMo4+QT": 330, "30CrNiMo8+QT/36CrNiMo4+QT/34CrNiMo6+QT": None}
        for row in rows:
            if row["part"] == "shaft":
                row["plate_rate"] = shaft_rate[row["material"]]
            RawForgingRate.objects.update_or_create(
                part=row["part"], size_band_label=row["size_band_label"],
                defaults={
                    "material": row["material"], "sourcing": row["sourcing"],
                    "plate_rate_inr_per_kg": row["plate_rate"], "end_disc_rate_inr_per_kg": row["end_disc_rate"],
                    "is_active_default": row["active"], "order": row["order"],
                },
            )
        self.stdout.write(f"  raw forging rate bands: {len(rows)}")

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
                defaults={"price_inr_per_m2": row["priceInrPerM2"], "delivery_days": row["deliveryDays"], "description": row.get("description", "")},
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
