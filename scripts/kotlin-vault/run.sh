#!/usr/bin/env bash
# Usage: scripts/kotlin-vault/run.sh  [GRADLE_LIB=<gradle>/lib]  [KOTLIN_VERSION=x.y.z]
# Compile + run (classes kept in scripts/kotlin-vault/.classes for core-sim.ts)
# Compile + run the Kotlin vault core tests on a plain JVM, using the Kotlin compiler that ships with
# Gradle (no Android SDK needed). Usage: scripts/kotlin-vault/run.sh   (from the repo root)
set -e
L=${GRADLE_LIB:-$(dirname "$(readlink -f "$(command -v gradle)")")/../lib}
# The Kotlin version differs per Gradle install (8.9 = 1.9.23, 8.14 = 2.0.21, 9.3 = 2.2.21): find it.
KV=${KOTLIN_VERSION:-$(ls "$L"/kotlin-compiler-embeddable-*.jar | head -1 | sed -E 's/.*embeddable-(.+)\.jar/\1/')}
echo "(Kotlin $KV from $L)"
CP="$L/kotlin-compiler-embeddable-$KV.jar:$L/kotlin-stdlib-$KV.jar:$L/kotlin-reflect-$KV.jar:$L/kotlin-script-runtime-$KV.jar:$L/kotlin-daemon-embeddable-$KV.jar:$(ls $L/annotations-*.jar | head -1):$(ls $L/kotlinx-coroutines-core-jvm-*.jar | head -1)$(ls $L/trove4j*.jar 2>/dev/null | head -1 | sed 's/^/:/')"
BC=$(ls $L/plugins/bcprov-jdk18on-*.jar | head -1)
OUT=scripts/kotlin-vault/.classes
rm -rf "$OUT" && mkdir -p "$OUT"
java -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -nowarn -cp "$L/kotlin-stdlib-$KV.jar:$BC" \
  modules/memoairem-vault/android/src/main/java/expo/modules/memoairemvault/VaultCrypto.kt modules/memoairem-vault/android/src/main/java/expo/modules/memoairemvault/VaultStore.kt modules/memoairem-vault/android/src/main/java/expo/modules/memoairemvault/AutofillLogic.kt scripts/kotlin-vault/VaultCryptoTest.kt scripts/kotlin-vault/StoreTest.kt scripts/kotlin-vault/AutofillTest.kt scripts/kotlin-vault/SaveTest.kt scripts/kotlin-vault/IndexTest.kt scripts/kotlin-vault/ScryptCli.kt scripts/kotlin-vault/SaveCli.kt -d "$OUT" 2>&1 | grep -v '^Picked up' || true
java -cp "$OUT:$L/kotlin-stdlib-$KV.jar:$BC" VaultCryptoTestKt scripts/kotlin-vault/vectors.txt 2>&1 | grep -v '^Picked up'
