"""Serializer fields shared across the API."""

from decimal import Decimal, InvalidOperation

from rest_framework import serializers

# Six decimal places, about 11 cm. What `profiles.birth_lat` holds, and far
# finer than any birth certificate.
COORDINATE_STEP = Decimal("0.000001")


class CoordinateField(serializers.DecimalField):
    """A latitude or longitude, ROUNDED to the column's precision rather
    than refused for exceeding it.

    The geocoder returns up to eight decimal places — Pune comes back as
    18.52322222 — and a plain DecimalField answers "Ensure that there are no
    more than 6 decimal places". On the signup path that reads as "Check the
    highlighted fields" against a birthplace the person picked from our own
    search, and there is no way for them to fix it. Nothing downstream can
    use the extra digits, so they come off at the door instead.

    `limit` is the range: 90 for a latitude, 180 for a longitude.
    """

    def __init__(self, limit, **kwargs):
        super().__init__(
            max_digits=9, decimal_places=6,
            min_value=-limit, max_value=limit,
            **kwargs,
        )

    def validate_precision(self, value):
        try:
            value = value.quantize(COORDINATE_STEP)
        except InvalidOperation:
            # Absurdly large, or not finite. Leave it for the max_digits
            # check inside the parent, which is the refusal it deserves.
            pass
        return super().validate_precision(value)
