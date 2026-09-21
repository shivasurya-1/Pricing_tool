"""Generates the downloadable quotation PDF — a server-side rendering of the same
document src/features/quotations/QuotationPreview.tsx shows on screen (same fields,
same totals math), so the download never disagrees with the preview.
"""

import io
from datetime import datetime

from reference.models import OrganizationSettings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#1e3a5f")
INK_FAINT = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")

CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def format_currency(value: float, currency: str) -> str:
    symbol = CURRENCY_SYMBOLS.get(currency, currency + " ")
    return f"{symbol}{round(value):,}"


def format_date(iso: str) -> str:
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y")
    except ValueError:
        return iso


def summarize_cost_breakdown(items) -> dict:
    """Straight port of src/lib/pricing.ts's summarizeCostBreakdown — a pure sum over
    already-stored CostBreakdownLine fields, so the PDF's totals can't drift from the
    ones already computed and saved by Controlling."""
    lines = [item.cost_breakdown for item in items if hasattr(item, "cost_breakdown")]
    total_cost = sum(l.adjusted_cost for l in lines)
    total_selling_price = sum(l.selling_price for l in lines)
    total_tax = sum(l.tax_value for l in lines)
    total_freight = sum(l.freight for l in lines)
    total_discount = sum(l.discount for l in lines)
    grand_total = sum(l.final_price for l in lines)
    gross_margin = total_selling_price - total_cost
    return {
        "totalCost": total_cost, "grossMargin": gross_margin, "totalTax": total_tax,
        "totalFreight": total_freight, "totalDiscount": total_discount, "grandTotal": grand_total,
    }


def build_quotation_pdf(quotation, rfq) -> bytes:
    settings_obj = OrganizationSettings.load()
    company_name = settings_obj.company_name or "Your Company Name"
    address_parts = [p for p in [settings_obj.address_line1, settings_obj.address_line2, settings_obj.city, settings_obj.state, settings_obj.country] if p]
    address_line = ", ".join(address_parts)
    tax_line = f"{settings_obj.tax_registration_label or 'Tax Reg. No.'}: {settings_obj.tax_registration_number}" if settings_obj.tax_registration_number else ""

    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=INK_FAINT)
    small_bold = ParagraphStyle("small_bold", parent=small, fontName="Helvetica-Bold", textColor=colors.black)
    label_style = ParagraphStyle("label", parent=styles["Normal"], fontSize=7, textColor=INK_FAINT)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    story = []

    header_data = [[
        Paragraph(f"<b>{company_name}</b><br/>{address_line}<br/>{tax_line}", small),
        Paragraph(f"<font size=16 color='#1e3a5f'><b>QUOTATION</b></font><br/>{quotation.quotation_number}", small_bold),
    ]]
    header_table = Table(header_data, colWidths=[110 * mm, 62 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, NAVY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 12))

    if settings_obj.quotation_header_text:
        story.append(Paragraph(settings_obj.quotation_header_text, small))
        story.append(Spacer(1, 10))

    details_data = [[
        Paragraph(f"<b>CUSTOMER</b><br/>{rfq.end_customer}<br/>{rfq.contact_person}<br/>{rfq.contact_email}<br/>{rfq.location}", small),
        Paragraph(
            f"<b>DETAILS</b><br/>Quotation Date: {format_date(quotation.quote_date)}<br/>Valid Until: {format_date(quotation.valid_until)}"
            f"<br/>Project: {rfq.project_name}<br/>RFQ Ref: {rfq.rfq_number}",
            small,
        ),
    ]]
    details_table = Table(details_data, colWidths=[86 * mm, 86 * mm])
    details_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(details_table)
    story.append(Spacer(1, 14))

    items_header = ["#", "Description", "Qty", "Unit Price", "Amount"]
    items_rows = [items_header]
    for item in rfq.items.all():
        cb = getattr(item, "cost_breakdown", None)
        unit_price = (cb.final_price / item.quantity) if cb and item.quantity else item.target_price
        amount = cb.final_price if cb else unit_price * item.quantity
        desc = f"<b>{item.product_name}</b><br/><font color='#6b7280'>{item.description}</font>"
        items_rows.append([
            str(item.item_no), Paragraph(desc, small), f"{item.quantity:g} {item.unit}",
            format_currency(unit_price, rfq.currency), format_currency(amount, rfq.currency),
        ])
    items_table = Table(items_rows, colWidths=[10 * mm, 82 * mm, 24 * mm, 30 * mm, 26 * mm])
    items_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK_FAINT),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, BORDER),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 14))

    summary = summarize_cost_breakdown(rfq.items.all())
    totals_rows = [
        ["Subtotal", format_currency(summary["totalCost"] + summary["grossMargin"], rfq.currency)],
        ["Discount", f"- {format_currency(summary['totalDiscount'], rfq.currency)}"],
        ["Freight", format_currency(summary["totalFreight"], rfq.currency)],
        ["Tax", format_currency(summary["totalTax"], rfq.currency)],
        ["Grand Total", format_currency(summary["grandTotal"], rfq.currency)],
    ]
    totals_table = Table(totals_rows, colWidths=[35 * mm, 35 * mm], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (0, -1), INK_FAINT),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, NAVY),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 10),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 16))

    terms_cols = [
        Paragraph(f"<b><font color='#6b7280'>DELIVERY TERMS</font></b><br/>{rfq.delivery_terms}", small),
        Paragraph(f"<b><font color='#6b7280'>PAYMENT TERMS</font></b><br/>{rfq.payment_terms}", small),
        Paragraph(f"<b><font color='#6b7280'>VALIDITY</font></b><br/>{rfq.quotation_validity}", small),
    ]
    terms_table = Table([terms_cols], colWidths=[57 * mm] * 3)
    terms_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEABOVE", (0, 0), (-1, 0), 0.5, BORDER), ("TOPPADDING", (0, 0), (-1, -1), 8)]))
    story.append(terms_table)
    story.append(Spacer(1, 14))

    tc_text = settings_obj.terms_and_conditions_text or (
        f"1. Prices are in {rfq.currency} and exclude any charges not explicitly listed above.<br/>"
        f"2. Delivery timelines are indicative and subject to order confirmation.<br/>"
        f"3. This quotation is valid until {format_date(quotation.valid_until)}."
    )
    story.append(Paragraph(f"<b><font color='#6b7280'>TERMS &amp; CONDITIONS</font></b><br/>{tc_text}", small))

    if settings_obj.quotation_footer_text:
        story.append(Spacer(1, 14))
        story.append(Paragraph(settings_obj.quotation_footer_text, small))

    doc.build(story)
    return buf.getvalue()
