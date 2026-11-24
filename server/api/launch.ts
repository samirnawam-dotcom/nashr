/**
 * Before release (PRELAUNCH=1 in the server's environment): the site is behind a "Coming soon" page. Guests get nothing
 * but that page and its registration form: no outlets, products, prices or calendar from the API, no sitemap, and search
 * engines are asked to stay away. Signed-in people (Nashr's team, invited testers) see everything as usual.
 */
export const prelaunch = () => /^(1|true|yes|on)$/i.test((process.env.PRELAUNCH ?? '').trim())

export const PRELAUNCH_ROBOTS = 'User-agent: *\nDisallow: /\n'
