'use strict';

const { renderThreadsPage, renderThreadDetailPage } = require('./ssr-threads');
const { renderPastesPage, renderPasteViewPage }     = require('./ssr-pastes');
const { renderPulsePage }                           = require('./ssr-pulse');
const { renderChatPage }                            = require('./ssr-chat');
const { renderPagesPage, renderSubmitPage }         = require('./ssr-pages');
const { renderForumHomePage, renderForumSpacePage, renderForumThreadPage } = require('./ssr-forum');

module.exports = {
    renderThreadsPage,
    renderPastesPage,
    renderPasteViewPage,
    renderPulsePage,
    renderChatPage,
    renderThreadDetailPage,
    renderPagesPage,
    renderSubmitPage,
    renderForumHomePage,
    renderForumSpacePage,
    renderForumThreadPage,
};
