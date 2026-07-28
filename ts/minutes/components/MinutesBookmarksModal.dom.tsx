// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState, type JSX } from 'react';
import { ipcRenderer } from 'electron';

import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { drop } from '../../util/drop.std.ts';
import type { MinutesBookmark } from '../bookmarks.std.ts';
import {
  listBookmarks,
  navigateToBookmark,
  removeBookmarkById,
} from '../bookmarksService.preload.ts';
import { MinutesDraggableDialogHeader } from './MinutesDraggableSurface.dom.tsx';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

function formatWhen(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString('cs-CZ');
  } catch {
    return '';
  }
}

export function MinutesBookmarksModal({
  open,
  onOpenChange,
}: Props): JSX.Element | null {
  const [bookmarks, setBookmarks] = useState<Array<MinutesBookmark>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    drop(
      (async () => {
        try {
          setBookmarks(await listBookmarks());
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Nepodařilo se načíst záložky.'
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

  const handleOpen = useCallback(
    (bookmark: MinutesBookmark) => {
      navigateToBookmark(bookmark);
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const handleRemove = useCallback(
    (bookmark: MinutesBookmark) => {
      drop(
        (async () => {
          await removeBookmarkById(bookmark.id);
          refresh();
        })()
      );
    },
    [refresh]
  );

  if (!open) {
    return null;
  }

  return (
    <AxoDialog.Root open={open} onOpenChange={onOpenChange}>
      <AxoDialog.Content size="md" escape="cancel-is-noop">
        <MinutesDraggableDialogHeader positionKey="bookmarks">
          <AxoDialog.Title>Záložky</AxoDialog.Title>
          <AxoDialog.Close />
        </MinutesDraggableDialogHeader>

        <AxoDialog.Body>
          <AxoDialog.Description>
            <p className={tw('mb-4 text-label-medium leading-relaxed')}>
              Uložené zprávy z libovolného chatu. Přidejte je pravým tlačítkem na
              zprávu → <strong>Přidat do záložek</strong>.
            </p>
          </AxoDialog.Description>

          {isLoading && (
            <p className={tw('text-label-secondary')}>Načítám…</p>
          )}

          {errorMessage && (
            <p className="MinutesBookmarksModal__error">{errorMessage}</p>
          )}

          {!isLoading && bookmarks.length === 0 && (
            <p className={tw('text-label-secondary')}>
              Zatím nemáte žádné záložky.
            </p>
          )}

          {!isLoading && bookmarks.length > 0 && (
            <ul className="MinutesBookmarksModal__list">
              {bookmarks.map(bookmark => (
                <li key={bookmark.id} className="MinutesBookmarksModal__item">
                  <button
                    type="button"
                    className="MinutesBookmarksModal__open"
                    onClick={() => handleOpen(bookmark)}
                  >
                    <span className="MinutesBookmarksModal__title">
                      {bookmark.conversationTitle}
                    </span>
                    <span className="MinutesBookmarksModal__preview">
                      {bookmark.messagePreview}
                    </span>
                    <span className="MinutesBookmarksModal__meta">
                      {formatWhen(bookmark.messageTimestamp)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="MinutesBookmarksModal__remove"
                    aria-label="Odebrat záložku"
                    onClick={() => handleRemove(bookmark)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AxoDialog.Body>

        <AxoDialog.Footer>
          <AxoDialog.Actions>
            <AxoDialog.Action variant="secondary" onClick={refresh}>
              Obnovit
            </AxoDialog.Action>
            <AxoDialog.Action variant="primary" onClick={() => onOpenChange(false)}>
              Zavřít
            </AxoDialog.Action>
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

export function MinutesBookmarksHost(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (): void => {
      setOpen(true);
    };
    ipcRenderer.on('minutes:open-bookmarks', handler);
    return () => {
      ipcRenderer.removeListener('minutes:open-bookmarks', handler);
    };
  }, []);

  return <MinutesBookmarksModal open={open} onOpenChange={setOpen} />;
}
