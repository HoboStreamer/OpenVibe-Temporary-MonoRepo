'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
        id: 'host',
        host: 'openvibe.host',
        origin: config.surfaces.host,
        label: 'openvibe.host',
        title: 'OpenVibe Host — Web Hosting Guides & Reviews',
        description: 'Honest web hosting comparisons, setup guides, and reviews. No affiliate bias. Just the facts.',
        kind: 'WebSite',
        implemented: true,
        indexable: false,
        readiness: 'yellow',
        deferReason: 'Host content is pre-launch pending editorial review.',
        heroTitle: 'Web Hosting, Without the Bias',
        heroText: 'Honest reviews, real benchmarks, and plain-language setup guides for developers, streamers, and hobbyists who just need a reliable place to run their code.',
        entries: [
            {
                path: '/guides/vps-setup',
                title: 'VPS Setup Guide for Streamers',
                summary: 'Step-by-step guide to setting up a VPS for self-hosted live streaming. Covers nginx, SSL, and RTMP ingest.',
                publishedAt: '2026-05-01T10:00:00.000Z',
                kind: 'Article',
                sections: [
                    'A VPS (Virtual Private Server) gives you full root access to a Linux machine for $5–20/month. This guide uses Ubuntu 24.04 with nginx for RTMP ingest and Let\'s Encrypt for SSL.',
                    'Step 1: Choose a provider. BinaryLane, Hetzner, and DigitalOcean all offer competitive VPS plans. For streaming, pick a provider close to your audience geographically.',
                    'Step 2: Install nginx with RTMP module. On Ubuntu: `sudo apt install nginx-extras`. Edit `/etc/nginx/nginx.conf` to add the rtmp block on port 1935.',
                    'Step 3: Configure SSL with certbot. Run `certbot --nginx -d yourstream.example.com`. Let\'s Encrypt provides free 90-day certs that auto-renew.',
                    'Step 4: Point your streaming software to `rtmp://your-vps-ip/live`. Use a stream key as the app argument. JSMPEG can relay the stream to a browser WebSocket endpoint.',
                    'Step 5: Set up systemd to keep nginx running. `sudo systemctl enable nginx` ensures the service starts on reboot and restarts if it crashes.',
                ],
            },
            {
                path: '/guides/shared-vs-vps',
                title: 'Shared Hosting vs VPS: What Hobbyists Actually Need',
                summary: 'A plain-language comparison of shared hosting and VPS. When to upgrade, what to avoid, and which providers are honest.',
                publishedAt: '2026-05-02T10:00:00.000Z',
                kind: 'Article',
                sections: [
                    'Shared hosting puts thousands of websites on one machine. It\'s cheap ($2–10/month) and managed, but you share CPU/RAM/bandwidth with everyone else. Good for WordPress blogs and landing pages.',
                    'VPS gives you dedicated CPU cores and RAM. It\'s $5–30/month unmanaged. You\'re responsible for security updates, backups, and configuration. Great for Node.js apps, streaming, and APIs.',
                    'When to upgrade from shared to VPS: your site gets slowdowns during traffic spikes; you need Node.js/Python/Ruby runtimes; you want to run a WebSocket server; you need root access.',
                    'Providers worth using: Hetzner (EU, excellent price/perf), BinaryLane (AU, consistent), Vultr (global, good network), DigitalOcean (beginner-friendly docs). Avoid: GoDaddy, Bluehost, HostGator (upsell-heavy, slow support).',
                    'Self-hosting on a home IP: works for development and personal projects. Not recommended for production due to dynamic IPs, residential bandwidth caps, and ISP TOS restrictions on servers.',
                ],
            },
            {
                path: '/guides/openvibe-self-hosting',
                title: 'Self-Hosting OpenVibe Services',
                summary: 'How to run OpenVibe services on your own VPS. Ports, systemd units, nginx reverse proxy, and environment setup.',
                publishedAt: '2026-05-03T10:00:00.000Z',
                kind: 'Article',
                sections: [
                    'OpenVibe is an open-source streaming and community platform. You can run any or all of the 16 services on a single VPS with 4GB RAM or distribute them across multiple machines.',
                    'Minimum requirements for a single-node deploy: Ubuntu 22.04+, 4 CPU cores, 4GB RAM, 40GB SSD. FFmpeg must be installed for live streaming. yt-dlp for the download tools.',
                    'Each service runs as a systemd unit on a dedicated port. openvibe-network (4100), openvibe-live (4600), openre-stream (4700), openvibe-chat (4800). nginx reverse-proxies all services under their respective domains.',
                    'SSL: certbot --nginx handles individual domains. Wildcard certs for *.openvibe.tools require DNS-01 challenge (use Cloudflare DNS plugin or manual TXT record).',
                    'Backups: SQLite databases live in the service data/ directories. Back them up with `sqlite3 database.db ".backup /backup/database.db"` or rsync to cold storage nightly.',
                    'Monitoring: each service exposes GET /health returning {ok: true}. Wire these into Uptime Kuma, Grafana, or any HTTP monitor to get alerts when a service goes down.',
                ],
            },
            {
                path: '/reviews/hetzner',
                title: 'Hetzner VPS Review 2026',
                summary: 'Honest review of Hetzner Cloud for developers and hobbyists. Price, performance, network, and support quality.',
                publishedAt: '2026-05-04T10:00:00.000Z',
                kind: 'Article',
                sections: [
                    'Hetzner Cloud offers the best price-to-performance ratio in the European hosting market. Their CX22 (2 vCPU, 4GB RAM, 40GB SSD) costs €4.85/month as of 2026.',
                    'Network: 20TB included bandwidth per month per server. IPv4 and IPv6 both included. Datacenter locations in Nuremberg, Falkenstein, Helsinki, and Ashburn (US).',
                    'Performance: consistent CPU allocation, NVMe SSDs with low I/O latency. Good for databases, Node.js services, and streaming relay workloads.',
                    'Support: ticket-based, response in 2–4 hours for most issues. Documentation is thorough and accurate. Community forum active.',
                    'Cons: German company, servers primarily in EU (Ashburn location has higher latency for non-East US users). No managed database tier. Object storage (Hetzner Object Storage) is S3-compatible but limited regions.',
                    'Verdict: Best value for EU-primary workloads and developers who prefer no-nonsense pricing without upsell pressure.',
                ],
            },
            {
                path: '/guides/nginx-streaming',
                title: 'Nginx Reverse Proxy for Streaming Services',
                summary: 'Configure nginx as a reverse proxy for multiple streaming services. Load balancing, WebSocket proxying, and SSL termination.',
                publishedAt: '2026-05-05T10:00:00.000Z',
                kind: 'Article',
                sections: [
                    'nginx is the industry standard reverse proxy for production deployments. It terminates SSL, load balances between backend instances, and serves static files directly — offloading Node.js.',
                    'WebSocket proxying requires two additional headers: `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`. Without these, WS connections fail silently.',
                    'For streaming services, increase proxy_read_timeout to 300s+ to avoid connection drops during long-lived streams. Set proxy_send_timeout to match.',
                    'Static file serving: use `location /assets/ { root /opt/your-service/public; expires 7d; }` to serve JS/CSS/images directly without hitting Node.js.',
                    'Rate limiting: `limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;` + `limit_req zone=api burst=10;` on API locations prevents basic abuse without blocking legitimate users.',
                    'Log format: include `$upstream_response_time` and `$request_time` in your access_log format to identify slow backend routes.',
                ],
            },
            {
                path: '/drafts/hosting-policy',
                title: 'Hobo hosting policy draft',
                summary: 'Draft policy covering content restrictions and fair use for openvibe.host listing submissions.',
                publishedAt: '2026-05-01T09:00:00.000Z',
                kind: 'Article',
                draft: true,
                sections: [
                    'OpenVibe Host listings are editorially reviewed before publication. Affiliate links, paid placement, and sponsored content are not accepted.',
                    'All benchmark data must be independently reproducible. Providers may request correction of factual errors; corrections are noted in-article.',
                ],
            },
        ],
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
