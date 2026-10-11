
/**
 * Leave for another site (deposit, account hub, onboarding). Embedded, that
 * opens a new tab rather than replacing the trader inside VolaTrades' frame -
 * those sites refuse to be framed and would leave the tab blank.
 */
export const openExternalUrl = (url: string): void => {
    if (!url) return;
    if (isEmbedded()) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }
    window.location.href = url;
};
