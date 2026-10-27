"""Outbound email — see config/settings.py's EMAIL_BACKEND note. Until real SMTP
credentials are set in .env, everything here still runs for real, it just renders to
the server log instead of a real inbox (Django's console backend).
"""

from accounts.models import User
from django.conf import settings
from django.core.mail import EmailMessage
from reference.models import OrganizationSettings

from .pdf import build_quotation_pdf


def quotation_recipient(rfq) -> str:
    """Who a quotation is emailed to: the customer's email on the Customers page, else
    the RFQ's contact email when the customer has none."""
    return (rfq.customer.email if rfq.customer_id else "") or rfq.contact_email or ""


def send_quotation_email(quotation, rfq) -> str:
    """The "Send Email" button — a real, user-triggered send with the quotation PDF
    attached, to quotation_recipient(). Returns the address it went to. Raises
    ValueError if there's nowhere to send it, which the view turns into a 400 rather
    than silently doing nothing."""
    recipient = quotation_recipient(rfq)
    if not recipient:
        raise ValueError("Neither the customer nor this RFQ has an email address on file.")

    settings_obj = OrganizationSettings.load()
    company = settings_obj.company_name or "Your Company"
    subject = f"Quotation {quotation.quotation_number} from {company}"
    body = settings_obj.quotation_header_text or f"Please find attached our quotation {quotation.quotation_number} for {rfq.project_name}."

    email = EmailMessage(subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=[recipient])
    email.attach(f"{quotation.quotation_number}.pdf", build_quotation_pdf(quotation, rfq), "application/pdf")
    email.send(fail_silently=False)
    return recipient


def notify_role_by_email(*, target_role, subject, body) -> None:
    """Best-effort companion to the in-app AppNotification (see append_notification in
    views.py) — gated on the Settings page's "Send email notifications" toggle.
    fail_silently=True: a broken mail server must never block the RFQ action that
    triggered this notification."""
    if not target_role or not OrganizationSettings.load().notify_email_enabled:
        return
    recipients = list(User.objects.filter(role=target_role, is_active=True).exclude(email="").values_list("email", flat=True))
    if not recipients:
        return
    EmailMessage(subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=recipients).send(fail_silently=True)
