// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { app, BrowserWindow } from 'electron';

import { createLogger } from '../ts/logging/log.std.ts';
import { initializeMinutesChannel } from './minutes_channel.main.ts';
import { runCallPipelineTest } from '../ts/minutes/testCallPipeline.main.ts';

const log = createLogger('minutes/testPipeline');

export async function runTestPipelineFromMain(): Promise<void> {
  log.info('call pipeline test started (MINUTES_TEST_PIPELINE=1)');

  await initializeMinutesChannel();

  const code = await runCallPipelineTest({ BrowserWindow });

  log.info(`call pipeline test finished (exit ${code})`);
  app.exit(code);
}
