// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// This renderer component intentionally delegates actions to preload services.
// oxlint-disable-next-line signal-desktop/enforce-file-suffix
import {
  useCallback,
  useEffect,
  useState,
  type JSX,
  type MouseEvent,
} from 'react';
import classNames from 'classnames';

import { CallMode } from '../../types/CallDisposition.std.ts';
import { Tooltip, TooltipPlacement } from '../../components/Tooltip.dom.tsx';
import { Theme } from '../../util/theme.std.ts';
import { isRecordableCallMode } from '../types.std.ts';
import {
  callRecordingService,
  RECORDING_STATE_CHANGED,
} from '../callRecordingService.preload.ts';
import { recordingStateEvents } from '../recordingStateEvents.std.ts';
import { isCallSummaryExtensionActive } from '../callSummaryExtensionService.preload.ts';
import { callSummaryExtensionEvents } from '../callSummaryExtensionEvents.std.ts';
import { formatMenuActionLabel } from '../branding.std.ts';
import type { MinutesRecordingState } from '../types.std.ts';
import {
  getVisibleRecordingActions,
  type RecordingControlAction,
} from '../callRecordingControls.std.ts';
import { videoRecordingService } from '../videoRecordingService.preload.ts';
import {
  VIDEO_RECORDING_STATE_CHANGED,
  videoRecordingStateEvents,
} from '../videoRecordingStateEvents.std.ts';
import type { VideoRecordingState } from '../videoRecordingServiceCore.std.ts';
import { MinutesRecordingStartConfirmModal } from './MinutesRecordingStartConfirmModal.dom.tsx';

type PropsType = Readonly<{
  conversationId: string;
  callMode: CallMode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}>;

type ControlButtonPropsType = Readonly<{
  className: string;
  label: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}>;

function MinutesCallControlButton({
  className,
  label,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ControlButtonPropsType): JSX.Element {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    },
    [onClick]
  );

  return (
    <div className="CallingButton">
      <Tooltip
        className="CallingButton__tooltip"
        wrapperClassName="CallingButton__button-container"
        content={label}
        direction={TooltipPlacement.Top}
        theme={Theme.Dark}
      >
        <button
          type="button"
          className={classNames('CallingButton__icon', className)}
          aria-label={label}
          onClick={handleClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      </Tooltip>
    </div>
  );
}

export function MinutesCallRecordingControls({
  conversationId,
  callMode,
  onMouseEnter,
  onMouseLeave,
}: PropsType): JSX.Element | null {
  const [audioState, setAudioState] = useState<MinutesRecordingState>(
    callRecordingService.getState()
  );
  const [videoState, setVideoState] = useState<VideoRecordingState>(
    videoRecordingService.getState()
  );
  const [extensionActive, setExtensionActive] = useState(
    isCallSummaryExtensionActive()
  );
  const [pendingStart, setPendingStart] = useState<'audio' | 'video'>();

  useEffect(() => {
    const handler = (next: MinutesRecordingState) => setAudioState(next);
    recordingStateEvents.on(RECORDING_STATE_CHANGED, handler);
    return () => {
      recordingStateEvents.off(RECORDING_STATE_CHANGED, handler);
    };
  }, []);

  useEffect(() => {
    const handler = (next: VideoRecordingState) => setVideoState(next);
    videoRecordingStateEvents.on(VIDEO_RECORDING_STATE_CHANGED, handler);
    return () => {
      videoRecordingStateEvents.off(VIDEO_RECORDING_STATE_CHANGED, handler);
    };
  }, []);

  useEffect(() => {
    return callSummaryExtensionEvents.on(next => {
      setExtensionActive(
        next.activated && next.modelReady && next.whisperRuntimeReady
      );
    });
  }, []);

  const startAudio = useCallback(() => {
    void callRecordingService.startRecording({ conversationId, callMode });
  }, [callMode, conversationId]);

  const startVideo = useCallback(() => {
    if (callMode !== CallMode.Direct && callMode !== CallMode.Group) {
      return;
    }
    void videoRecordingService.startRecording({ conversationId, callMode });
  }, [callMode, conversationId]);

  const requestStartAudio = useCallback(() => {
    setPendingStart('audio');
  }, []);

  const requestStartVideo = useCallback(() => {
    setPendingStart('video');
  }, []);

  const confirmStart = useCallback(() => {
    const requested = pendingStart;
    setPendingStart(undefined);
    if (requested === 'video') {
      startVideo();
    } else if (requested === 'audio') {
      startAudio();
    }
  }, [pendingStart, startAudio, startVideo]);

  const handleConfirmOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingStart(undefined);
    }
  }, []);

  const pauseAudio = useCallback(() => {
    callRecordingService.pauseRecording();
  }, []);

  const resumeAudio = useCallback(() => {
    callRecordingService.resumeRecording();
  }, []);

  const stopAudio = useCallback(() => {
    void callRecordingService.stopRecording();
  }, []);

  const pauseVideo = useCallback(() => {
    videoRecordingService.pauseRecording();
  }, []);

  const resumeVideo = useCallback(() => {
    videoRecordingService.resumeRecording();
  }, []);

  const stopVideo = useCallback(() => {
    void videoRecordingService.stopRecording();
  }, []);

  if (!isRecordableCallMode(callMode)) {
    return null;
  }

  const actions = getVisibleRecordingActions(
    audioState,
    videoState,
    conversationId
  );
  if (actions.length === 0) {
    return null;
  }

  if (actions[0] === 'start-audio') {
    const audioRecordLabel = extensionActive
      ? formatMenuActionLabel('Spustit nahrávání zvuku')
      : formatMenuActionLabel(
          'Spustit nahrávání zvuku (přepis vyžaduje rozšíření Whisper)'
        );

    return (
      <>
        <MinutesCallControlButton
          className="MinutesCallRecordingControls__button MinutesCallRecordingControls__button--record MinutesCallRecordingControls__button--record-audio"
          label={audioRecordLabel}
          onClick={requestStartAudio}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
        <MinutesCallControlButton
          className="MinutesCallRecordingControls__button MinutesCallRecordingControls__button--record MinutesCallRecordingControls__button--record-video"
          label={formatMenuActionLabel('Spustit nahrávání sdíleného videa')}
          onClick={requestStartVideo}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
        <MinutesRecordingStartConfirmModal
          open={pendingStart != null}
          onOpenChange={handleConfirmOpenChange}
          onConfirm={confirmStart}
        />
      </>
    );
  }

  const primaryAction = actions[0];
  const isPaused =
    primaryAction === 'resume-audio' || primaryAction === 'resume-video';
  const isVideo =
    primaryAction === 'pause-video' || primaryAction === 'resume-video';
  let primaryLabel: string;
  if (isPaused) {
    primaryLabel = isVideo
      ? 'Obnovit nahrávání videa'
      : 'Obnovit nahrávání zvuku';
  } else {
    primaryLabel = isVideo
      ? 'Pozastavit nahrávání videa'
      : 'Pozastavit nahrávání zvuku';
  }
  const stopAction = actions[1];

  const onPrimaryClickByAction: Record<
    Exclude<
      RecordingControlAction,
      'start-audio' | 'start-video' | 'stop-audio' | 'stop-video'
    >,
    () => void
  > = {
    'pause-audio': pauseAudio,
    'resume-audio': resumeAudio,
    'pause-video': pauseVideo,
    'resume-video': resumeVideo,
  };

  return (
    <>
      <MinutesCallControlButton
        className={classNames(
          'MinutesCallRecordingControls__button',
          `MinutesCallRecordingControls__button--${isPaused ? 'resume' : 'pause'}`,
          'MinutesCallRecordingControls__button--active'
        )}
        label={formatMenuActionLabel(primaryLabel)}
        onClick={onPrimaryClickByAction[primaryAction]}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      <MinutesCallControlButton
        className="MinutesCallRecordingControls__button MinutesCallRecordingControls__button--stop MinutesCallRecordingControls__button--active"
        label={formatMenuActionLabel(
          isVideo
            ? 'Ukončit a uložit video'
            : 'Ukončit a uložit zvukovou nahrávku'
        )}
        onClick={stopAction === 'stop-video' ? stopVideo : stopAudio}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </>
  );
}
