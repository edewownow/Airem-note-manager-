/**
 * Autofill rules (AutofillLogic.kt, 2.0.0-autofill.6) on a plain JVM — above all, that a login is
 * NEVER offered on a look-alike site or app. Run by run.sh.
 */
import expo.modules.memoairemvault.BrowserBar
import expo.modules.memoairemvault.Logins
import expo.modules.memoairemvault.MiniJson
import expo.modules.memoairemvault.SiteMatch

var aBad = 0
var aGood = 0
fun aok(c: Boolean, m: String) { if (c) aGood++ else { aBad++; println("✗ autofill: $m") } }

fun autofillTests(): Int {
  fun web(saved: String, page: String, scheme: String? = "https") = SiteMatch.matches(saved, page, scheme, "com.android.chrome")
  // the right site
  aok(web("google.com", "accounts.google.com"), "google.com login offered on accounts.google.com")
  aok(web("mail.google.com", "accounts.google.com"), "same company, other subdomain → offered")
  aok(web("https://www.Gmail.com/login", "gmail.com"), "saved as a full address → matched by its host")
  val bar = BrowserBar.page("https://accounts.google.com/signin")
  aok(bar?.first == "accounts.google.com" && bar.second == "https", "address bar keeps the site and https")
  aok(BrowserBar.page("http://accounts.google.com")?.second == "http", "address bar http stays http")
  aok(BrowserBar.page("google.com")?.let { it.first == "google.com" && it.second == null } == true, "a bare host has no scheme")
  aok(BrowserBar.page("not a url") == null && BrowserBar.isBar("url_bar") && BrowserBar.isBar("URL_BAR") && !BrowserBar.isBar("username"), "junk and a username box are not the address bar")
  aok(web("bdo.com.ph", "online.bdo.com.ph"), "country domain bdo.com.ph → online.bdo.com.ph")
  aok(web("google.com", "accounts.google.com", null), "scheme unknown (older Android) → allowed")
  // look-alikes: NEVER
  aok(!web("google.com", "google.com.evil.ph"), "google.com.evil.ph → NOT offered")
  aok(!web("google.com", "evilgoogle.com"), "evilgoogle.com → NOT offered")
  aok(!web("google.com", "google.co"), "google.co → NOT offered")
  aok(!web("google.com", "google-login.com"), "google-login.com → NOT offered")
  aok(!web("bdo.com.ph", "bdo.com.ph.evil.com"), "bdo.com.ph.evil.com → NOT offered")
  aok(!web("bdo.com.ph", "evil.com.ph"), "evil.com.ph → NOT offered (another .com.ph owner)")
  aok(!web("google.com", "xn--ggle-0nda.com"), "punycode look-alike → NOT offered")
  aok(!web("google.com", "accounts.google.com", "http"), "not https → NOT offered")
  // shared hosting: each customer is a different owner
  aok(web("ede.github.io", "ede.github.io") && web("ede.github.io", "x.ede.github.io"), "ede.github.io → itself and its subdomains")
  aok(!web("ede.github.io", "other.github.io"), "other.github.io → NOT offered")
  aok(!web("github.io", "ede.github.io"), "a login saved for github.io itself is not offered on every github.io site")
  aok(!web("myshop.myshopify.com", "evilshop.myshopify.com"), "another shop on myshopify.com → NOT offered")
  // apps: exact package only
  aok(SiteMatch.matches("com.bdo.app", null, null, "com.bdo.app"), "app with that exact package → offered")
  aok(SiteMatch.matches("android:com.bdo.app", null, null, "com.bdo.app"), "imported app login (android:com.bdo.app) → offered in that app")
  aok(!SiteMatch.matches("android:com.bdo.app", "bdo.app", "https", "com.android.chrome"), "imported app login is NEVER offered on the website bdo.app")
  aok(!SiteMatch.matches("android:com.bdo.app", null, null, "com.bdo.app.fake"), "… nor in a look-alike app")
  aok(!SiteMatch.matches("com.bdo.app", null, null, "com.bdo.app.fake"), "com.bdo.app.fake → NOT offered")
  aok(!SiteMatch.matches("bdo.com.ph", null, null, "ph.com.bdo"), "a web login is not auto-offered in an app")
  aok(!SiteMatch.matches("BDO app", "bdo.com.ph", "https", "com.android.chrome"), "an app NAME never matches a web page")
  aok(!SiteMatch.matches(null, "google.com", "https", null) && !SiteMatch.matches("", null, null, "x.y"), "no site saved → never auto-offered")
  // reading the folder's item list (the exact JSON the app writes)
  val items = """[{"id":"p1","type":"private","title":"Gmail","date":null,"time":null,"location":"google.com","people":"ede.v@gmail.com","notes":"pä\"ss\\1","via":"private","imageId":null,"thumb":null},
    {"id":"p2","type":"private","title":"BDO","date":null,"time":null,"location":"bdo.com.ph","people":"ede","notes":"b1","via":"private","imageId":"pi1","thumb":"data:,x"},
    {"id":"p3","type":"private-note","title":"Locker","location":null,"people":null,"notes":"1234"},
    {"id":"p4","type":"private-doc","title":"Passport","location":"DFA","people":"P123","notes":null},
    {"id":"p5","type":"private","title":"Old wifi","location":null,"people":"","notes":"wé"},
    {"id":"p6","type":"private","title":"Empty","location":"x.com","people":"u","notes":""}]"""
  val all = Logins.all(items)
  aok(all.map { it.id } == listOf("p1", "p2", "p5"), "only password items with a password: ${all.map { it.id }}")
  aok(all[0].password == "pä\"ss\\1" && all[2].password == "wé", "escaped quotes, backslash, unicode read exactly")
  val g = Logins.select(items, "accounts.google.com", "https", "com.android.chrome")
  aok(g.matched && g.logins.map { it.id } == listOf("p1"), "on accounts.google.com: only the Gmail login")
  val evil = Logins.select(items, "google.com.evil.ph", "https", "com.android.chrome")
  aok(!evil.matched && evil.logins.map { it.title } == listOf("BDO", "Gmail", "Old wifi"), "look-alike: nothing matched → the pick-a-login list (marked unmatched), A→Z")
  aok(MiniJson.parse("""{"a":[1,2.5,-3e2,true,false,null,"é\n"]}""") == mapOf("a" to listOf(1.0, 2.5, -300.0, true, false, null, "é\n")), "JSON: numbers, literals, escapes")
  aok(runCatching { MiniJson.parse("""[1,2""") }.isFailure && runCatching { MiniJson.parse("""{"a":1} x""") }.isFailure, "JSON: broken input refused")
  aok(Logins.all("[]").isEmpty() && Logins.all("{}").isEmpty(), "empty folder → no logins")
  return aBad
}
