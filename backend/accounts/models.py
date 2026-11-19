from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    SALES = "Sales", "Sales"
    OPERATIONS = "Operations", "Operations"
    SOURCING = "Sourcing", "Sourcing"
    CONTROLLING = "Controlling", "Controlling"
    APPROVAL_PANEL = "Approval Panel", "Approval Panel"
    ADMIN = "Admin", "Admin"


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SALES)
    # True while the account still has the temporary password emailed when it was created.
    # That password can't sign in; it only works on the "Reset your password" page
    # (POST /api/auth/initial-password/), which clears this flag.
    must_change_password = models.BooleanField(default=False)

    @property
    def is_admin(self) -> bool:
        """Superusers get every permission, same as the Admin role."""
        return self.is_superuser or self.role == Role.ADMIN

    def save(self, *args, **kwargs):
        # Keep a superuser's stored role in sync so the frontend (which keys its
        # menus off `role`) and role-based workflow checks treat them as Admin too.
        if self.is_superuser:
            self.role = Role.ADMIN
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} ({self.role})"


class RolePermission(models.Model):
    """One role's saved Users & Roles permission grid, {module: [actions]} — see
    role_permissions.py. A role with no row uses default_role_permissions(); Admin
    never gets a row (always full access)."""

    role = models.CharField(max_length=20, choices=Role.choices, unique=True)
    permissions = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Permissions for {self.role}"
