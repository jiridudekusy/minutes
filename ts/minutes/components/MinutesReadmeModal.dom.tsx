// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState, type JSX } from 'react';
import { ipcRenderer } from 'electron';

import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import { MINUTES_README_LABEL } from '../welcomeContent.std.ts';
import {
  getReadmeContent,
  subscribeReadmeOpen,
} from '../readmeService.preload.ts';
import { MinutesDraggableDialogHeader } from './MinutesDraggableSurface.dom.tsx';
import { MinutesMarkdown } from './MinutesMarkdown.dom.tsx';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

export function MinutesReadmeModal({
  open,
  onOpenChange,
}: Props): JSX.Element | null {
  const [markdown, setMarkdown] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    drop(
      (async () => {
        try {
          setMarkdown(await getReadmeContent());
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Nepodařilo se načíst příručku.'
          );
        } finally {
          setIsLoading(false);
        }
      })()
    );
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open, refresh]);

  if (!open) {
    return null;
  }

  return (
    <AxoDialog.Root open={open} onOpenChange={onOpenChange}>
      <AxoDialog.Content size="lg" escape="cancel-is-noop">
        <MinutesDraggableDialogHeader positionKey="readme">
          <AxoDialog.Title>{MINUTES_README_LABEL}</AxoDialog.Title>
          <AxoDialog.Close />
        </MinutesDraggableDialogHeader>

        <AxoDialog.Body>
          {isLoading && (
            <p className={tw('text-label-secondary')}>Načítám příručku…</p>
          )}

          {errorMessage && (
            <p className="MinutesReadmeModal__error">{errorMessage}</p>
          )}

          {!isLoading && !errorMessage && markdown.length > 0 && (
            <div className="MinutesReadmeModal__content">
              <MinutesMarkdown source={markdown} />
            </div>
          )}
        </AxoDialog.Body>

        <AxoDialog.Footer>
          <AxoDialog.Actions>
            <AxoDialog.Action variant="primary" onClick={() => onOpenChange(false)}>
              Zavřít
            </AxoDialog.Action>
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

export function MinutesReadmeHost(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeReadmeOpen(() => {
      setOpen(true);
    });
    const ipcHandler = (): void => {
      setOpen(true);
    };
    ipcRenderer.on('minutes:open-readme', ipcHandler);
    return () => {
      unsubscribe();
      ipcRenderer.removeListener('minutes:open-readme', ipcHandler);
    };
  }, []);

  return <MinutesReadmeModal open={open} onOpenChange={setOpen} />;
}
