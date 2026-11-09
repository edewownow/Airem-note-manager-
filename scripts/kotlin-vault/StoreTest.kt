/**
 * The Kotlin folder storage (VaultStore.kt, 2.0.0-autofill.4) on a plain JVM: round trip, wrong
 * key, a changed byte, a swapped file, big photos, unicode, overwrite, delete. Run by run.sh.
 */
import expo.modules.memoairemvault.VaultStore
import expo.modules.memoairemvault.VaultCrypto
import java.io.File

var sBad = 0
var sGood = 0
fun sok(c: Boolean, m: String) { if (c) sGood++ else { sBad++; println("✗ store: $m") } }

fun storeTests(): Int {
  val base = createTempDirectoryCompat()
  val K = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"
  val s = VaultStore(base, "vault-testfolder01", K)
  sok(!s.exists() && s.get("items") == null, "empty folder: nothing there")
  s.set("canary", "memoairem-private-v1")
  s.set("items", """[{"id":"p1","title":"Gmail ✓ Pässport 日本"}]""")
  sok(s.exists() && s.get("items")!!.contains("Pässport 日本"), "write + read back (unicode)")
  val big = "QUJD".repeat(600_000) // ~2.4 MB photo
  s.set("img:pi1", big)
  sok(s.get("img:pi1") == big, "a 2.4 MB photo round-trips")
  sok(s.keys() == listOf("canary", "img:pi1", "items"), "lists its entries by name: ${s.keys()}")
  val dir = File(base, "vault-testfolder01")
  val itemsFile = dir.listFiles()!!.first { String(VaultCrypto.unhex(it.name.removeSuffix(".v4"))) == "items" }
  sok(!itemsFile.readText().contains("Gmail") && itemsFile.readText().startsWith("v4:"), "on disk: no readable text")
  // reopened in a "new process"
  val again = VaultStore(base, "vault-testfolder01", K)
  sok(again.get("items")!!.contains("Gmail"), "reopened with the right key: readable")
  // wrong key → refused, never "empty"
  val wrong = VaultStore(base, "vault-testfolder01", "X".repeat(32))
  sok(runCatching { wrong.get("items") }.isFailure, "wrong key → refused (throws), not empty")
  // one changed byte
  val orig = itemsFile.readText()
  val flipped = orig.substring(0, orig.length - 5) + (if (orig[orig.length - 5] == 'A') 'B' else 'A') + orig.substring(orig.length - 4)
  itemsFile.writeText(flipped)
  sok(runCatching { again.get("items") }.isFailure, "one changed byte → refused")
  itemsFile.writeText(orig)
  // a file swapped for another entry's (e.g. a photo put where the item list was)
  val canaryFile = dir.listFiles()!!.first { String(VaultCrypto.unhex(it.name.removeSuffix(".v4"))) == "canary" }
  val canaryText = canaryFile.readText()
  canaryFile.writeText(orig)
  sok(runCatching { again.get("canary") }.isFailure, "an entry swapped into another's place → refused")
  canaryFile.writeText(canaryText)
  sok(again.get("canary") == "memoairem-private-v1", "restored → readable again")
  // overwrite leaves no temp file
  again.set("items", "[]")
  sok(again.get("items") == "[]" && dir.listFiles()!!.none { it.name.endsWith(".tmp") }, "overwrite: new value, no temp file left")
  // a crash mid-write leaves the old entry: simulate a stray temp file
  File(dir, itemsFile.name + ".tmp").writeText("garbage")
  sok(again.get("items") == "[]" && again.keys().size == 3, "a stray temp file (crash mid-write) is ignored")
  again.remove("img:pi1")
  sok(again.get("img:pi1") == null && again.keys() == listOf("canary", "items"), "remove")
  // ids
  sok(runCatching { VaultStore(base, "../etc", K) }.isFailure && runCatching { VaultStore(base, "vault-a/b", K) }.isFailure, "bad folder ids refused (no path tricks)")
  sok(runCatching { VaultStore(base, "vault", K) }.isSuccess, "the 1.10 storage name \"vault\" is allowed")
  sok(VaultStore.existsFor(base, "vault-testfolder01") && !VaultStore.existsFor(base, "vault-otherfolder1"), "existsFor")
  sok(VaultStore.deleteAll(base, "vault-testfolder01") && !dir.exists(), "delete the whole folder (no key needed)")
  base.deleteRecursively()
  return sBad
}

fun createTempDirectoryCompat(): File = java.nio.file.Files.createTempDirectory("memoairem-store").toFile()
