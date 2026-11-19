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


def send_new_user_email(user, temporary_password: str, reset_url: str) -> bool:
    """Emails a newly created user their username, temporary password, role and a "Reset
    password" button (`reset_url`, the "Reset your password" page). The temporary password can't
    sign in; it only lets them choose their own on that page. Best-effort: returns False (and
    logs) if the mail server fails, so the account still exists and the Admin can pass the
    details on."""
    context = {
        **email_branding(),
        "name": user.get_full_name() or user.username,
        "username": user.username,
        "password": temporary_password,
        "role": user.role,
        "reset_url": reset_url,
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


def send_password_reset_email(user, reset_url: str, valid_minutes: int) -> bool:
    """Emails the password-reset link. Best-effort like send_new_user_email: returns False
    (and logs) on a mail-server failure, and the caller still answers the request the same
    way, so nothing here can reveal whether an account exists."""
    context = {
        **email_branding(),
        "name": user.get_full_name() or user.username,
        "username": user.username,
        "reset_url": reset_url,
        "valid_minutes": valid_minutes,
    }
    subject = render_to_string(f"{TEMPLATE_DIR}/password_reset_subject.txt", context).strip()
    text_body = render_to_string(f"{TEMPLATE_DIR}/password_reset.txt", context)
    html_body = render_to_string(f"{TEMPLATE_DIR}/password_reset.html", context)
    try:
        message = EmailMultiAlternatives(subject=subject, body=text_body, from_email=settings.DEFAULT_FROM_EMAIL, to=[user.email])
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)
    except Exception:
        logger.exception("Couldn't send the password-reset email to user %s", user.pk)
        return False
    return True
