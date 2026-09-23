from django.urls import path

from . import views

urlpatterns = [
    path("feed/", views.feed, name="content-feed"),
    path("by-author/", views.by_author, name="content-by-author"),
    path("publish/", views.publish, name="content-publish"),
    path("reviews/", views.reviews, name="content-reviews"),
    path("reviews/reviewable/", views.reviewable, name="content-reviewable"),
    path("follow-counts/", views.follow_counts, name="content-follow-counts"),
    path("authors/<uuid:profile_id>/", views.author, name="content-author"),
    path("<uuid:content_id>/remove/", views.remove, name="content-remove"),
    path("<uuid:content_id>/report/", views.report_content, name="content-report"),
    path("authors/<uuid:profile_id>/report/", views.report_profile,
         name="content-report-author"),
    path("<uuid:content_id>/publish/", views.publish_draft, name="content-publish-draft"),
    path("<uuid:content_id>/", views.detail, name="content-detail"),
]
