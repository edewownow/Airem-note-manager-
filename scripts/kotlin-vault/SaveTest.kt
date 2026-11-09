/**
 * Phase 3 rules (2.0.0-autofill.8) on a plain JVM: the item list written back exactly, add vs
 * update vs unchanged, the id shape, the strong-password generator. Run by run.sh.
 */
import expo.modules.memoairemvault.JsonOut
import expo.modules.memoairemvault.Logins
import expo.modules.memoairemvault.MiniJson
import expo.modules.memoairemvault.PasswordGen
import expo.modules.memoairemvault.SaveLogic

var vBad = 0
var vGood = 0
fun vok(c: Boolean, m: String) { if (c) vGood++ else { vBad++; println("✗ save: $m") } }

fun saveTests(): Int {
  val items = """[{"id":"p1","type":"private","title":"Gmail","date":null,"time":null,"location":"google.com","people":"Ede.V@gmail.com","notes":"old \"pw\"\\","via":"private","imageId":null,"thumb":null},{"id":"p2","type":"private-doc","title":"Passport","date":"2032-03-04","time":null,"location":"DFA","people":"P123","notes":"Issued: 2022-03-05\nrenew ✓","via":"private","imageId":"pi1","thumb":"data:image/jpeg;base64,QUJD"}]"""
  // round trip: what Kotlin writes, MiniJson (and the app's JSON.parse) reads back identically
  vok(MiniJson.parse(JsonOut.write(MiniJson.parse(items))) == MiniJson.parse(items), "item list survives read → write → read exactly (quotes, backslash, line break, ✓)")
  vok(JsonOut.write(mapOf("a" to "\u0001 x")) == "{\"a\":\"\\u0001\\u2028x\"}", "control characters escaped")
  // update: same place (another google.com page) + same username, any case
  val u = SaveLogic.upsert(items, "accounts.google.com", "ede.v@GMAIL.com", "new pw", "google.com", "pNEW")
  vok(u.action == "updated" && u.title == "Gmail", "same site owner + same username → UPDATED (${u.action})")
  val ua = MiniJson.parse(u.itemsJson) as List<*>
  vok(ua.size == 2 && (ua[0] as Map<*, *>)["notes"] == "new pw" && (ua[0] as Map<*, *>)["id"] == "p1" && (ua[0] as Map<*, *>)["title"] == "Gmail", "only the password changed — id, title, place kept")
  vok((ua[1] as Map<*, *>) == (MiniJson.parse(items) as List<*>)[1], "the document next to it is untouched, byte for byte")
  vok(SaveLogic.upsert(items, "google.com", "ede.v@gmail.com", "old \"pw\"\\", "x", "pN").action == "same", "same password → nothing written")
  // add
  val a = SaveLogic.upsert(items, "facebook.com", "ede", "fb1", "facebook.com", "pFB")
  val aa = MiniJson.parse(a.itemsJson) as List<*>
  vok(a.action == "added" && aa.size == 3 && (aa[0] as Map<*, *>)["id"] == "pFB" && (aa[0] as Map<*, *>)["location"] == "facebook.com", "a new site → ADDED, first in the list")
  vok((aa[0] as Map<*, *>).keys == setOf("id", "type", "title", "date", "time", "location", "people", "notes", "via", "imageId", "thumb"), "a new login has exactly the app's 11 fields")
  vok(SaveLogic.upsert(items, "google.com", "someone.else", "x", "google.com", "pX").action == "added", "same site, other username → a second login")
  vok(SaveLogic.upsert(items, "google.com.evil.ph", "ede.v@gmail.com", "x", "evil", "pE").action == "added", "a look-alike site never updates your real login")
  vok(SaveLogic.upsert(items, "android:com.bdo.app", "ede", "b", "BDO", "pB").action == "added" &&
      SaveLogic.upsert(SaveLogic.upsert(items, "android:com.bdo.app", "ede", "b", "BDO", "pB").itemsJson, "android:com.bdo.app", "ede", "b2", "BDO", "pC").action == "updated", "app logins: added, then updated for the same app")
  vok(!SaveLogic.samePlace("android:com.bdo.app", "bdo.app"), "an app login and the website bdo.app are never the same place")
  vok(Logins.all(a.itemsJson).any { it.id == "pFB" && it.password == "fb1" }, "autofill sees the saved login")
  vok(SaveLogic.upsert("", "x.com", "u", "p", "x.com", "p1").action == "added", "empty folder → added")
  // ids + titles
  val id = SaveLogic.newId(1730000000000L) { 5 }
  vok(Regex("^p[0-9a-z]+[A-Za-z0-9_-]{9}$").matches(id), "id has the app's shape: $id")
  vok(SaveLogic.titleFor("accounts.google.com", null) == "google.com" && SaveLogic.titleFor(null, "BDO Mobile") == "BDO Mobile" && SaveLogic.titleFor(null, null) == "Login", "titles: site owner, app name, or Login")
  vok(SaveLogic.passwordToKeep("typed-by-me", "Generated1!") == "typed-by-me", "a password the person typed wins over the generated one")
  vok(SaveLogic.passwordToKeep(null, "Generated1!") == "Generated1!" && SaveLogic.passwordToKeep("", "Generated1!") == "Generated1!", "a blank page keeps the strong password that was filled in")
  vok(SaveLogic.passwordToKeep(null, null) == null && SaveLogic.passwordToKeep("", "") == null, "nothing typed and nothing generated → nothing saved")
  // generator
  val rnd = java.security.SecureRandom()
  val pws = (1..300).map { PasswordGen.generate({ n -> rnd.nextInt(n) }) }
  vok(pws.all { it.length == 16 && PasswordGen.isStrongShape(it) }, "300 generated: 16 characters, upper + lower + digit + symbol")
  vok(pws.none { p -> p.any { it in "O0Il1" } }, "no look-alikes (O 0 I l 1)")
  vok(pws.toSet().size == 300, "all different")
  return vBad
}
