/**
 * What stands in the shrine's frame for one murti (20 Oct 2026, Rahul:
 * "either image or video or yt video link in darshan deity. Anyone. And
 * that will show in this frame"): the photo as before, a video on a silent
 * loop, or a temple's YouTube video in YouTube's own player, inside Namo.
 * The bells, diyas, dhoop, flowers and aarti stand in front of any of them.
 *
 * Only YouTube streams that allow playing in other apps get into the
 * console, and nothing here links out to YouTube.
 */
export default function DarshanFrame({ image, alt }) {
  if (image.kind === 'youtube') {
    return (
      <span className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '6%' }}>
        <span className="relative block aspect-video w-full overflow-hidden bg-black shadow-[0_8px_24px_rgba(0,0,0,.55)]">
          <iframe
            key={image.id}
            src={image.embedUrl}
            title={alt}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </span>
      </span>
    )
  }
  if (image.kind === 'video') {
    return (
      <video
        key={image.id}
        src={image.video}
        poster={image.src || undefined}
        aria-label={alt}
        autoPlay
        muted
        loop
        playsInline
        className="animate-fade absolute inset-0 h-full w-full object-contain"
        style={{ objectPosition: '50% 45%' }}
      />
    )
  }
  return (
    <img
      key={image.id}
      src={image.src}
      alt={alt}
      className="animate-fade absolute inset-0 h-full w-full object-contain"
      style={{ objectPosition: '50% 45%' }}
    />
  )
}
