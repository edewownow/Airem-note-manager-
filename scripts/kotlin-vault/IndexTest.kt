/**
 * 2.0.0-autofill.9: the coded site list (SiteIndex) never hides a login SiteMatch would fill, stays
 * silent elsewhere, and reveals no names. Run by run.sh.
 */
import expo.modules.memoairemvault.SiteIndex
import expo.modules.memoairemvault.SiteMatch

var iBad = 0
var iGood = 0
fun iok(c: Boolean, m: String) { if (c) iGood++ else { iBad++; println("✗ index: $m") } }

fun indexTests(): Int {
  val key = ByteArray(32) { (it * 7 + 3).toByte() }
  val saved = listOf(
    "google.com", "https://accounts.google.com/signin", "www.facebook.com", "bdo.com.ph", "online.bdo.com.ph", "bbc.co.uk",
    "ede.github.io", "shop.myshopify.com", "android:com.bdo.app", "com.gcash.android", "bdo.app", "localhost", "", null, "  ",
  )
  val pages = listOf(
    Triple("accounts.google.com", "https", null), Triple("google.com", null, null), Triple("mail.google.com", "http", null),
    Triple("m.facebook.com", "https", null), Triple("facebook.com.evil.io", "https", null), Triple("bdo.com.ph", "https", null),
    Triple("x.bdo.com.ph", "https", null), Triple("evil.com.ph", "https", null), Triple("news.bbc.co.uk", "https", null),
    Triple("ede.github.io", "https", null), Triple("blog.ede.github.io", "https", null), Triple("other.github.io", "https", null),
    Triple("shop.myshopify.com", "https", null), Triple("evil.myshopify.com", "https", null), Triple("bdo.app", "https", null),
    Triple(null, null, "com.bdo.app"), Triple(null, null, "com.gcash.android"), Triple(null, null, "com.evil.app"),
    Triple("google.co", "https", null), Triple("goog1e.com", "https", null),
  )
  // the rule: SiteMatch says "fill" → the index says "offer", for every saved site × every page
  var pairs = 0
  for (s in saved) for (p in pages) {
    val idx = SiteIndex.build(key, listOf(s))
    if (SiteMatch.matches(s, p.first, p.second, p.third)) {
      pairs++
      iok(SiteIndex.hit(key, idx, p.first, p.second, p.third), "saved '$s' fills on ${p.first ?: p.third} but the index hid it")
    }
  }
  iok(pairs >= 12, "the grid has real matches ($pairs)")
  // silent where nothing is saved
  val idx = SiteIndex.build(key, listOf("google.com", "android:com.bdo.app", "ede.github.io"))
  iok(!SiteIndex.hit(key, idx, "facebook.com", "https", null), "nothing saved for facebook.com → silent")
  iok(!SiteIndex.hit(key, idx, "goog1e.com", "https", null), "look-alike → silent")
  iok(!SiteIndex.hit(key, idx, "google.com.evil.io", "https", null), "google.com inside another domain → silent")
  iok(!SiteIndex.hit(key, idx, "accounts.google.com", "http", null), "plain http → silent")
  iok(!SiteIndex.hit(key, idx, "other.github.io", "https", null), "another github.io owner → silent")
  iok(!SiteIndex.hit(key, idx, null, null, "com.evil.app"), "another app → silent")
  iok(!SiteIndex.hit(key, idx, "bdo.app", "https", null), "an app login never opens the website bdo.app")
  iok(SiteIndex.hit(key, idx, null, null, "com.bdo.app"), "the app itself → offered")
  // coded: no names, key-bound
  val joined = idx.joinToString(",")
  iok(!joined.contains("google") && idx.all { Regex("^[0-9a-f]{32}$").matches(it) }, "tags only — 32 hex each, no names")
  val other = ByteArray(32) { 1 }
  iok(!SiteIndex.hit(other, idx, "accounts.google.com", "https", null), "another phone's secret can't test a site against it")
  iok(SiteIndex.build(key, listOf(null, "", " ")).isEmpty(), "logins without a site add nothing")
  return iBad
}
