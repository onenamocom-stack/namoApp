# 8 Oct 2026: the darshan page's deities and murtis, from the console.

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

# The eight deities and 28 murtis the app shipped with (src/data/mock.js),
# so the page is unchanged until somebody edits it. Images are the files
# already in `public/deities/`, site-relative.
SEED = [
 {
  "name": "Ganesh",
  "name_hi": "गणेश",
  "images": [
   {
    "f": "ganesh-1.webp",
    "title": "Seated with attendants",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "ganesh-2.webp",
    "title": "Basohli miniature, c.1730",
    "credit": "Anonymous · Public domain · Wikimedia Commons"
   },
   {
    "f": "ganesh-3.webp",
    "title": "Rodrigues lithograph",
    "credit": "E. A. Rodrigues · Public domain · Wikimedia Commons"
   },
   {
    "f": "ganesh-4.webp",
    "title": "Rajput miniature",
    "credit": "Unknown artist · Public domain · Wikimedia Commons"
   }
  ]
 },
 {
  "name": "Shiva",
  "name_hi": "शिव",
  "images": [
   {
    "f": "shiva-1.webp",
    "title": "Shankar",
    "credit": "Ravi Varma Press · Public domain · Wikimedia Commons"
   },
   {
    "f": "shiva-2.webp",
    "title": "With Parvati and Nandi",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "shiva-3.webp",
    "title": "Drinking the poison, 1913",
    "credit": "Nivedita & Coomaraswamy · Public domain · Wikimedia Commons"
   },
   {
    "f": "shiva-4.webp",
    "title": "Ganga Visarjana",
    "credit": "E. A. Rodrigues · Public domain · Wikimedia Commons"
   }
  ]
 },
 {
  "name": "Lakshmi",
  "name_hi": "लक्ष्मी",
  "images": [
   {
    "f": "lakshmi-1.webp",
    "title": "On the lotus",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "lakshmi-2.webp",
    "title": "Press oleograph, 1930s",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "lakshmi-3.webp",
    "title": "With Saraswati",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "lakshmi-4.webp",
    "title": "Painted 1896",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   }
  ]
 },
 {
  "name": "Hanuman",
  "name_hi": "हनुमान",
  "images": [
   {
    "f": "hanuman-1.webp",
    "title": "With two worshippers",
    "credit": "Wellcome Collection · CC BY 4.0 · Wikimedia Commons"
   },
   {
    "f": "hanuman-2.webp",
    "title": "Gouache study",
    "credit": "Wellcome Collection · CC BY 4.0 · Wikimedia Commons"
   },
   {
    "f": "hanuman-3.webp",
    "title": "Carrying Rama and Lakshman",
    "credit": "Wellcome Collection · CC BY 4.0 · Wikimedia Commons"
   },
   {
    "f": "hanuman-4.webp",
    "title": "With the mountain",
    "credit": "Wellcome Collection · CC BY 4.0 · Wikimedia Commons"
   }
  ]
 },
 {
  "name": "Durga",
  "name_hi": "दुर्गा",
  "images": [
   {
    "f": "durga-1.webp",
    "title": "With the lions",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "durga-2.webp",
    "title": "Mahishasuramardini",
    "credit": "Raja Ravi Varma · Public domain · Wikimedia Commons"
   },
   {
    "f": "durga-3.webp",
    "title": "Slaying Mahishasura",
    "credit": "Dswaroop100 · CC BY-SA 3.0 · Wikimedia Commons"
   },
   {
    "f": "durga-4.webp",
    "title": "On the tiger",
    "credit": "Sujit Kumar · CC BY-SA 4.0 · Wikimedia Commons"
   }
  ]
 },
 {
  "name": "Mahavir",
  "name_hi": "महावीर",
  "images": [
   {
    "f": "mahavir-c.webp",
    "title": "In the arch",
    "credit": "Supplied"
   },
   {
    "f": "mahavir-a.webp",
    "title": "Carved niche",
    "credit": "Supplied"
   },
   {
    "f": "mahavir-b.webp",
    "title": "Golden halo",
    "credit": "Supplied"
   },
   {
    "f": "mahavir-d.webp",
    "title": "Jain Tirth Temple, Ayodhya",
    "credit": "Supplied"
   }
  ]
 },
 {
  "name": "Aadinath",
  "name_hi": "आदिनाथ",
  "images": [
   {
    "f": "aadinath-a.webp",
    "title": "Jain Tirth Temple, Ayodhya",
    "credit": "Supplied"
   }
  ]
 },
 {
  "name": "Shani",
  "name_hi": "शनि",
  "images": [
   {
    "f": "shani-1.webp",
    "title": "On the crow chariot",
    "credit": "Ravi Varma Press · Public domain · Wikimedia Commons"
   },
   {
    "f": "shani-2.webp",
    "title": "With the crow",
    "credit": "Indian Poet · CC BY-SA 3.0 · Wikimedia Commons"
   },
   {
    "f": "shani-3.webp",
    "title": "Rodrigues lithograph",
    "credit": "E. A. Rodrigues · Public domain · Wikimedia Commons"
   }
  ]
 }
]


def seed(apps, schema_editor):
    Deity = apps.get_model("bhakti", "DarshanDeity")
    Image = apps.get_model("bhakti", "DarshanImage")
    if Deity.objects.exists():
        return
    for d_sort, d in enumerate(SEED):
        deity = Deity.objects.create(name=d["name"], name_hi=d["name_hi"], sort=d_sort * 10)
        for i_sort, im in enumerate(d["images"]):
            Image.objects.create(
                deity=deity, image_url=f"/deities/{im['f']}",
                title=im["title"], credit=im["credit"], sort=i_sort * 10,
            )


def lock_out_postgrest(apps, schema_editor):
    """RLS on, no policies, as for every table Django alone writes: Supabase's
    PostgREST exposes `public` to the anon key. Postgres only."""
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("alter table darshan_deities enable row level security")
        schema_editor.execute("alter table darshan_images enable row level security")


class Migration(migrations.Migration):

    dependencies = [
        ("bhakti", "0003_mantra_kind"),
    ]

    operations = [
        migrations.CreateModel(
            name="DarshanDeity",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.TextField()),
                ("name_hi", models.TextField(blank=True, default="")),
                ("sort", models.IntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "verbose_name": "darshan deity",
                "verbose_name_plural": "darshan deities",
                "db_table": "darshan_deities",
                "ordering": ("sort", "name"),
            },
        ),
        migrations.CreateModel(
            name="DarshanImage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("image_url", models.TextField()),
                ("temple", models.TextField(blank=True, default="")),
                ("temple_hi", models.TextField(blank=True, default="")),
                ("location", models.TextField(blank=True, default="")),
                ("location_hi", models.TextField(blank=True, default="")),
                ("title", models.TextField(blank=True, default="")),
                ("credit", models.TextField(blank=True, default="")),
                ("sort", models.IntegerField(default=0)),
                ("active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("deity", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="images", to="bhakti.darshandeity")),
            ],
            options={
                "verbose_name": "darshan image",
                "db_table": "darshan_images",
                "ordering": ("deity__sort", "sort"),
            },
        ),
        migrations.RunPython(lock_out_postgrest, migrations.RunPython.noop),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
