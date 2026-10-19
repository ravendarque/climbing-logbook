---
layout: help-layout.njk
title: Passkeys – Climbing Logbook
eleventyNavigation:
  key: Passkeys
  order: 8.8
---

# Passkeys

A passkey lets you log in with your fingerprint, face or device PIN, instead of typing your password and a code from your authenticator app.

It's optional. Your password, and [Two-Factor Authentication (2FA)](/help/two-factor-authentication/) if you use it, keep working alongside it.

## How a passkey works

When you add a passkey, your device makes a pair of keys. It keeps the private one, locked behind your fingerprint, face or PIN, and gives us only the public one. When you log in, your device proves it has the private key, and we check that against the public one.

That means:

- **Nothing secret is stored with us.** The public key is no use to anyone on its own.
- **Your fingerprint or face never leaves your device.** We never see it.
- **It can't be phished.** A passkey only works on Climbing Logbook, so a fake site can't trick you into handing it over.
- **It counts as both factors.** It's something you have (your device) and something you are or know (your fingerprint, face or PIN), so you won't be asked for a code as well.

## Where your passkey is kept

Your phone or computer can keep it. So can a password manager, which also makes it available on your other devices. We recommend [Proton Pass](https://proton.me/pass).

## Adding a passkey

1. Go to My account, then *Account and authentication*.
2. Give it a name, such as the device it's on, so you can tell your passkeys apart.
3. Choose *Add a passkey*, and follow what your device asks.

We'll email you whenever a passkey is added or removed.

## Logging in with a passkey

On the login page, choose *Log in with a passkey*, or pick your passkey when your browser offers it as you tap the email field. Then confirm with your fingerprint, face or PIN.

## Removing a passkey

Go to My account, then *Account and authentication*, and choose *Remove* next to it under *Passkeys*. If you've lost a device that holds one, remove it straight away, then change your password.

## If your browser doesn't offer passkeys

Passkeys need a recent browser. If yours doesn't support them, you won't see the option. You can still log in with your password and, if you use it, a code.
