---
layout: help-layout.njk
title: Two-Factor Authentication (2FA) – Climbing Logbook
eleventyNavigation:
  key: Two-Factor Authentication (2FA)
  order: 8.7
---

# Two-Factor Authentication (2FA)

2FA adds a second check when you log in. After your password, you enter a 6-digit code from an authenticator app on your phone.

It's optional, and it's entirely up to you whether to use it.

## What 2FA is

Normally, logging in takes one thing: something you know, your password. 2FA adds a second thing: something you have, your phone.

To get into your account, someone needs both. If someone finds out your password, say from a data leak on another website, they still can't log in without your phone. And your phone on its own isn't enough without your password.

## Setting it up

You'll need an authenticator app. We really like [Proton Authenticator](https://proton.me/authenticator) and [Ente Auth](https://ente.com/auth/), but you can use any authenticator app.

1. Go to My account, then *Two-Factor Authentication (2FA)*, and choose *Set up 2FA*.
2. Enter your password.
3. Scan the QR code with your authenticator app. If you can't scan it, type the setup key into the app instead.
4. Enter the code the app shows, to check it's working.
5. **Save your backup codes.** You get 10, and each one lets you log in once without your phone. See [Keeping your backup codes safe](#backup-codes).

<h2 id="backup-codes">Keeping your backup codes safe</h2>

Treat your backup codes like passwords. Anyone who has one of them and your password can get into your account.

- **Don't** keep them as plain text, in a notes app, in an email to yourself or as a screenshot.
- **Do** keep them in a secure password manager or vault, separate from your phone's authenticator app. We recommend [Proton Pass](https://proton.me/pass) or [Ente Locker](https://ente.com/locker/).

## Logging in

After your password, enter the code your authenticator app shows for Climbing Logbook. The code changes every 30 seconds.

Tick *Don't ask for a code on this device for 28 days* on a phone or computer only you use, so you're not asked every time.

If you don't have your phone, choose *Use a backup code instead*.

## If you've lost your phone and your backup codes

Log in with your password, then choose *Lost your device and your backup codes?*. We'll email you a link. When you use it, 2FA switches off **7 days later**. You'll get an email when the wait starts, and another when it ends.

### Why there's a wait

The wait protects you. 2FA is there for the moment someone else has your password. If anyone with your password could switch it off straight away, it wouldn't protect you at all.

With the wait, someone with your password would also need your email, and would have to go a whole week without you noticing. You'll get an email as soon as the wait starts, and you can cancel it from that email or from My account.

### Why we can't switch it off for you

When someone asks us for help, all we can see is a message and an email address. We can't tell you apart from someone pretending to be you, so we'd be handing them your account. That's why there's no way round the wait, even by asking us. Saving your backup codes when you set it up is the way to avoid it.

## Turning it off

Go to My account, then *Two-Factor Authentication (2FA)*, and choose *Turn off*. You'll need your password. After that you log in with just your password.

## New backup codes

If you've used most of your backup codes, or think someone has seen them, choose *Get new backup codes* in My account. Your old codes stop working straight away.
