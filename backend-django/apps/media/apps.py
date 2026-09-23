from django.apps import AppConfig


class MediaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.media"
    label = "media"

    def ready(self):
        # Registers the boot-time check that R2 is actually configured.
        from . import checks  # noqa: F401
