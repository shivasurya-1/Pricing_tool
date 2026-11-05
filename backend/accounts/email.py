"""Account emails — see config/settings.py's EMAIL_BACKEND note. Without SMTP
credentials in .env these render to the server log (Django's console backend).

Templates live in accounts/templates/accounts/email/ (subject, plain text, HTML).
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from reference.models import OrganizationSettings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = "accounts/email"


def email_branding() -> dict:
    """Company details from the Settings page, for the template header and footer."""
    org = OrganizationSettings.load()
    address = ", ".join(p for p in (org.address_line1, org.address_line2, org.city, org.state, org.postal_code, org.country) if p)
    contact = " · ".join(p for p in (org.email, org.phone, org.website) if p)
    return {
        "company": org.company_name or "Pricing Tool",
        "logo_url": org.logo_url,
        "address_line": address,
        "contact_line": contact,
        # Optional FRONTEND_URL setting adds a "Sign in" link; omitted when not set.
        "login_url": getattr(settings, "FRONTEND_URL", ""),
    }


def send_new_user_email(user, password: str) -> bool:
    """Emails a newly created user their username, password and role. Best-effort:
    returns False (and logs) if the mail server fails, so the account still exists
    and the Admin can be told to pass the details on another way."""
    context = {
        **email_branding(),
        "name": user.get_full_name() or user.username,
        "username": user.username,
        "password": password,
        "role": user.role,
    }
    subject = render_to_string(f"{TEMPLATE_DIR}/new_user_subject.txt", context).strip()
    text_body = render_to_string(f"{TEMPLATE_DIR}/new_user.txt", context)
    html_body = render_to_string(f"{TEMPLATE_DIR}/new_user.html", context)
    try:
        message = EmailMultiAlternatives(subject=subject, body=text_body, from_email=settings.DEFAULT_FROM_EMAIL, to=[user.email])
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)
    except Exception:
        logger.exception("Couldn't send the new-account email to user %s", user.pk)
        return False
    return True
