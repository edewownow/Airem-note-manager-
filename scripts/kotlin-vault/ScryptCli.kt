// Tiny command line around the REAL Kotlin vault core, so the node vault simulation (core-sim.ts) can
// run the JS vault code end to end against Kotlin's scrypt: args = passwordHex saltHex N r p dkLen.
import expo.modules.memoairemvault.VaultCrypto

fun main(a: Array<String>) {
  print(VaultCrypto.hex(VaultCrypto.scrypt(VaultCrypto.unhex(a[0]), VaultCrypto.unhex(a[1]), a[2].toInt(), a[3].toInt(), a[4].toInt(), a[5].toInt())))
}
