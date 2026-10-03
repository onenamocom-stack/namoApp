/* The two deployments. A route Link cannot cross apps — a path the other
   build carries bounces off this build's catch-all — so seeker↔consultant
   links are absolute. Moved to the custom domains on 3 Oct 2026, once both
   were live; the github.io addresses still redirect, but a link that goes
   through a redirect drops the session's first paint. */
export const SEEKER_APP_URL = 'https://1namo.com/'
export const PRO_APP_URL = 'https://pro.1namo.com/'
