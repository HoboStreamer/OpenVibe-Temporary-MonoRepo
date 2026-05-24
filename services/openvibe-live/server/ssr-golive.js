'use strict';

const {
    GO_LIVE_TRACKS,
    LIVE_NETWORK_URLS,
    escapeHtml,
    renderPage,
} = require('./ssr-shared');

function renderGoLivePage({ baseUrl, session }) {
    const signedIn = !!(session && session.authenticated && session.user && !session.anonymous);
    const viewerName = signedIn
        ? String(session.user.display_name || session.user.username || 'creator').trim()
        : String(session && session.user && (session.user.display_name || session.user.username) || '').trim();
    const signInHref = `/auth/login?return_to=${encodeURIComponent(`${baseUrl}/go-live`)}`;
    const tracksHtml = GO_LIVE_TRACKS.map((track) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(track.label)}</div>
            <h3 class="card-title">${escapeHtml(track.title)}</h3>
            <p class="card-body">${escapeHtml(track.body)}</p>
            <div class="card-kicker">${escapeHtml(track.meta)}</div>
        </article>
    `).join('');
    const managerSection = signedIn
        ? `
        <section class="section-panel" id="stream-manager">
            <div class="sm-top-bar">
                <div>
                    <div class="eyebrow">Stream control</div>
                    <h1 class="section-title" style="font-size:1.5rem">Your stream manager</h1>
                    <p class="section-subtitle">Select a stream slot to configure your profile and go live.</p>
                </div>
            </div>

            <div class="sm-layout" data-stream-manager>
                <!-- LEFT SIDEBAR: stream slot list -->
                <aside class="sm-sidebar">
                    <div class="sm-sidebar-head">
                        <span class="sm-sidebar-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                            My Streams
                        </span>
                        <button class="sm-add-btn" data-sm-action="new-channel" title="Create new stream slot">+</button>
                    </div>
                    <div class="sm-slots" data-sm-slots>
                        <div class="sm-slot-skeleton">Loading…</div>
                    </div>
                    <div class="sm-sidebar-dest-head">Destinations</div>
                    <div class="sm-dest-list" data-sm-dest-list>
                        <div class="sm-slot-skeleton">Loading…</div>
                    </div>
                </aside>

                <!-- RIGHT PANEL -->
                <div class="sm-main">
                    <!-- No slot selected prompt -->
                    <div class="sm-empty-prompt" data-sm-no-slot>
                        <div class="sm-empty-icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                        </div>
                        <h3 class="sm-empty-heading">Go Live</h3>
                        <p class="sm-empty-sub">Select a stream slot to configure your profile and go live.</p>
                    </div>

                    <!-- New channel form -->
                    <div class="sm-new-channel-panel" data-sm-new-channel style="display:none;">
                        <div class="sm-panel-header">
                            <div>
                                <div class="sm-panel-eyebrow">New Stream Slot</div>
                                <h3 class="sm-panel-title">Create channel</h3>
                            </div>
                            <button class="sm-close-btn" data-sm-action="cancel-new-channel" aria-label="Close">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <form class="sm-form" id="sm-new-channel-form">
                            <label class="sm-field-group">
                                <span class="sm-field-label">HANDLE</span>
                                <input class="sm-input" type="text" name="slug" placeholder="your-handle" autocomplete="off" required>
                            </label>
                            <label class="sm-field-group">
                                <span class="sm-field-label">DISPLAY NAME</span>
                                <input class="sm-input" type="text" name="display_name" placeholder="Your channel name" autocomplete="off">
                            </label>
                            <label class="sm-field-group">
                                <span class="sm-field-label">DESCRIPTION</span>
                                <textarea class="sm-input" name="description" rows="2" placeholder="Short channel bio…"></textarea>
                            </label>
                            <label class="sm-checkbox-row">
                                <input type="checkbox" name="nsfw" value="1">
                                <span>NSFW channel</span>
                            </label>
                            <div class="sm-form-actions">
                                <button class="sm-btn-primary" type="submit">Create channel</button>
                                <button class="sm-btn-ghost" type="button" data-sm-action="cancel-new-channel">Cancel</button>
                                <span class="sm-status-text" data-sm-status="new-channel"></span>
                            </div>
                        </form>
                    </div>

                    <!-- Slot editor panel -->
                    <div class="sm-slot-editor" data-sm-slot-editor style="display:none;">
                        <!-- Slot header -->
                        <div class="sm-slot-header">
                            <div class="sm-slot-header-info">
                                <div class="sm-slot-channel-name" data-sm-slot-name>Channel</div>
                                <a class="sm-slot-channel-link" data-sm-slot-link href="#" target="_blank"></a>
                            </div>
                        </div>

                        <!-- Sub-tab bar -->
                        <div class="sm-tabs" data-sm-stab-bar role="tablist">
                            <button class="sm-tab active" role="tab" data-sm-stab="stream"   aria-selected="true">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                Stream
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="settings">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                Settings
                            </button>
                            <button class="sm-tab sm-tab-live" role="tab" data-sm-stab="live" style="display:none;">
                                <span class="sm-live-dot" style="width:7px;height:7px;margin-right:0.3rem;flex-shrink:0;"></span>
                                Live
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="history">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>
                                History
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="restream">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/><path d="M3 5v14"/></svg>
                                Restream
                            </button>
                        </div>

                        <!-- Stream tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="stream">
                            <form class="sm-form" id="sm-stream-form">
                                <label class="sm-field-group">
                                    <span class="sm-field-label">TITLE</span>
                                    <input class="sm-input" type="text" name="title" placeholder="Tonight's stream title" autocomplete="off">
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DESCRIPTION</span>
                                    <textarea class="sm-input" name="description" rows="3" placeholder="What's the stream about?"></textarea>
                                </label>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">CATEGORY</span>
                                    <div class="sm-category-row">
                                        <select class="sm-input sm-select" name="category">
                                            <option value="Desktop">Desktop</option>
                                            <option value="Gaming">Gaming</option>
                                            <option value="Art">Art</option>
                                            <option value="Music">Music</option>
                                            <option value="Talk">Talk</option>
                                            <option value="Science &amp; Tech">Science &amp; Tech</option>
                                            <option value="IRL">IRL</option>
                                            <option value="Coding">Coding</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        <label class="sm-nsfw-toggle">
                                            <input type="checkbox" name="nsfw" value="1" class="sm-nsfw-cb">
                                            <span class="sm-nsfw-dot"></span>
                                            <span class="sm-nsfw-label">NSFW</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">URL SLUG <span class="sm-field-optional">(optional)</span></span>
                                    <div class="sm-slug-row">
                                        <span class="sm-slug-prefix" data-sm-slug-prefix>openvibe.live/@…/</span>
                                        <input class="sm-input sm-slug-input" type="text" name="url_slug" placeholder="e.g. tuesday-session">
                                    </div>
                                </div>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">STREAMING METHOD</span>
                                    <div class="sm-method-grid">
                                        <button type="button" class="sm-method-card" data-method="browser">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                            </div>
                                            <div class="sm-method-name">Browser</div>
                                            <div class="sm-method-sub">Camera, mic, or screen from your browser</div>
                                        </button>
                                        <button type="button" class="sm-method-card active" data-method="whip">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                                            </div>
                                            <div class="sm-method-name">WHIP</div>
                                            <div class="sm-method-sub">OBS WHIP encoder / external WebRTC</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-method="rtmp">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                                            </div>
                                            <div class="sm-method-name">RTMP</div>
                                            <div class="sm-method-sub">OBS / Streamlabs / IRL Pro</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-method="cli">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                                            </div>
                                            <div class="sm-method-name">CLI / FFmpeg</div>
                                            <div class="sm-method-sub">FFmpeg, Pi, RTSP cameras</div>
                                        </button>
                                    </div>
                                    <input type="hidden" name="protocol" value="whip">
                                </div>
                                <!-- Inline endpoint details (shown for WHIP/RTMP/CLI methods) -->
                                <div id="sm-inline-endpoint" data-sm-inline-endpoint style="display:none;margin-top:0.75rem;padding:0.75rem;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(255,255,255,0.07);"></div>

                                <div class="sm-autodetect-box" data-sm-autodetect>
                                    <span class="sm-autodetect-dot"></span>
                                    <div>
                                        <div class="sm-autodetect-title">Auto-detect enabled</div>
                                        <div class="sm-autodetect-sub">Your stream will go live automatically when your encoder connects. Use the ingest details above in your streaming software, then just start streaming.</div>
                                    </div>
                                </div>

                                <!-- Inline browser broadcast (shown only when Browser method selected) -->
                                <div id="sm-inline-broadcast" style="display:none;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,0.08);">
                                    <div class="sm-broadcast-setup" id="sm-bcast-setup">
                                        <div class="sm-bcast-preview-wrap">
                                            <video id="sm-bcast-preview" class="sm-bcast-preview" autoplay muted playsinline></video>
                                            <div class="sm-bcast-preview-overlay" id="sm-bcast-pip-overlay" style="display:none;">
                                                <video id="sm-bcast-pip" class="sm-bcast-pip-video" autoplay muted playsinline></video>
                                            </div>
                                            <div class="sm-bcast-preview-label" id="sm-bcast-live-badge" style="display:none;">
                                                <span class="sm-live-dot"></span> LIVE
                                            </div>
                                        </div>
                                        <div class="sm-bcast-controls">
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">SOURCE</span>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn active" id="sm-bcast-camera-btn" data-source="camera">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                                        Camera
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn" id="sm-bcast-screen-btn" data-source="screen">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                                        Screen
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn" id="sm-bcast-screen-pip-btn" data-source="screen+camera">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="14" y="11" width="7" height="5" rx="1" fill="currentColor" opacity="0.7"/></svg>
                                                        Screen + Cam
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="sm-field-group" id="sm-bcast-video-group">
                                                <span class="sm-field-label">CAMERA</span>
                                                <select class="sm-input sm-select" id="sm-bcast-video-select">
                                                    <option value="">Default camera</option>
                                                </select>
                                            </div>
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">MICROPHONE</span>
                                                <select class="sm-input sm-select" id="sm-bcast-audio-select">
                                                    <option value="">Default microphone</option>
                                                </select>
                                            </div>
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">QUALITY</span>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                                                    <select class="sm-input sm-select" id="sm-bcast-res" style="flex:1;min-width:110px;">
                                                        <option value="1280x720">720p</option>
                                                        <option value="1920x1080">1080p</option>
                                                        <option value="854x480">480p</option>
                                                        <option value="640x360">360p</option>
                                                    </select>
                                                    <select class="sm-input sm-select" id="sm-bcast-fps" style="width:70px;">
                                                        <option value="30">30fps</option>
                                                        <option value="60">60fps</option>
                                                        <option value="24">24fps</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div id="sm-bcast-idle-controls">
                                                <button class="sm-btn-primary sm-btn-block" type="button" id="sm-bcast-start-btn">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right:0.35rem;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                                    Start Broadcast
                                                </button>
                                                <p class="sm-note" style="margin-top:0.5rem;" id="sm-bcast-prereq-note">Create a stream below first, then start broadcasting.</p>
                                            </div>
                                            <div id="sm-bcast-live-controls" style="display:none;">
                                                <div class="sm-bcast-live-status">
                                                    <span class="sm-live-dot"></span>
                                                    <span id="sm-bcast-timer">00:00</span>
                                                    <span class="sm-bcast-viewers" id="sm-bcast-viewers">0 viewers</span>
                                                </div>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
                                                    <button type="button" class="sm-btn-ghost" id="sm-bcast-mute-video-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                                        Cam On
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost" id="sm-bcast-mute-audio-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                                                        Mic On
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-icon-btn-danger" id="sm-bcast-end-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                                        End Broadcast
                                                    </button>
                                                </div>
                                                <span class="sm-status-text" id="sm-bcast-live-status" style="margin-top:0.4rem;display:block;"></span>
                                            </div>
                                            <span class="sm-status-text" id="sm-bcast-status"></span>
                                        </div>
                                    </div>
                                </div>

                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit" id="sm-create-stream-btn">Create stream</button>
                                    <button class="sm-btn-live" type="button" id="sm-go-live-btn" style="display:none;">
                                        <span class="sm-live-dot"></span> Go Live
                                    </button>
                                    <button class="sm-btn-ghost" type="button" id="sm-end-stream-btn" style="display:none;">End stream</button>
                                    <span class="sm-status-text" data-sm-status="stream-form"></span>
                                </div>
                            </form>

                        </div>

                        <!-- Settings tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="settings" style="display:none;">
                            <form class="sm-form" id="sm-settings-form">
                                <input type="hidden" name="slug">
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DISPLAY NAME</span>
                                    <input class="sm-input" type="text" name="display_name" autocomplete="off">
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DESCRIPTION</span>
                                    <textarea class="sm-input" name="description" rows="2"></textarea>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">VISIBILITY</span>
                                    <select class="sm-input sm-select" name="visibility">
                                        <option value="public">Public</option>
                                        <option value="unlisted">Unlisted</option>
                                        <option value="private">Private</option>
                                    </select>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="recording_enabled" value="1" checked>
                                    <span>Enable VOD recording</span>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="chat_enabled" value="1" checked>
                                    <span>Enable chat</span>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="nsfw" value="1">
                                    <span>NSFW channel</span>
                                </label>
                                <div class="sm-field-group" style="margin-top:0.9rem;">
                                    <span class="sm-field-label">PREFERRED STREAMING METHOD</span>
                                    <div class="sm-method-grid" id="sm-settings-method-grid">
                                        <button type="button" class="sm-method-card" data-settings-method="browser">
                                            <div class="sm-method-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
                                            <div class="sm-method-name">Browser</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-settings-method="whip">
                                            <div class="sm-method-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg></div>
                                            <div class="sm-method-name">WHIP / OBS</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-settings-method="rtmp">
                                            <div class="sm-method-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg></div>
                                            <div class="sm-method-name">RTMP</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-settings-method="cli">
                                            <div class="sm-method-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg></div>
                                            <div class="sm-method-name">CLI / FFmpeg</div>
                                        </button>
                                    </div>
                                    <input type="hidden" name="preferred_protocol" value="whip">
                                </div>
                                <div class="sm-settings-key-section">
                                    <div class="sm-field-label" style="margin-bottom:0.4rem;">STREAM KEY</div>
                                    <div class="sm-key-row">
                                        <input class="sm-input sm-key-input" type="password" name="stream_key_display" readonly placeholder="••••••••••••">
                                        <button type="button" class="sm-icon-btn" data-sm-action="toggle-key-visibility" title="Show/hide key">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        </button>
                                        <button type="button" class="sm-icon-btn" data-sm-action="copy-stream-key" title="Copy key">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        </button>
                                        <button type="button" class="sm-icon-btn sm-icon-btn-danger" data-sm-action="regenerate-key" title="Regenerate">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit">Save changes</button>
                                    <span class="sm-status-text" data-sm-status="settings-form"></span>
                                </div>
                            </form>
                        </div>

                        <!-- Live tab -->
                        <div class="sm-stab-content sm-live-tab-content" data-sm-stab-panel="live" style="display:none;">
                            <div class="sm-live-layout">
                                <div class="sm-live-preview">
                                    <div class="sm-live-preview-inner" id="sm-live-preview-inner">
                                        <!-- iframe injected by JS -->
                                    </div>
                                    <div class="sm-live-preview-bar">
                                        <span class="sm-live-dot"></span>
                                        <span id="sm-live-timer-display">00:00</span>
                                        <span id="sm-live-viewers-display" style="margin-left:0.5rem;opacity:0.7;font-size:0.8rem;">0 viewers</span>
                                        <div style="margin-left:auto;display:flex;gap:0.5rem;">
                                            <button class="sm-btn-ghost" type="button" id="sm-live-end-btn" style="padding:0.3rem 0.75rem;font-size:0.8rem;">End stream</button>
                                            <a class="sm-btn-ghost" id="sm-live-watch-link" href="#" target="_blank" style="padding:0.3rem 0.75rem;font-size:0.8rem;text-decoration:none;">Watch page ↗</a>
                                        </div>
                                    </div>
                                </div>
                                <div class="sm-live-chat">
                                    <div class="sm-live-chat-head">
                                        <span class="sm-field-label" style="margin:0;">LIVE CHAT</span>
                                        <a id="sm-live-chat-popout" href="#" target="_blank" style="font-size:0.78rem;opacity:0.6;text-decoration:none;">Popout ↗</a>
                                    </div>
                                    <div id="sm-chat-messages" style="flex:1;overflow-y:auto;padding:0.6rem;display:flex;flex-direction:column;gap:0.35rem;font-size:0.82rem;">
                                        <div class="sm-note" style="opacity:0.5;text-align:center;margin:auto;">Chat will appear here.</div>
                                    </div>
                                    <form id="sm-chat-send-form" style="display:flex;gap:0.5rem;padding:0.5rem;">
                                        <input class="sm-input" type="text" id="sm-chat-input" placeholder="Send a message…" autocomplete="off" style="flex:1;font-size:0.83rem;">
                                        <button class="sm-btn-primary" type="submit" style="padding:0.4rem 0.8rem;font-size:0.83rem;">Send</button>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <!-- History tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="history" style="display:none;">
                            <div data-sm-history-panel>
                                <p class="sm-note">Loading recent streams…</p>
                            </div>
                        </div>

                        <!-- Restream tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="restream" style="display:none;">
                            <div class="sm-dest-list-full" data-sm-dest-list-full>
                                <p class="sm-note">Loading destinations…</p>
                            </div>
                            <div class="sm-panel-header" style="margin-top:1.5rem;">
                                <h4 class="sm-panel-title" style="font-size:0.95rem;">Add destination</h4>
                            </div>
                            <div class="sm-dest-presets">
                                <span class="sm-field-label" style="display:block;margin-bottom:0.5rem;">QUICK ADD</span>
                                <div class="sm-dest-preset-row">
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="kick" data-preset-label="Kick" data-preset-url="rtmp://fa723fc1b171.global-contribute.live-video.net/app/" data-preset-key-hint="Get your stream key at kick.com → Dashboard → Stream Settings">Kick</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="twitch" data-preset-label="Twitch" data-preset-url="rtmp://live.twitch.tv/app/" data-preset-key-hint="Get your stream key at twitch.tv/dashboard → Settings → Stream">Twitch</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="youtube" data-preset-label="YouTube" data-preset-url="rtmp://a.rtmp.youtube.com/live2" data-preset-key-hint="Get your stream key at studio.youtube.com → Go Live → Stream tab → Copy stream key">YouTube</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="custom" data-preset-label="RobotStreamer" data-preset-url="rtmp://stream.robotstreamer.com/live" data-preset-key-hint="Use your RobotStreamer channel ID as the stream key">RobotStreamer</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="custom" data-preset-label="" data-preset-url="" data-preset-key-hint="">Custom RTMP</button>
                                </div>
                            </div>
                            <form class="sm-form" id="sm-dest-form" style="margin-top:0.75rem;">
                                <div class="sm-field-group">
                                    <span class="sm-field-label">KIND</span>
                                    <select class="sm-input sm-select" name="kind">
                                        <option value="custom">Custom RTMP</option>
                                        <option value="youtube">YouTube</option>
                                        <option value="twitch">Twitch</option>
                                        <option value="kick">Kick</option>
                                        <option value="facebook">Facebook</option>
                                        <option value="robotstreamer">RobotStreamer</option>
                                    </select>
                                </div>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">LABEL</span>
                                    <input class="sm-input" type="text" name="label" placeholder="Main multistream target" autocomplete="off" required>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">TARGET URL</span>
                                    <input class="sm-input" type="url" name="target_url" placeholder="rtmp://example.com/live" autocomplete="off" required>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">STREAM KEY</span>
                                    <input class="sm-input" type="text" name="target_key" placeholder="Destination stream key" autocomplete="off">
                                    <div class="sm-note" id="sm-dest-key-hint" style="display:none;margin-top:0.35rem;"></div>
                                </label>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">OUTPUT QUALITY <span class="sm-field-optional">(optional)</span></span>
                                    <div style="display:flex;gap:0.5rem;">
                                        <select class="sm-input sm-select" name="dest_resolution" style="flex:1;">
                                            <option value="">Default resolution</option>
                                            <option value="1080p">1080p</option>
                                            <option value="720p">720p</option>
                                            <option value="480p">480p</option>
                                            <option value="360p">360p</option>
                                        </select>
                                        <select class="sm-input sm-select" name="dest_bitrate" style="flex:1;">
                                            <option value="">Default bitrate</option>
                                            <option value="6000">6000 kbps</option>
                                            <option value="4000">4000 kbps</option>
                                            <option value="2500">2500 kbps</option>
                                            <option value="1500">1500 kbps</option>
                                            <option value="800">800 kbps</option>
                                        </select>
                                    </div>
                                </div>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="enabled" value="1" checked>
                                    <span>Enabled</span>
                                </label>
                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit">Save destination</button>
                                    <span class="sm-status-text" data-sm-status="dest-form"></span>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </section>`
        : `
        <section class="section-panel" id="stream-manager">
            <div class="golive-hero">
                <h1 class="section-title" style="margin-bottom:0.5rem;">Go live</h1>
                <p class="section-subtitle" style="margin-bottom:2rem;">Three ways to stream. Pick what fits your setup.</p>
                <div class="golive-method-grid">
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        </div>
                        <div class="golive-method-name">Browser</div>
                        <div class="golive-method-sub">Camera, mic, or screen — no software needed</div>
                    </div>
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                        </div>
                        <div class="golive-method-name">OBS / WHIP</div>
                        <div class="golive-method-sub">Connect OBS via WHIP encoder — low latency, full control</div>
                    </div>
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                        </div>
                        <div class="golive-method-name">RTMP</div>
                        <div class="golive-method-sub">Streamlabs, IRL Pro, FFmpeg, or any RTMP encoder</div>
                    </div>
                </div>
                <div class="golive-cta-row">
                    <a class="golive-cta-btn golive-cta-primary" href="${escapeHtml(signInHref)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        Sign in to get started
                    </a>
                    <a class="golive-cta-btn golive-cta-ghost" href="${escapeHtml(LIVE_NETWORK_URLS.restream)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                        Stream on openre.stream
                    </a>
                </div>
                <p class="golive-restream-note">Need to stream to Twitch, YouTube, and Kick simultaneously? <a href="${escapeHtml(LIVE_NETWORK_URLS.restream)}">openre.stream</a> handles multi-destination restreaming — no account required.</p>
            </div>
        </section>`;
    const pageContent = `
        ${managerSection}

    `;
    return renderPage({
        title: 'Go live — openvibe.live',
        description: 'OpenVibe Live broadcasting guide for browser, OBS, RTMP, WHIP, and restream workflows.',
        canonical: `${baseUrl}/go-live`,
        activeNav: 'go-live',
        bodyHtml: pageContent + (signedIn ? '<script src="/js/stream-manager.js?v=20260524-3"></script>' : ''),
        baseUrl,
        extraStyles: `
            /* ── Stream Manager v2 ──────────────────────────────── */
            .sm-top-bar {
                display: flex; justify-content: space-between; align-items: flex-start;
                gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;
            }
            .sm-top-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 0.4rem; }
            .sm-layout {
                display: grid;
                grid-template-columns: 260px 1fr;
                gap: 0;
                min-height: 580px;
                border-radius: 20px;
                border: 1px solid rgba(255,255,255,0.09);
                background: rgba(7,13,28,0.72);
                overflow: hidden;
            }
            /* sidebar */
            .sm-sidebar {
                border-right: 1px solid rgba(255,255,255,0.08);
                display: flex; flex-direction: column;
                background: rgba(5,9,22,0.6);
            }
            .sm-sidebar-head {
                display: flex; align-items: center; justify-content: space-between;
                padding: 0.85rem 1rem 0.65rem;
                border-bottom: 1px solid rgba(255,255,255,0.07);
                font-size: 0.78rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-sidebar-label { display: flex; align-items: center; gap: 0.4rem; }
            .sm-add-btn {
                width: 24px; height: 24px; border-radius: 7px;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: white; font-size: 1rem; line-height: 1;
                cursor: pointer; display: grid; place-items: center;
                transition: background 0.15s, border-color 0.15s;
            }
            .sm-add-btn:hover { background: rgba(34,211,238,0.15); border-color: rgba(34,211,238,0.4); }
            .sm-slots { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
            .sm-slot-skeleton { padding: 0.9rem 1rem; color: var(--muted); font-size: 0.82rem; }
            .sm-slot-item {
                display: flex; align-items: center; gap: 0.6rem;
                padding: 0.65rem 1rem; cursor: pointer;
                border-left: 2px solid transparent;
                transition: background 0.12s, border-color 0.12s;
                position: relative;
            }
            .sm-slot-item:hover { background: rgba(255,255,255,0.04); }
            .sm-slot-item.active {
                background: rgba(34,211,238,0.07);
                border-left-color: var(--accent);
            }
            .sm-slot-dot {
                width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
                background: rgba(255,255,255,0.2);
                transition: background 0.2s;
            }
            .sm-slot-dot.live { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
            .sm-slot-info { flex: 1; min-width: 0; }
            .sm-slot-title { font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .sm-slot-meta { font-size: 0.73rem; color: var(--muted); display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
            .sm-slot-proto {
                display: inline-flex; align-items: center;
                padding: 0.1rem 0.4rem; border-radius: 4px;
                background: rgba(255,255,255,0.07); font-size: 0.67rem; font-weight: 800;
                text-transform: uppercase; letter-spacing: 0.06em;
            }
            .sm-slot-proto.whip  { color: #22d3ee; }
            .sm-slot-proto.rtmp  { color: #f97316; }
            .sm-slot-proto.browser { color: #a78bfa; }
            .sm-slot-proto.cli   { color: #94a3b8; }
            .sm-sidebar-dest-head {
                padding: 0.6rem 1rem 0.4rem;
                border-top: 1px solid rgba(255,255,255,0.07);
                font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-dest-list { overflow-y: auto; max-height: 120px; padding-bottom: 0.5rem; }
            .sm-dest-item {
                display: flex; align-items: center; gap: 0.5rem;
                padding: 0.5rem 1rem; cursor: pointer; font-size: 0.82rem;
                transition: background 0.12s;
            }
            .sm-dest-item:hover { background: rgba(255,255,255,0.04); }
            .sm-dest-item.active { background: rgba(139,92,246,0.1); }
            .sm-dest-kind-badge {
                font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
                padding: 0.1rem 0.35rem; border-radius: 4px;
                background: rgba(139,92,246,0.18); color: #a78bfa;
            }
            /* right main panel */
            .sm-main {
                display: flex; flex-direction: column;
                min-width: 0; position: relative;
            }
            .sm-empty-prompt {
                flex: 1; display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 0.8rem; padding: 3rem 2rem; text-align: center; color: var(--muted);
            }
            .sm-empty-icon { color: rgba(34,211,238,0.4); }
            .sm-empty-heading { margin: 0; font-size: 1.3rem; color: var(--text); }
            .sm-empty-sub { margin: 0; font-size: 0.9rem; }
            /* slot editor */
            .sm-slot-editor,
            .sm-new-channel-panel,
            .sm-dest-panel { padding: 1.2rem 1.4rem; flex: 1; display: flex; flex-direction: column; gap: 0; overflow-y: auto; }
            .sm-panel-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
            .sm-panel-eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; color: var(--accent); margin-bottom: 0.25rem; }
            .sm-panel-title { margin: 0; font-size: 1.1rem; font-weight: 800; }
            .sm-close-btn {
                width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.05); color: var(--muted);
                cursor: pointer; display: grid; place-items: center;
                transition: background 0.15s, color 0.15s;
            }
            .sm-close-btn:hover { background: rgba(255,255,255,0.1); color: white; }
            .sm-slot-header {
                display: flex; justify-content: space-between; align-items: flex-start;
                margin-bottom: 1rem; gap: 0.8rem;
            }
            .sm-slot-channel-name { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.2rem; }
            .sm-slot-channel-link { font-size: 0.8rem; color: var(--muted); font-family: ui-monospace, Consolas, monospace; transition: color 0.15s; }
            .sm-slot-channel-link:hover { color: var(--accent); }
            .sm-chat-btn {
                display: inline-flex; align-items: center; gap: 0.35rem;
                padding: 0.45rem 0.85rem; border-radius: 999px;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.05);
                font-size: 0.82rem; font-weight: 700; color: var(--muted-strong);
                white-space: nowrap; transition: border-color 0.15s, background 0.15s, color 0.15s;
            }
            .sm-chat-btn:hover { border-color: rgba(34,211,238,0.4); background: rgba(34,211,238,0.08); color: white; }
            /* live tab layout */
            .sm-live-tab-content { padding: 0 !important; }
            .sm-live-layout {
                display: grid;
                grid-template-columns: 1fr 300px;
                height: 520px;
                overflow: hidden;
            }
            .sm-live-preview {
                display: flex; flex-direction: column;
                border-right: 1px solid rgba(255,255,255,0.08);
                background: #000;
                overflow: hidden;
            }
            .sm-live-preview-inner {
                flex: 1; overflow: hidden; position: relative;
            }
            .sm-live-preview-inner iframe {
                width: 100%; height: 100%; border: none; display: block;
            }
            .sm-live-preview-bar {
                display: flex; align-items: center; gap: 0.5rem;
                padding: 0.5rem 0.75rem;
                background: rgba(0,0,0,0.6);
                border-top: 1px solid rgba(255,255,255,0.07);
                font-size: 0.8rem; font-weight: 700;
            }
            .sm-live-chat {
                display: flex; flex-direction: column;
                overflow: hidden;
            }
            .sm-live-chat-head {
                display: flex; justify-content: space-between; align-items: center;
                padding: 0.6rem 0.75rem;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                font-size: 0.78rem;
            }
            @media (max-width: 700px) {
                .sm-live-layout { grid-template-columns: 1fr; grid-template-rows: 260px 1fr; height: auto; }
                .sm-live-preview { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); }
            }
            /* tabs */
            .sm-tabs {
                display: flex; gap: 0; margin-bottom: 1.2rem;
                border-bottom: 1px solid rgba(255,255,255,0.08);
            }
            .sm-tab {
                display: inline-flex; align-items: center; gap: 0.35rem;
                padding: 0.65rem 1rem; font-size: 0.84rem; font-weight: 700;
                color: var(--muted); border: none; background: none; cursor: pointer;
                border-bottom: 2px solid transparent; margin-bottom: -1px;
                transition: color 0.15s, border-color 0.15s;
            }
            .sm-tab:hover { color: var(--muted-strong); }
            .sm-tab.active { color: var(--text); border-bottom-color: var(--accent); }
            .sm-tab svg { opacity: 0.7; }
            .sm-tab.active svg { opacity: 1; }
            /* form elements */
            .sm-form { display: flex; flex-direction: column; gap: 0.9rem; }
            .sm-field-group { display: flex; flex-direction: column; gap: 0.35rem; }
            .sm-field-label {
                font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-field-optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 0.72rem; }
            .sm-input {
                width: 100%; padding: 0.7rem 0.85rem;
                border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.05); color: white;
                font-size: 0.9rem; font-family: inherit;
                transition: border-color 0.15s, background 0.15s;
            }
            .sm-input:focus { outline: none; border-color: rgba(34,211,238,0.5); background: rgba(34,211,238,0.04); }
            .sm-input::placeholder { color: rgba(148,163,184,0.5); }
            .sm-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.2rem; }
            .sm-checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
            .sm-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
            .sm-category-row { display: flex; gap: 0.6rem; align-items: center; }
            .sm-category-row .sm-input { flex: 1; }
            .sm-nsfw-toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; white-space: nowrap; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
            .sm-nsfw-cb { accent-color: #f97316; width: 14px; height: 14px; }
            .sm-nsfw-dot { width: 8px; height: 8px; border-radius: 50%; background: #f97316; opacity: 0.5; transition: opacity 0.15s; }
            .sm-nsfw-cb:checked ~ .sm-nsfw-dot { opacity: 1; }
            .sm-slug-row { display: flex; align-items: center; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.05); }
            .sm-slug-prefix { padding: 0.7rem 0.5rem 0.7rem 0.85rem; font-size: 0.82rem; color: var(--muted); white-space: nowrap; font-family: ui-monospace, Consolas, monospace; }
            .sm-slug-input { border: none; border-radius: 0; background: transparent; flex: 1; padding-left: 0; min-width: 0; }
            .sm-slug-input:focus { border: none; background: transparent; }
            /* streaming method cards */
            .sm-method-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.25rem; }
            .sm-method-card {
                display: flex; flex-direction: column; align-items: flex-start;
                padding: 0.75rem 0.8rem; border-radius: 12px; cursor: pointer;
                border: 1.5px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.03);
                text-align: left; transition: border-color 0.15s, background 0.15s;
            }
            .sm-method-card:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); }
            .sm-method-card.active { border-color: rgba(251,191,36,0.7); background: rgba(251,191,36,0.08); }
            .sm-method-icon { color: var(--muted-strong); margin-bottom: 0.4rem; }
            .sm-method-card.active .sm-method-icon { color: #fbbf24; }
            .sm-method-name { font-size: 0.88rem; font-weight: 800; color: var(--text); }
            .sm-method-sub { font-size: 0.72rem; color: var(--muted); margin-top: 0.2rem; line-height: 1.35; }
            /* autodetect */
            .sm-autodetect-box {
                display: flex; align-items: flex-start; gap: 0.65rem;
                padding: 0.8rem 0.95rem; border-radius: 10px;
                border: 1px solid rgba(34,211,238,0.2);
                background: rgba(34,211,238,0.05);
            }
            .sm-autodetect-dot {
                width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 0.45rem;
                background: var(--accent);
                animation: sm-pulse 2s ease-in-out infinite;
            }
            @keyframes sm-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.45; transform:scale(0.7); } }
            .sm-autodetect-title { font-size: 0.85rem; font-weight: 700; color: var(--accent); }
            .sm-autodetect-sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; line-height: 1.4; }
            /* action buttons */
            .sm-form-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 0.4rem; }
            .sm-btn-primary {
                display: inline-flex; align-items: center; gap: 0.4rem;
                padding: 0.6rem 1.2rem; border-radius: 999px; font-weight: 700; font-size: 0.88rem;
                background: linear-gradient(135deg, rgba(139,92,246,0.9), rgba(34,211,238,0.75));
                border: none; color: white; cursor: pointer; transition: opacity 0.15s, transform 0.15s;
            }
            .sm-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
            .sm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
            .sm-btn-live {
                display: inline-flex; align-items: center; gap: 0.5rem;
                padding: 0.6rem 1.2rem; border-radius: 999px; font-weight: 800; font-size: 0.88rem;
                background: linear-gradient(135deg, #dc2626, #f97316);
                border: none; color: white; cursor: pointer;
                box-shadow: 0 0 18px rgba(220,38,38,0.4);
                transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
            }
            .sm-btn-live:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 0 28px rgba(220,38,38,0.6); }
            .sm-live-dot { width: 8px; height: 8px; border-radius: 50%; background: white; animation: sm-pulse 1.2s ease-in-out infinite; }
            .sm-btn-ghost {
                display: inline-flex; align-items: center; gap: 0.4rem;
                padding: 0.58rem 1rem; border-radius: 999px; font-weight: 700; font-size: 0.88rem;
                border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);
                color: var(--muted-strong); cursor: pointer; transition: border-color 0.15s, color 0.15s;
            }
            .sm-btn-ghost:hover { border-color: rgba(255,255,255,0.28); color: white; }
            .sm-status-text { font-size: 0.82rem; color: var(--muted); }
            .sm-status-text.ok { color: #4ade80; }
            .sm-status-text.err { color: #f87171; }
            .sm-note { color: var(--muted); font-size: 0.88rem; margin: 0; }
            /* key row */
            .sm-settings-key-section { margin-top: 0.25rem; }
            .sm-key-row { display: flex; align-items: center; gap: 0.4rem; }
            .sm-key-input { flex: 1; font-family: ui-monospace, Consolas, monospace; font-size: 0.82rem; }
            .sm-icon-btn {
                width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
                color: var(--muted); cursor: pointer; display: grid; place-items: center;
                transition: border-color 0.15s, color 0.15s, background 0.15s;
            }
            .sm-icon-btn:hover { border-color: rgba(255,255,255,0.25); color: white; background: rgba(255,255,255,0.08); }
            .sm-icon-btn-danger:hover { border-color: rgba(248,113,113,0.5); color: #f87171; background: rgba(248,113,113,0.08); }
            /* endpoint panel */
            .sm-endpoint-panel { display: flex; flex-direction: column; gap: 0.75rem; }
            .sm-endpoint-row {
                display: flex; flex-direction: column; gap: 0.3rem;
            }
            .sm-endpoint-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; color: var(--muted); }
            .sm-endpoint-value-row {
                display: flex; align-items: center; gap: 0.4rem;
            }
            .sm-endpoint-code {
                flex: 1; padding: 0.65rem 0.85rem; border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.09);
                background: rgba(0,0,0,0.3); font-size: 0.8rem;
                font-family: ui-monospace, Consolas, monospace; color: #e2e8f0;
                word-break: break-all; min-width: 0;
            }
            /* cli sections */
            .sm-cli-section { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid rgba(255,255,255,0.07); }
            .sm-cli-section:first-child { margin-top: 0; border-top: none; }
            .sm-cli-section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; color: #fbbf24; margin-bottom: 0.65rem; }
            .sm-cli-cmd-label { font-size: 0.78rem; font-weight: 700; color: rgba(255,255,255,0.5); margin: 0.75rem 0 0.3rem; }
            .sm-cli-pre { background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.65rem 2.5rem 0.65rem 0.85rem; font-family: ui-monospace, Consolas, monospace; font-size: 0.76rem; line-height: 1.55; white-space: pre-wrap; word-break: break-all; color: #e2e8f0; margin: 0; }
            .sm-cli-pre-wrap { position: relative; margin-bottom: 0; }
            .sm-cli-copy-btn { position: absolute !important; top: 0.35rem; right: 0.35rem; width: 26px !important; height: 26px !important; }
            /* history items */
            .sm-history-item {
                display: flex; justify-content: space-between; align-items: center;
                gap: 0.5rem; padding: 0.7rem 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .sm-history-item:last-child { border-bottom: none; }
            .sm-history-title { font-size: 0.9rem; font-weight: 600; }
            .sm-history-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.1rem; }
            /* dest list */
            .sm-dest-full-item {
                display: flex; justify-content: space-between; align-items: center;
                gap: 0.5rem; padding: 0.65rem 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .sm-dest-full-item:last-child { border-bottom: none; }
            /* stab content spacing */
            .sm-stab-content { flex: 1; }
            /* broadcast panel */
            .sm-broadcast-setup { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
            .sm-bcast-preview-wrap {
                position: relative; border-radius: 12px; overflow: hidden;
                background: #0a0a0a; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;
            }
            .sm-bcast-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
            .sm-bcast-preview-overlay { position: absolute; bottom: 8px; right: 8px; width: 28%; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; border: 2px solid rgba(255,255,255,0.25); }
            .sm-bcast-pip-video { width: 100%; height: 100%; object-fit: cover; }
            .sm-bcast-preview-label { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.7rem; border-radius: 999px; background: rgba(220,38,38,0.85); font-size: 0.72rem; font-weight: 800; color: white; letter-spacing: 0.08em; }
            .sm-bcast-controls { display: flex; flex-direction: column; gap: 0.75rem; }
            .sm-bcast-source-btn { padding: 0.4rem 0.8rem !important; font-size: 0.8rem !important; }
            .sm-bcast-source-btn.active { border-color: var(--accent) !important; color: var(--accent) !important; }
            .sm-btn-block { width: 100%; justify-content: center; }
            .sm-bcast-live-status { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.85rem; border-radius: 10px; background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.3); }
            .sm-bcast-viewers { font-size: 0.82rem; color: var(--muted); margin-left: auto; }
            #sm-bcast-timer { font-size: 0.9rem; font-weight: 800; font-family: ui-monospace, monospace; color: #f87171; }
            /* responsive */
            @media (max-width: 740px) {
                .sm-layout { grid-template-columns: 1fr; }
                .sm-sidebar { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); max-height: 220px; }
                .sm-method-grid { grid-template-columns: repeat(2, 1fr); }
                .sm-broadcast-setup { grid-template-columns: 1fr; }
            }
        `,
    });
}

module.exports = { renderGoLivePage };
