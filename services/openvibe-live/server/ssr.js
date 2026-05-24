'use strict';

const { renderHomePage }                                                                          = require('./ssr-home');
const { renderChannelPage, renderChannelsPage, renderOfflinePage }                                = require('./ssr-channel');
const { renderStreamPage, renderMediaDetailPage, renderCustomMediaPlayer, renderCollectionPage, renderMissingMediaPage } = require('./ssr-media');
const { renderGoLivePage }                                                                        = require('./ssr-golive');
const { renderUpdatesPage }                                                                       = require('./ssr-updates');
const { escapeHtml }                                                                              = require('./ssr-shared');

module.exports = {
    renderChannelPage,
    renderStreamPage,
    renderMediaDetailPage,
    renderHomePage,
    renderCollectionPage,
    renderChannelsPage,
    renderGoLivePage,
    renderUpdatesPage,
    renderMissingMediaPage,
    renderOfflinePage,
    escapeHtml,
};
