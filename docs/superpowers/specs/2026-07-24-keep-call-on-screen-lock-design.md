# Keep Calls Active on macOS Screen Lock

## Goal

Minutes must keep an active Signal call connected when macOS locks the user
session. This change does not alter suspend, resume, lid-close, or system-sleep
handling.

## Current behavior

Electron forwards `powerMonitor`'s `lock-screen` event to the renderer. Signal's
background preload handles that event by calling
`hangUpActiveCall('powerMonitorLockScreen')`, which RingRTC reports as a local
hangup.

## Design

Keep the existing power event pipeline intact so future upstream lock-screen
consumers still receive the event. At the existing call-hangup consumer, route
the decision through a small Minutes-owned policy helper:

- Minutes builds keep the active call unchanged.
- A non-Minutes build preserves Signal's existing local-hangup behavior.
- Suspend and resume handlers remain untouched.

The background preload identifies the Minutes build through `window.minutes`,
which is registered eagerly when the Minutes preload module is imported.

## Verification

A unit test covers both policy branches and the exact upstream hangup reason.
Type checking and focused linting cover the integration hook. Manual acceptance
is an active call that continues sending and receiving media after locking and
unlocking macOS.
