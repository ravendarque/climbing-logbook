---
layout: help-layout.njk
title: Troubleshooting – Climbing Logbook
eleventyNavigation:
  key: Troubleshooting
  order: 9
---

# Troubleshooting

Start from what you're seeing. If nothing here helps, [report an issue](/help/report-an-issue/).

## My logbook downloads from scratch every time

Climbing Logbook keeps a copy of your logbook on your device, so it opens straight away and works with no signal. If it's slow to open on every visit, or you see *Syncing your logbook…* with a progress bar each time, your browser isn't letting it keep that copy. The usual causes are:

- a private or incognito window;
- a browser setting that clears site data when you close it;
- a privacy extension that blocks sites from storing data.

Use a normal window, or allow Climbing Logbook to keep site data. If you'd rather not keep data on the device, that's fine: it works online, but it downloads your logbook every time and won't work offline.

## The menu says Offline

*Status: Offline* means Climbing Logbook couldn't reach your account just now. Anything you add, edit or delete is saved on your device and sent when the connection comes back, so you don't need to do anything.

If you're online and it doesn't clear, the server may be having trouble. Climbing Logbook keeps trying, waiting a little longer each time. While changes are waiting, your log shows a **Sync** button you can tap to try straight away.

## It says Syncing… for a long time

*Syncing…* shows while changes are being sent or new ones fetched. On a slow connection that can take a while, but you can keep logging meanwhile.

If a change can't be saved at all, for example because it's no longer valid, Climbing Logbook stops trying and lists it at the top of your log as *Couldn't save*. From there you can open it in the form to fix it, or discard it.

## A climb I logged on one device isn't on another

Each device sends its own changes, and fetches changes from your other devices, when it's open and online. Open Climbing Logbook online on the device you logged it on, so it can send the climb, then open it online on the other one.

## "Not available offline on this device"

You'll see this if you open your logbook with no signal on a device where it hasn't been opened while you were logged in, such as a new device, or one where you've logged out. Connect, log in and open it once; after that it works offline.

## "Couldn't sync your logbook."

This shows when the first download of your logbook onto a device is interrupted. Check your connection and tap **Retry**.

## Safari lost my logbook

Safari deletes a website's saved data if you haven't opened it for seven days. Your logbook is safe in your account and downloads again, but changes that hadn't synced are lost. An app installed on your home screen is exempt, so [install the PWA](/help/install/) if you use an iPhone or iPad at the crag.

## "Your device's storage is full"

This shows when you save a climb with no signal and your device has no room left to keep it until it syncs. The form stays open, so you don't lose what you typed. Free up some space on your device, or save again once you're back online.

## Performance Insights asks me to connect

Your reports are normally worked out on your device, so they work with no signal. If a report asks you to connect, or the map shows no climbs offline, your browser isn't letting Climbing Logbook keep your logbook on the device, so they come from the server instead. The first section on this page explains why, and what to change.

Related: [Working offline](/help/working-offline/), [Installing the PWA](/help/install/), [Privacy](/help/privacy/).
