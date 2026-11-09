// The REAL Kotlin save path, for the node sims (save-sim.ts): reads the folder's item list and the login
// to save from UTF-8 files (never the console — its character set varies by machine), adds / updates it
// exactly as AutofillSaveActivity does, writes the new list and its tamper-check value to a UTF-8 file:
// line 1 action, line 2 items_mac, then the items JSON.   args: itemsFile loginJsonFile outFile
import expo.modules.memoairemvault.MiniJson
import expo.modules.memoairemvault.SaveLogic
import expo.modules.memoairemvault.VaultCrypto
import java.io.File

fun main(a: Array<String>) {
  val l = MiniJson.parse(File(a[1]).readText(Charsets.UTF_8)) as Map<*, *>
  val s = { k: String -> l[k] as String }
  val r = SaveLogic.upsert(File(a[0]).readText(Charsets.UTF_8), s("site"), s("user"), s("pass"), s("title"),
    SaveLogic.newId(System.currentTimeMillis()) { java.security.SecureRandom().nextInt(it) })
  File(a[2]).writeText(r.action + "\n" + VaultCrypto.mac(VaultCrypto.macKey(s("K")), r.itemsJson) + "\n" + r.itemsJson, Charsets.UTF_8)
}
