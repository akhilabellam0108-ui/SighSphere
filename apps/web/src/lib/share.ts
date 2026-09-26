/**
 * Clipboard + Web Share helpers. Both APIs fail in ordinary ways (no permission, insecure
 * context, user cancelled), so callers get an outcome to announce, never an exception.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Native share sheet where available (mostly phones); otherwise copy to clipboard. */
export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function shareMessage(outcome: ShareOutcome): string | null {
  switch (outcome) {
    case 'shared':
      return null;
    case 'copied':
      return 'Copied to clipboard.';
    case 'cancelled':
      return null;
    case 'failed':
      return 'Could not share or copy on this device.';
  }
}
