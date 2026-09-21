---
layout: help-layout.njk
title: Ethics and sustainability – Climbing Logbook
eleventyNavigation:
  key: Ethics and sustainability
  order: 5
---

# Ethics and sustainability

We want Climbing Logbook to be built and run responsibly. It's hard to do that perfectly in the tech world, so this page is honest about the choices we've made and the compromises in them. That way you can decide for yourself whether you're happy to use it.

Almost every tech tool depends on big companies, even when you avoid them directly. And nothing in tech is truly sustainable. Servers need power and cooling, and tech hubs push up housing costs for the people who live there.

## Sustainability

- **Your device does the work first.** Everything you log is saved on your device and synced later, which means fewer trips over the network.
- **No servers sitting idle.** The app runs on Cloudflare's serverless platform, so it only uses computing power when someone is actually using it.

### Building with AI

We build Climbing Logbook with the help of AI tools, including Claude. It wouldn't exist otherwise. AI uses real energy and water, both to train the models and to run them.

We made a trade-off. We accepted that impact so we could build something useful for climbers. We think the footprint of a small app like this is modest, but it isn't zero, and we'd rather say so.

## The tools we use

- **GitHub** for our code.
- **Cloudflare** to host the app.
- **Resend** to send emails.
- **Claude** (from Anthropic) to help write code.
- **Bebas Neue**, a font we host ourselves, so your visit doesn't send a request to Google Fonts.

## Who we buy from

We support the [Boycott, Divestment and Sanctions (BDS) movement](https://bdsmovement.net). We've checked every package, tool, framework and provider we use against BDS's consumer boycott targets and its No Tech for Oppression, Apartheid or Genocide campaign, and we check anything new before we adopt it.

- **We deliberately don't offer "Sign in with Google" or "Sign in with GitHub".** Your account uses an email address and password instead.
- **GitHub is owned by Microsoft, which is on both lists.** We use it to store our code, and we'd rather tell you than leave it out.

## How we build

- **We're a very small team,** so there's no long supply chain behind the app.
- **The code is public,** so you can see how it works.
- **We follow accessibility guidelines** so the app works for as many people as possible.

Thanks for reading, and thanks for using Climbing Logbook.
