"""Birth details a caller TYPED, and what may be done with them.

This lives in astro because astro is what computes from them — a chart for
Namo AI's question, a side of an Ashtakoota match. Namo AI imports it back.

**Nothing here is ever written to the database.** A third party did not
agree to be in it (21 Sep 2026; docs/01-PRD.md §4.4). What is stored is the
computed result, under a hash of the birth — derived data, not a birth
record.
"""

from rest_framework import serializers

from apps.core.fields import CoordinateField


class SubjectInput(serializers.Serializer):
    """Somebody else's birth details, typed by the seeker.

    This is the ONE thing the client sends that changes the answer, and it
    is not an exception to rule 3: rule 3 keeps the client from sending
    what it BENEFITS from changing. Nobody gains by lying about their
    mother's birthday — the chart is simply wrong, which the seeker is the
    first to notice.
    """

    name = serializers.CharField(max_length=80, allow_blank=False, trim_whitespace=True)
    birth_date = serializers.DateField()
    # Null when nobody remembers it — the same distinction profiles makes.
    # Noon is substituted downstream and the houses are unreliable, which
    # is a fact the answer should carry rather than hide.
    birth_time = serializers.TimeField(required=False, allow_null=True)
    birth_time_known = serializers.BooleanField(default=True)
    birth_place = serializers.CharField(max_length=160)
    birth_lat = CoordinateField(90)
    birth_lon = CoordinateField(180)
    birth_zone = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def validate(self, data):
        if data.get("birth_time_known") and not data.get("birth_time"):
            raise serializers.ValidationError(
                {"birth_time": "Give the time, or say it is not known."}
            )
        return data


def subject_birth(subject):
    """A validated subject as the birth dict astro's services read.

    str() on the date, the time and the decimals: the cache key is built
    from a text join, and a date object and its ISO string must not hash to
    two different charts for one birth.
    """
    return {
        "name": subject["name"],
        "birth_date": str(subject["birth_date"]),
        "birth_time": str(subject["birth_time"]) if subject.get("birth_time") else None,
        "birth_time_known": bool(subject.get("birth_time_known")),
        "birth_place": subject["birth_place"],
        "birth_lat": str(subject["birth_lat"]),
        "birth_lon": str(subject["birth_lon"]),
        "birth_zone": subject.get("birth_zone") or "Asia/Kolkata",
    }


class MatchInput(serializers.Serializer):
    """Two births to read against each other.

    `person1` absent means the caller themselves, read from their own
    profile row — the common case, and the one where the client sends
    nothing that decides the answer. A parent matching two other people
    sends both.
    """

    person1 = SubjectInput(required=False, allow_null=True)
    person2 = SubjectInput()
