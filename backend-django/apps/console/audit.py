"""Writing down what an admin did.

PRD §6 requires every action of every tier to be audited, and gives the
reason that matters: it is what makes an appeal answerable. A consultant
told their practice was blocked can be shown when, by whom, and why.

The trail is append-only by intent. Nothing here updates or deletes, and
the console exposes no way to.
"""

import logging

from .models import AdminAction

logger = logging.getLogger("apps.console")


def record(request, action, target_type, target_id=None, **detail):
    """Log one action against the acting admin's profile.

    Never raises. An audit write that fails must not undo the thing it was
    recording — a blocked consultant staying blocked with a missing log
    line is recoverable; a half-applied moderation action is not. The
    failure is logged loudly instead.
    """
    admin = getattr(request.user, "admin_profile", None)
    if admin is None:
        logger.error("[console] %s by a request with no admin row", action)
        return None
    try:
        return AdminAction.objects.create(
            admin=admin,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[console] audit write failed for %s: %s", action, exc)
        return None


class AuditedAdmin:
    """Mixin: every create, change and delete through a ModelAdmin lands in
    the trail. Subclasses set `audit_target` to the noun the trail should
    name — the model's own label is a Python class name and means nothing
    to somebody reading an appeal."""

    audit_target = None

    def _target(self):
        return self.audit_target or self.model._meta.model_name

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        record(
            request,
            f"{self._target()}.{'change' if change else 'create'}",
            self._target(),
            target_id=getattr(obj, "pk", None) if _is_uuid(obj.pk) else None,
            # The fields that actually moved, not the whole row: an audit
            # entry nobody can read is one nobody checks.
            changed=sorted(form.changed_data) if change else "new",
            label=str(obj)[:120],
        )

    def delete_model(self, request, obj):
        pk = obj.pk
        label = str(obj)[:120]
        super().delete_model(request, obj)
        record(request, f"{self._target()}.delete", self._target(),
               target_id=pk if _is_uuid(pk) else None, label=label)


def _is_uuid(value):
    import uuid as _uuid

    if isinstance(value, _uuid.UUID):
        return True
    try:
        _uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


class DecideButtons:
    """Mixin: a queue's decisions as buttons on the row's own page (18 Oct
    2026, Rahul: approving a Seller or a Pro could not be found — the
    actions sat in the list's dropdown, hidden on a phone). Each button
    runs the existing list action on this one row, after the page's own
    save, so a reason typed in the review note is saved first. Subclasses
    list `decide_buttons` as (label, action name, "go" or "stop") and say
    in `decide_shown` when they apply."""

    change_form_template = "admin/decide_change_form.html"
    decide_buttons = ()
    # A line under the buttons, when turning down needs a reason first.
    decide_note = ""

    def decide_shown(self, obj):
        return True

    def render_change_form(self, request, context, add=False, change=False, form_url="", obj=None):
        if obj is not None and self.decide_shown(obj):
            context["decide_buttons"] = [(f"_decide_{name}", label, tone)
                                         for label, name, tone in self.decide_buttons]
            context["decide_note"] = self.decide_note
        return super().render_change_form(request, context, add, change, form_url, obj)

    def response_change(self, request, obj):
        from django.http import HttpResponseRedirect

        for _, name, _ in self.decide_buttons:
            if f"_decide_{name}" in request.POST:
                getattr(self, name)(request, type(obj).objects.filter(pk=obj.pk))
                return HttpResponseRedirect(request.path)
        return super().response_change(request, obj)
