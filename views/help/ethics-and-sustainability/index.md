---
layout: help-layout.njk
title: Ethics and sustainability – Climbing Logbook
eleventyNavigation:
  key: Ethics and sustainability
  order: 5
---

# Ethics and sustainability

It is, however, hard to do this completely in the tech world. This page aims to provide transparency about the tech used to build this app, and the impact of it, so that you can make a conscious choice about using it. Many of the big tech companies' tools and services are ubiquitous, so even if using them directly can be avoided, they will be used in secondary or tertiary systems. It's also difficult to claim true sustainability in tech, given the demand on power and cooling. There is even a significant social impact of major tech hubs where the cost of buying or renting property soars as tech talent moves to where the jobs are, pricing locals out of the market and directly increasing homelessness and rough sleeping.

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
- **GitHub is owned by Microsoft, which is on both lists.** It's the industry-standard source control platform, so we use it to store our code. We'll stay on its free tier for as long as we can, so we aren't contributing financially to an organisation on the BDS list.

Thanks for reading, and thanks for using Climbing Logbook.
