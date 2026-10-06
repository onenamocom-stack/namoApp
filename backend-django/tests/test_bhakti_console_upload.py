"""The Bhakti asset form takes an upload alone (6 Oct 2026: Media url and
Source were both required, so a tune uploaded as a file never saved)."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.bhakti.admin import BhaktiAssetForm


@pytest.mark.django_db
def test_an_upload_alone_is_enough():
    form = BhaktiAssetForm(
        data={"kind": "tune", "title": "Om Jai Jagdish", "deity": "Vishnu", "artist": "Namo",
              "licence": "All rights reserved", "source": "", "media_url": "", "preview_url": "",
              "sort": "0", "active": "on"},
        files={"upload": SimpleUploadedFile("aarti.mp3", b"ID3" + b"\0" * 2000, content_type="audio/mpeg")},
    )
    assert form.is_valid(), form.errors


@pytest.mark.django_db
def test_neither_file_nor_link_is_refused():
    form = BhaktiAssetForm(data={"kind": "tune", "title": "x", "deity": "", "artist": "Namo",
                                 "licence": "All rights reserved", "source": "", "media_url": "",
                                 "preview_url": "", "sort": "0", "active": "on"})
    assert not form.is_valid() and "upload" in form.errors
    assert io
