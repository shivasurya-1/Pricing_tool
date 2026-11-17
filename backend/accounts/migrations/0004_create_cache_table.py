"""Creates the database cache table named in settings.CACHES (it holds the rate-limit counters
for the password endpoints), so `migrate` is all a deployment needs. `createcachetable` skips
tables that already exist, so this is safe to run on any database."""

from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_role_permission"),
    ]

    operations = [
        # Nothing to undo: the table is harmless if left behind, and other settings may use it.
        migrations.RunPython(create_cache_table, migrations.RunPython.noop),
    ]
