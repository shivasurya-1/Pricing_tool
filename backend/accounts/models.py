from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    SALES = "Sales", "Sales"
    OPERATIONS = "Operations", "Operations"
    SOURCING = "Sourcing", "Sourcing"
    CONTROLLING = "Controlling", "Controlling"
    APPROVAL_PANEL = "Approval Panel", "Approval Panel"
    ADMIN = "Admin", "Admin"

    @classmethod
    def can_edit_reference_data(cls, role: str) -> bool:
        """Only Controlling and Admin may write formulas, rates, or catalogs."""
        return role in (cls.CONTROLLING, cls.ADMIN)


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SALES)

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} ({self.role})"
