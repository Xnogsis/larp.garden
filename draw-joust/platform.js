// Guest-mode bridge for this export's Yandex SDK calls on a standalone site.
(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const lang = (navigator.language || 'en').split('-')[0];
    const player = {
        getMode: () => 'lite',
        getName: () => 'anonymous',
        getPhoto: () => '',
        getUniqueID: () => 'local',
        getData: async () => {
            try { return JSON.parse(localStorage.getItem('draw-joust-save')) || {}; }
            catch { return {}; }
        },
        setData: async (data) => localStorage.setItem('draw-joust-save', JSON.stringify(data))
    };
    const leaderboards = {
        setLeaderboardScore: async () => {},
        getLeaderboardDescription: async () => ({ default: false, description: {
            invert_sort_order: false, score_format: { options: { decimal_offset: 0 } }, type: 'numeric'
        } }),
        getLeaderboardEntries: async () => ({ entries: [] })
    };
    window.YaGames = { init: async () => ({
        environment: { i18n: { lang, tld: location.hostname }, app: { id: '' }, browser: { lang }, payload: '' },
        deviceInfo: { type: mobile ? 'mobile' : 'desktop', isMobile: () => mobile,
            isDesktop: () => !mobile, isTablet: () => false, isTV: () => false },
        getPlayer: async () => player,
        getLeaderboards: async () => leaderboards,
        getPayments: async () => { throw new Error('Purchases are unavailable on this site.'); },
        auth: { openAuthDialog: async () => { throw new Error('Playing as a local guest.'); } },
        features: { LoadingAPI: { ready() {} } },
        shortcut: { canShowPrompt: async () => ({ canShow: false }), showPrompt: async () => ({ outcome: 'dismissed' }) },
        feedback: { canReview: async () => ({ value: false }), requestReview: async () => ({ feedbackSent: false }) },
        adv: {
            showFullscreenAdv: ({ callbacks }) => callbacks.onClose?.(false),
            showRewardedVideo: ({ callbacks }) => {
                callbacks.onError?.(new Error('Ads are unavailable on this site.'));
                callbacks.onClose?.();
            },
            getBannerAdvStatus: async () => ({ stickyAdvIsShowing: false, reason: 'unavailable' }),
            showBannerAdv() {}, hideBannerAdv() {}
        }
    }) };
})();
