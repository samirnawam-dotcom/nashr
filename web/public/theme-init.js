// Applies the saved light/dark choice before the first paint (a separate file: the site's security policy blocks inline scripts).
(function () {
  var p = null
  try { p = localStorage.getItem('nashr:theme') } catch (e) { /* private mode */ }
  var dark = p === 'dark' || (p !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
  root.style.colorScheme = dark ? 'dark' : 'light'
  // the browser's own bars (phone address bar, installed app title bar) match from the first frame
  var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0B0B0C' : '#FFFFFF')
})()
