/* The two deployments. A route Link cannot cross apps — a path the other
   build carries bounces off this build's catch-all — so seeker↔consultant
   links are absolute. Update both at the domain migration, when the apps
   live under 1namo.com. */
export const SEEKER_APP_URL = 'https://onenamocom-stack.github.io/namoApp/'
export const PRO_APP_URL = 'https://onenamocom-stack.github.io/namo-pro/'
