# MemoAirem Privacy Policy

**App:** MemoAirem ("Airem 2", version 2.0.0) · package `com.valle.memoairem`
**Publisher:** Edwin Vallejos (solo developer)
**Effective date:** 31 October 2026
**Contact:** vallejosed52@gmail.com

MemoAirem is a notes, schedule and reminders app that keeps your data on your own phone. This policy says what stays on the phone, what can leave it, and who receives it when it does.

**In short:** I (the developer) do not receive, collect, store or sell any of your data. MemoAirem has no accounts and no MemoAirem server. Your data leaves your phone only through the optional features listed under "What can leave your phone", and only when you use them.

## What stays on your phone

- **Your records.** Notes, schedules, reminders and similar items are stored on the phone. There is no MemoAirem server for them.
- **Photos.** A photo you capture or pick is kept only while you review it. When you save, the full photo is dropped and only a small thumbnail is kept in the record.
- **The Private folder.** Passwords, IDs and private notes are encrypted on the phone. They open with your PIN or fingerprint, and the key is protected by the phone's secure hardware keystore. Your fingerprint itself is handled by Android; the app never sees or stores it. The Private folder is never sent to Gemini, Harbor or Gemma, and it is excluded from every kind of backup. If you forget your PIN and lose your recovery key, nobody, including me, can recover it.
- **Autofill (optional).** If you turn MemoAirem on as your autofill service in Android settings, then when you open a sign-in screen in another app or website, Android shows MemoAirem that screen's fields and the name of the app or website. MemoAirem uses this only to decide whether you have a saved login for that place, to fill it after you unlock, to offer to save a new login or a changed password into your Private folder, and to suggest a strong password. This stays on the phone: nothing from autofill is sent anywhere. You can turn autofill off at any time in Android settings.
- **Copied passwords.** A password you copy from the Private folder is cleared from the clipboard after 30 seconds.
- **Importing logins.** If you import a file of logins (for example an export from Google Password Manager), the file is read on the phone and stored only in your Private folder.
- **What the app learns.** The words you teach it, the corrections you make and the "what it missed" list stay on the phone. Nothing private is kept in them. They leave the phone only if you choose to export and share them.
- **Your profile.** If you enter a name or email in Settings (used for account-free recovery questions), it stays on the phone.
- **On-phone features.** The Airem assistant that finds your records and answers questions, the built-in Kokoro voice, the Whisper and Parakeet listeners, and the optional Gemma model all run on the phone. Gemma is an optional download, once; after that it stays on the phone. It only rewrites an answer from records Airem already found, and it never sees the Private folder or your whole store.
- **Voice backup recording.** To let the built-in listener try again, the app may keep a short recording of what you said on the phone. It is not uploaded.
- **Downloads.** The Kokoro voice, the Whisper and Parakeet listeners and the noise cleaner are downloads from GitHub (`github.com/k2-fsa/sherpa-onnx`). Gemma is a download from the published LiteRT file on Hugging Face (`huggingface.co`). During first-time setup, if the phone has a signal and enough free space, Kokoro, Parakeet, and Gemma start downloading while you finish setting up. You can keep going, and you can remove them later in Settings. Whisper stays a separate download. The site that sends the file sees the normal connection details of the download (such as your IP address), as with any website. None of these files come from a computer. They are not inside the Play package. After a download finishes, that piece stays on the phone and runs there.

## What can leave your phone

Nothing is sent off the phone unless you use one of these:

1. **Google speech recognition.** When the phone is online and listening is not set to "Phone only", what you say is sent to Google's speech recognition service to be turned into text. With it, the app also gives Google a list of names, places and short titles from your saved records, and words you corrected, so it recognises them better. Private folder items are never in that list. In "Phone only" mode, listening stays on the phone. Google handles this under [Google's Privacy Policy](https://policies.google.com/privacy).
2. **Google Gemini (only if you add a key).** If you save your own Gemini key in Settings, a photo, a file or a spoken note you capture can be sent to Google Gemini so it can be turned into a record. Notes you type are not sent. The Private folder is never sent. The key is stored on the phone and used only for this. Google handles what you send under the terms of your Gemini key; depending on your plan, Google may use what is submitted to improve its products, so check your plan.
3. **Harbor (only if you set it up).** If you enter your own Harbor server address and key in Settings, your ordinary records (notes, schedules, reminders, including their thumbnails) and deletions are sent to that server. The Private folder is never sent. You choose the server; MemoAirem does not run it. If you uninstall the app, copies on your Harbor server stay there until you delete them on the server.
4. **Your phone's own voice.** If you choose your phone's built-in text-to-speech voice instead of Kokoro, that voice is part of Android and your phone maker's software, which handles the text it speaks under its own rules.

MemoAirem has no ads, no analytics, no crash-reporting service and no tracking. I do not sell or share your data.

## Permissions

- **Camera**: to capture a schedule, flyer or note. Photos go nowhere unless you use Gemini as described above.
- **Microphone**: to listen when you tap the mic.
- **Internet**: for Google speech recognition, Gemini, Harbor and optional model downloads.
- **Fingerprint / screen lock**: through Android's own prompt, to open the Private folder.
- **Photos and files**: MemoAirem uses Android's system photo and file pickers. You pick one item, and the app gets only that item. It does not ask for access to your whole gallery.
- **Autofill service**: only if you turn it on in Android settings (see above).

## Backup and moving to a new phone

MemoAirem turns off Android's app backup, so none of its data is saved to Google's backup or copied by device-to-device transfer. A new phone starts empty. If you use Harbor, your ordinary records can be restored from it; the Private folder never leaves the phone.

## Keeping and deleting your data

Your data stays on the phone until you delete it. You can delete a record in the app. You can delete the Private folder in the app; it asks for your PIN or fingerprint and a typed confirmation. Uninstalling the app removes your records and the Private folder from the phone. Data held by Google (speech or Gemini) or on your own Harbor server is managed through those services.

## Children

MemoAirem is not directed at children under 13, and I do not knowingly collect any data from them.

## Your choices

You decide which optional features to use: Google listening can be set to "Phone only", Gemini and Harbor work only if you add a key or address, autofill works only if you enable it, and you can delete your data at any time as described above.

## Changes to this policy

If this policy changes, the new effective date will appear at the top of this page.

## Contact

Questions about this policy: **vallejosed52@gmail.com**
