/**
 * Proves the Kotlin vault core (modules/memoairem-vault/.../VaultCrypto.kt) is byte-for-byte the JS
 * one (src/lib/vaultCrypto.ts): every line of vectors.txt (made by the JS code) is reproduced, and
 * scrypt is also cross-checked against BouncyCastle on random inputs. Run: scripts/kotlin-vault/run.sh
 */
import expo.modules.memoairemvault.VaultCrypto as V
import java.io.File

var bad = 0
var good = 0
fun ok(c: Boolean, m: String) { if (c) good++ else { bad++; println("✗ $m") } }
fun s(hex: String) = String(V.unhex(hex), Charsets.UTF_8)

/** The value of a top-level JSON string field, unescaped (enough for the backup file's "h"). */
fun jsonString(json: String, field: String): String {
  val start = json.indexOf("\"$field\":\"") + field.length + 4
  val out = StringBuilder()
  var i = start
  while (json[i] != '"') {
    if (json[i] == '\\') {
      i++
      when (json[i]) {
        'n' -> out.append('\n'); 't' -> out.append('\t'); 'r' -> out.append('\r')
        'u' -> { out.append(json.substring(i + 1, i + 5).toInt(16).toChar()); i += 4 }
        else -> out.append(json[i])
      }
    } else out.append(json[i])
    i++
  }
  return out.toString()
}

fun main(args: Array<String>) {
  val lines = File(args[0]).readLines().filter { it.isNotBlank() }
  for (ln in lines) {
    val p = ln.split('\t')
    val name = p[0]
    val f = p.drop(1).map { s(it) }
    try { check(name, f) } catch (e: Exception) { ok(false, "$name crashed: ${e.javaClass.simpleName} ${e.message ?: ""}") }
  }
  scryptVsBouncyCastle()
}

fun check(name: String, f: List<String>) {
    when (name) {
      "scrypt" -> {
        val out = V.scrypt(f[0].toByteArray(), f[1].toByteArray(), f[2].toInt(), f[3].toInt(), f[4].toInt(), f[5].toInt())
        ok(V.hex(out) == f[6], "scrypt N=${f[2]} r=${f[3]} p=${f[4]} pw='${f[0]}'")
      }
      "pbkdf2" -> ok(V.hex(V.pbkdf2(f[0].toByteArray(), f[1].toByteArray(), f[2].toInt(), f[3].toInt())) == f[4], "pbkdf2 c=${f[2]}")
      "hkdf" -> ok(V.hex(V.hkdf(V.unhex(f[0]), f[1].toByteArray(), f[2], f[3].toInt())) == f[4], "hkdf ${f[2]} len ${f[3]}")
      "b64" -> {
        ok(V.toB64(V.unhex(f[0])) == f[1], "base64 of ${f[0].length / 2} bytes")
        ok(V.hex(V.fromB64(f[1])) == f[0], "base64 back, ${f[0].length / 2} bytes")
      }
      "fromb64" -> ok(V.hex(V.fromB64(f[0])) == f[1], "fromB64 skips line breaks")
      "answer" -> ok(V.normalizeAnswer(f[0]) == f[1], "answer '${f[0]}' → '${f[1]}' (got '${V.normalizeAnswer(f[0])}')")
      "reckey" -> ok((V.normalizeRecoveryKey(f[0]) ?: "NULL") == f[1], "recovery key '${f[0]}' → ${f[1]}")
      "pause" -> ok(V.pinPause(f[0].toInt()).toString() == f[1], "pause after ${f[0]} wrong")
      "pinwrap" -> {
        val (pin, salt, pepper, n, iv, k, pkHex, wIv, wCt) = f9(f)
        val key = V.pinKey(pin, salt, pepper, n.toInt())
        ok(V.hex(key) == pkHex, "PIN key")
        ok(String(V.unseal(key, V.Sealed(wIv, wCt), V.AAD_PIN)) == k, "JS PIN copy opens in Kotlin")
        ok(V.seal(key, V.unhex(iv), k.toByteArray(), V.AAD_PIN) == V.Sealed(wIv, wCt), "Kotlin PIN copy = JS copy, byte for byte")
        ok(runCatching { V.unseal(V.pinKey("482917", salt, pepper, n.toInt()), V.Sealed(wIv, wCt), V.AAD_PIN) }.isFailure, "wrong PIN refused")
      }
      "qwrap" -> {
        val key = V.questionKey(f[0], f[1], f[2], f[3], f[4], f[5].toInt())
        ok(V.hex(key) == f[8], "question key")
        ok(String(V.unseal(key, V.Sealed(f[9], f[10]), V.AAD_SQ)) == f[7], "JS question copy opens in Kotlin")
        ok(V.seal(key, V.unhex(f[6]), f[7].toByteArray(), V.AAD_SQ) == V.Sealed(f[9], f[10]), "Kotlin question copy = JS copy")
        ok(V.hex(V.questionKey("ede vallejos", "ede@example.com", "ocean-star", f[3], f[4], f[5].toInt())) == f[8], "answer typed differently → same key")
      }
      "recwrap" -> {
        val rk = V.recoveryWrapKey(f[0])
        ok(V.hex(rk) == f[3], "recovery key → wrap key")
        ok(String(V.unseal(rk, V.Sealed(f[4], f[5]), V.AAD_REC)) == f[2], "JS recovery copy opens in Kotlin")
        ok(V.seal(rk, V.unhex(f[1]), f[2].toByteArray(), V.AAD_REC) == V.Sealed(f[4], f[5]), "Kotlin recovery copy = JS copy")
        ok(V.hex(V.backupKey(f[0])) == f[6], "backup key")
      }
      "mac" -> {
        ok(V.hex(V.macKey(f[0])) == f[2], "tamper-check key")
        ok(V.mac(V.macKey(f[0]), f[1]) == f[3], "tamper check of items (with ✓)")
      }
      "backup" -> {
        val code = f[0]; val file = f[1]
        val h = jsonString(file, "h"); val iv = jsonString(file, "iv"); val ct = jsonString(file, "ct")
        val payload = String(V.unseal(V.backupKey(code), V.Sealed(iv, ct), h), Charsets.UTF_8)
        ok(payload.contains("Pässport"), "JS backup file opens in Kotlin")
        ok(V.seal(V.backupKey(code), V.unhex(iv), payload.toByteArray(), h).ct == ct, "Kotlin backup = JS backup, byte for byte")
        ok(runCatching { V.unseal(V.backupKey(code), V.Sealed(iv, ct), h.replace("Ede", "Eve")) }.isFailure, "changed backup header refused")
      }
      else -> ok(false, "unknown vector $name")
    }
}

fun scryptVsBouncyCastle() {
  // scrypt against BouncyCastle on random inputs (another independent implementation)
  val rnd = java.util.Random(7)
  for (t in 0 until 12) {
    val pw = ByteArray(rnd.nextInt(20)).also { rnd.nextBytes(it) }
    val salt = ByteArray(rnd.nextInt(20)).also { rnd.nextBytes(it) }
    val n = 1 shl (1 + rnd.nextInt(10)); val r = 1 + rnd.nextInt(8); val p = 1 + rnd.nextInt(3); val dk = 1 + rnd.nextInt(80)
    val bc = org.bouncycastle.crypto.generators.SCrypt.generate(pw, salt, n, r, p, dk)
    ok(V.scrypt(pw, salt, n, r, p, dk).contentEquals(bc), "scrypt = BouncyCastle (N=$n r=$r p=$p dk=$dk)")
  }
  val t0 = System.nanoTime(); V.pinKey("482916", "00".repeat(16), "11".repeat(32)); val ms = (System.nanoTime() - t0) / 1_000_000
  println("(PIN key on this JVM: $ms ms)")
  println(if (bad == 0) "all $good Kotlin vault checks match the JS code" else "$bad of ${good + bad} checks FAILED")
  val storeBad = storeTests()
  println(if (storeBad == 0) "all $sGood Kotlin store checks pass" else "$storeBad of ${sGood + sBad} store checks FAILED")
  val afBad = autofillTests()
  println(if (afBad == 0) "all $aGood Kotlin autofill checks pass" else "$afBad of ${aGood + aBad} autofill checks FAILED")
  val svBad = saveTests()
  println(if (svBad == 0) "all $vGood Kotlin save checks pass" else "$svBad of ${vGood + vBad} save checks FAILED")
  val ixBad = indexTests()
  println(if (ixBad == 0) "all $iGood Kotlin site-index checks pass" else "$ixBad of ${iGood + iBad} site-index checks FAILED")
  if (bad > 0 || storeBad > 0 || afBad > 0 || svBad > 0 || ixBad > 0) System.exit(1)
}

private operator fun <T> List<T>.component6() = this[5]
private operator fun <T> List<T>.component7() = this[6]
private operator fun <T> List<T>.component8() = this[7]
private operator fun <T> List<T>.component9() = this[8]
private fun f9(f: List<String>) = f
