import type { VideoScript } from '../../video/types';

export const video: VideoScript = {
  id: 'https',
  scenes: [
    {
      kind: 'title',
      title: 'HTTPS',
      subtitle: 'HTTP inside TLS: nobody on the path can read it, change it, or pretend to be your server.',
      say: [
        'This lesson is about HTTPS: ordinary HTTP, sent inside an encrypted TLS connection.',
        'You will see what TLS protects, how the handshake works, where TLS ends in the cloud, and how one header keeps browsers on HTTPS.',
      ],
    },
    {
      kind: 'flow',
      title: 'Plain HTTP on café Wi-Fi',
      name: 'plain-http',
      nodes: [
        { id: 'app', kind: 'client', label: 'API client', sub: 'on café Wi-Fi', col: 0, row: 1 },
        { id: 'wifi', kind: 'internet', label: 'Café Wi-Fi', col: 2, row: 1 },
        { id: 'api', kind: 'server', label: 'Bookshop API', col: 4, row: 1 },
        { id: 'eve', kind: 'user', label: 'Attacker', sub: 'same network', col: 2, row: 2.5, hidden: true },
      ],
      edges: [
        { from: 'app', to: 'wifi', label: 'plain HTTP' },
        { from: 'wifi', to: 'api' },
        { from: 'wifi', to: 'eve', dashed: true, hidden: true },
      ],
      say: [
        'A developer tests an app from a café. It calls the Bookshop API over plain HTTP, with a bearer token in the Authorization header.',
        'Every byte crosses the café network as plain text: the method, the path, every header, the token and the body.',
        'Anyone on the same Wi-Fi can capture that traffic. Here, an attacker copies the request as it passes.',
        'A bearer token works for whoever holds it, until it expires. Now the attacker calls the API as the developer.',
        'The attacker can also change the answer on the way, or answer in the API’s place. Nothing proves who replied, and the client cannot tell.',
      ],
      beats: [
        { send: [{ path: ['app', 'wifi', 'api'], label: 'GET + token' }] },
        { badge: { wifi: 'plain text' }, focus: ['wifi'] },
        { show: ['eve', 'wifi-eve'], send: [{ path: ['app', 'wifi', 'eve'], label: 'copy of request', tone: 'fail' }] },
        { badge: { eve: 'has token' }, send: [{ path: ['eve', 'wifi', 'api'], label: 'GET + stolen token', tone: 'fail' }] },
        {
          send: [
            { path: ['api', 'wifi', 'eve'], label: '200 OK', tone: 'reply' },
            { path: ['eve', 'wifi', 'app'], label: '200, changed', tone: 'fail' },
          ],
          badge: { app: 'fooled' },
          note: 'Read it, change it, fake it: plain HTTP allows all three',
        },
      ],
    },
    {
      kind: 'flow',
      title: 'The same café, with TLS',
      name: 'with-tls',
      nodes: [
        { id: 'app', kind: 'client', label: 'API client', sub: 'on café Wi-Fi', col: 0, row: 1 },
        { id: 'wifi', kind: 'internet', label: 'Café Wi-Fi', col: 2, row: 1 },
        { id: 'api', kind: 'server', label: 'Bookshop API', sub: 'bookshop.example', col: 4, row: 1 },
        { id: 'eve', kind: 'user', label: 'Attacker', sub: 'same network', col: 2, row: 2.5 },
      ],
      edges: [
        { from: 'app', to: 'wifi', label: 'TLS' },
        { from: 'wifi', to: 'api' },
        { from: 'wifi', to: 'eve', dashed: true },
      ],
      panels: [{ id: 'sees', title: 'Attacker sees', col: 4.3, row: 2.5, width: 230, rows: ['(nothing yet)'] }],
      say: [
        'Now the same café, with HTTPS. Before any HTTP is sent, the client and the API set up a TLS connection.',
        'The request travels inside it. The attacker still copies the bytes, but they are encrypted: no path, no headers, no token.',
        'That is privacy. The attacker learns which host you called and roughly how much data moved, but not what was said.',
        'Next, integrity. Every TLS record carries a check value. If one byte is changed on the way, the check fails and the connection is closed.',
        'And identity. Only the real API holds the private key for bookshop.example, so a fake server cannot finish the handshake. Nobody on the path can read or use the token.',
      ],
      beats: [
        { send: [{ path: ['app', 'wifi', 'api'], label: 'TLS handshake' }], badge: { app: 'TLS' } },
        {
          send: [
            { path: ['app', 'wifi', 'api'], label: 'encrypted GET' },
            { path: ['wifi', 'eve'], label: 'encrypted bytes', tone: 'fail', sameTime: true },
          ],
          rows: { sees: ['random-looking bytes'] },
        },
        { rows: { sees: ['host: bookshop.example', 'sizes and timing', 'content: unreadable'] }, focus: ['sees'] },
        { send: [{ path: ['eve', 'wifi', 'app'], label: 'changed bytes', tone: 'fail' }], badge: { app: 'rejected' } },
        {
          send: [{ path: ['eve', 'wifi', 'app'], label: 'fake certificate', tone: 'fail' }],
          badge: { app: 'refused', eve: 'nothing' },
          note: 'Privacy, integrity, identity',
        },
      ],
    },
    {
      kind: 'pause',
      title: 'Pause and think',
      question: 'Over HTTPS, what can someone on the café Wi-Fi still see: the host you called, the path, the token?',
      answer: 'The host, usually yes: it is in the client’s hello and in DNS. The path, the headers, the token and the body are all encrypted.',
      say: ['Over HTTPS, what can someone on the café Wi-Fi still see? The host name you called? The path? The token?'],
      answerSay: [
        'The host name, usually yes: the client sends it in its hello message, and DNS lookups show it too. But the method, the path, every header and the body are encrypted. The token is safe.',
      ],
    },
    {
      kind: 'flow',
      title: 'The TLS 1.3 handshake at a glance',
      name: 'handshake',
      nodes: [
        { id: 'c', kind: 'client', label: 'API client', col: 0, row: 1 },
        { id: 's', kind: 'server', label: 'bookshop.example', sub: 'port 443', col: 4, row: 1 },
      ],
      edges: [{ from: 'c', to: 's' }],
      panels: [
        { id: 'checks', title: 'Client checks', col: 0.4, row: 2.4, rows: ['(waiting)'] },
        { id: 'keys', title: 'Shared secret', col: 4, row: 2.4, rows: ['(none yet)'] },
      ],
      say: [
        'Here is the TLS 1.3 handshake, at a glance. It runs once per connection, before any HTTP is sent.',
        'The client says hello: the versions and ciphers it supports, the host name it wants, and its half of a key exchange.',
        'The server picks a version and a cipher, and replies with its own half. Each side combines the two halves into the same secret, which never crossed the network.',
        'From here on, everything is encrypted. The server sends its certificate: its name and public key, signed by a certificate authority.',
        'Then it signs the handshake with its private key. That proves it holds the key, not just a copy of the certificate.',
        'The client checks the certificate: a trusted authority signed it, the name matches the host, and it has not expired.',
        'The client sends Finished. That took one round trip, where TLS 1.2 needed two. Fresh key halves per connection also give forward secrecy: a key stolen later cannot decrypt today’s traffic.',
      ],
      beats: [
        { badge: { c: 'TCP open' }, focus: ['c', 's'] },
        { send: [{ path: ['c', 's'], label: 'ClientHello' }] },
        {
          send: [{ path: ['s', 'c'], label: 'ServerHello', tone: 'reply' }],
          rows: { keys: ['client: same secret', 'server: same secret'] },
        },
        { send: [{ path: ['s', 'c'], label: 'certificate', tone: 'reply' }] },
        { send: [{ path: ['s', 'c'], label: 'signature', tone: 'reply' }] },
        { rows: { checks: ['trusted CA: yes', 'name matches: yes', 'not expired: yes'] }, focus: ['checks'] },
        {
          send: [{ path: ['c', 's'], label: 'Finished' }, { path: ['c', 's'], label: 'GET, encrypted' }],
          badge: { c: 'TLS 1.3' },
          note: 'One round trip, then encrypted HTTP',
        },
      ],
    },
    {
      kind: 'flow',
      title: 'TLS ends at the cloud edge',
      name: 'edge',
      nodes: [
        { id: 'c', kind: 'client', label: 'API client', col: 0, row: 1 },
        { id: 'edge', kind: 'gateway', label: 'Cloud edge', sub: 'holds the certificate', col: 2.5, row: 1 },
        { id: 'app', kind: 'server', label: 'Bookshop API', sub: 'plain HTTP', col: 5, row: 1 },
      ],
      edges: [
        { from: 'c', to: 'edge', label: 'HTTPS' },
        { from: 'edge', to: 'app', label: 'private hop' },
      ],
      zones: [{ id: 'cloud', label: 'Cloud provider', from: [2.5, 1], to: [5, 1] }],
      say: [
        'In the cloud, your app usually does not do TLS at all. The platform’s front end does: API Gateway on AWS, Cloud Run on Google Cloud, App Service on Azure.',
        'The client makes its TLS connection to the edge. The edge holds the certificate, finishes the handshake and decrypts the request.',
        'Then it forwards the request to your app, over the provider’s private network, as plain HTTP.',
        'Your app answers in plain HTTP. The edge encrypts the answer and sends it back over TLS.',
        'This is called TLS termination. Certificates live in one place, and your app sees plain HTTP. The hop behind the edge must be one you trust: on these platforms, only the edge can reach the app.',
        'That leaves the app with a puzzle. Every request it sees is plain HTTP. How does it know the client used HTTPS?',
      ],
      beats: [
        { badge: { edge: 'TLS' }, focus: ['edge'] },
        { send: [{ path: ['c', 'edge'], label: 'GET, encrypted' }], badge: { edge: 'decrypted' } },
        { send: [{ path: ['edge', 'app'], label: 'GET, plain HTTP' }] },
        {
          send: [
            { path: ['app', 'edge'], label: '200 OK', tone: 'reply' },
            { path: ['edge', 'c'], label: '200, encrypted', tone: 'reply' },
          ],
        },
        { focus: ['edge-app'], badge: { edge: 'terminates', app: 'edge only' }, note: 'TLS termination: the edge decrypts, the app speaks HTTP' },
        { send: [{ path: ['edge', 'app'], label: 'GET, plain HTTP' }], badge: { app: 'HTTPS?' } },
      ],
    },
    {
      kind: 'http',
      title: 'X-Forwarded-Proto tells the app',
      request: [
        'GET /health HTTP/1.1',
        'Host: bookshop.example',
        'X-Forwarded-Proto: https',
        'X-Forwarded-For: 203.0.113.7',
      ],
      response: [
        'HTTP/1.1 200 OK',
        'Strict-Transport-Security:',
        '  max-age=31536000; includeSubDomains',
        'X-Content-Type-Options: nosniff',
        'Referrer-Policy: no-referrer',
        '',
        '{"status":"ok"}',
      ],
      responseAt: 3,
      marks: [{ req: [0, 2] }, { req: [3] }, { req: [2] }, { res: [0, 1, 2] }],
      say: [
        'Here is the answer: the request as your app receives it, on plain HTTP. The edge added X-Forwarded-Proto: https. It means: the client reached me over HTTPS.',
        'Edges add others too, such as X-Forwarded-For with the client’s IP address. The standard Forwarded header, RFC 7239, exists, but is less common.',
        'Behind several proxies, each hop may append its own value. This API reads only the first one. A client could set that value itself, which is harmless here, because only HSTS depends on it.',
        'The app sees https, so its answer carries Strict-Transport-Security. On plain HTTP, the same app leaves that header out.',
      ],
    },
    {
      kind: 'flow',
      title: 'The first request can be plain',
      name: 'ssl-strip',
      nodes: [
        { id: 'br', kind: 'browser', label: 'Browser', sub: 'on café Wi-Fi', col: 0, row: 1 },
        { id: 'mitm', kind: 'user', label: 'Attacker', sub: 'in the middle', col: 2.5, row: 2.4, hidden: true },
        { id: 'site', kind: 'server', label: 'bookshop.example', col: 5, row: 1 },
      ],
      edges: [
        { from: 'br', to: 'site', label: 'Wi-Fi' },
        { from: 'br', to: 'mitm', hidden: true },
        { from: 'mitm', to: 'site', hidden: true },
      ],
      say: [
        'Now the browser side. A user clicks an old link to the bookshop that starts with http, not https.',
        'Normally the server answers with a redirect to the HTTPS address, and everything after that is encrypted.',
        'But the first request was plain HTTP. On café Wi-Fi, an attacker can sit in the middle and answer it.',
        'The attacker keeps the browser on plain HTTP, and talks HTTPS to the real site itself. This is called SSL stripping.',
        'The real pages come back through the attacker, so the site looks normal. Every password and token the user types passes through the attacker in plain text.',
      ],
      beats: [
        { send: [{ path: ['br', 'site'], label: 'plain GET' }] },
        { send: [{ path: ['site', 'br'], label: '301 to https', tone: 'reply' }] },
        { show: ['mitm', 'br-mitm', 'mitm-site'], hide: ['br-site'], focus: ['mitm'] },
        {
          send: [
            { path: ['br', 'mitm'], label: 'plain GET' },
            { path: ['mitm', 'site'], label: 'HTTPS GET' },
          ],
        },
        {
          send: [
            { path: ['site', 'mitm'], label: '200, encrypted', tone: 'reply' },
            { path: ['mitm', 'br'], label: '200, plain', tone: 'fail' },
            { path: ['br', 'mitm'], label: 'password', tone: 'fail' },
          ],
          badge: { br: 'no padlock', mitm: 'reads all' },
        },
      ],
    },
    {
      kind: 'http',
      title: 'HSTS: only HTTPS from now on',
      request: ['GET /health HTTP/1.1', 'Host: bookshop.example'],
      response: [
        'HTTP/1.1 200 OK',
        'Strict-Transport-Security:',
        '  max-age=31536000; includeSubDomains',
        'Content-Type: application/json',
        '',
        '{"status":"ok"}',
      ],
      responseAt: 0,
      marks: [{ res: [1] }, { res: [2] }, { res: [2] }, { res: [1, 2] }, {}],
      say: [
        'The defense is a response header: Strict-Transport-Security, HSTS for short, from RFC 6797. Sent over HTTPS, it tells the browser: only HTTPS for this host from now on.',
        'max-age is in seconds. 31,536,000 seconds is one year, and each HTTPS response with the header starts that year again.',
        'The second part, include subdomains, covers every subdomain too, such as api.bookshop.example.',
        'For that year, the browser turns every http address for the host into https before it sends anything. And it no longer lets the user click past a certificate error.',
        'HSTS is a browser feature. Mobile apps and servers that call your API must simply use https addresses in their own code.',
      ],
    },
    {
      kind: 'flow',
      title: 'The café again, with HSTS',
      name: 'hsts',
      nodes: [
        { id: 'br', kind: 'browser', label: 'Browser', sub: 'on café Wi-Fi', col: 0, row: 1 },
        { id: 'mitm', kind: 'user', label: 'Attacker', sub: 'in the middle', col: 2.5, row: 1 },
        { id: 'site', kind: 'server', label: 'bookshop.example', col: 5, row: 1 },
      ],
      edges: [
        { from: 'br', to: 'mitm' },
        { from: 'mitm', to: 'site' },
      ],
      panels: [{ id: 'list', title: 'HSTS list', col: 0.4, row: 2.4, rows: ['(empty)'] }],
      say: [
        'Replay the café. This time, the user visited the bookshop once before, at home, over HTTPS, and got the header.',
        'They click the same old http link. Before sending anything, the browser checks its HSTS list and finds the host.',
        'So it never sends plain HTTP. It goes straight to TLS, and the attacker can only pass encrypted bytes along.',
        'If it answers with its own certificate instead, the check fails. With HSTS, the browser shows an error and offers no way to continue.',
        'One gap remains: the very first visit, before the browser has seen the header. Browsers ship a built-in preload list of HSTS sites to close it.',
      ],
      beats: [
        { rows: { list: ['bookshop.example', '  for one year', '  and subdomains'] }, focus: ['list'] },
        { badge: { br: 'HSTS hit' }, focus: ['list'] },
        {
          send: [
            { path: ['br', 'mitm', 'site'], label: 'TLS handshake' },
            { path: ['site', 'mitm', 'br'], label: '200, encrypted', tone: 'reply' },
          ],
          badge: { mitm: 'sees noise' },
        },
        { send: [{ path: ['mitm', 'br'], label: 'fake certificate', tone: 'fail' }], badge: { br: 'blocked' } },
        { note: 'The first visit is covered only by the preload list' },
      ],
    },
    {
      kind: 'points',
      title: 'Never send HSTS over plain HTTP',
      tone: 'key',
      points: [
        'Browsers must ignore it on plain HTTP, where anyone could add or strip it',
        'It would claim a secure connection that never happened',
        'This API: HSTS only when the request came over HTTPS',
      ],
      say: [
        'One rule about HSTS: never send it over plain HTTP. RFC 6797 tells browsers to ignore it there, because on plain HTTP an attacker could inject it or strip it.',
        'Worse, it would mislead anyone reading responses or logs, by claiming a secure connection that never happened.',
        'So all three stacks add HSTS only when the connection is TLS, or X-Forwarded-Proto says https. Your local server, on plain HTTP, never sends it.',
      ],
    },
    {
      kind: 'table',
      title: 'Certificates are managed for you',
      head: ['Cloud', 'Default address', 'Your own domain'],
      rows: [
        ['AWS', 'execute-api URL, HTTPS only', 'free certificate from ACM'],
        ['Google Cloud', 'run.app URL, with a certificate', 'Google-managed certificate'],
        ['Azure', 'azurewebsites.net, httpsOnly', 'App Service managed certificate'],
      ],
      say: [
        'In the cloud, you rarely buy or renew a certificate by hand. API Gateway serves HTTPS only, and AWS Certificate Manager issues free certificates for your own domain and renews them.',
        'Cloud Run gives every service a run.app address with a Google-managed certificate. Custom domains can get managed certificates too.',
        'App Service has HTTPS on its default address, and this repo’s Bicep sets httpsOnly and a minimum of TLS 1.2. Custom domains can use a free managed certificate.',
      ],
    },
    {
      kind: 'flow',
      title: 'When a certificate expires',
      name: 'expired',
      nodes: [
        { id: 'br', kind: 'browser', label: 'Browser', col: 0, row: 0 },
        { id: 'ph', kind: 'phone', label: 'Mobile app', col: 0, row: 2 },
        { id: 'srv', kind: 'server', label: 'bookshop.example', sub: 'hand-installed cert', col: 2.5, row: 1 },
      ],
      edges: [
        { from: 'br', to: 'srv' },
        { from: 'ph', to: 'srv' },
      ],
      panels: [{ id: 'cert', title: 'Certificate', col: 4.6, row: 1, rows: ['bookshop.example', 'valid until: today'] }],
      say: [
        'This server has a certificate that someone installed by hand, a year ago. Nobody renewed it, and tonight it expires.',
        'Every new handshake now fails the date check. The browser shows a full-page warning, and because of HSTS, there is no way past it.',
        'The mobile app fails too, with a network error. Nothing is wrong with the code or the servers, yet every client is locked out.',
        'Public certificates now last months, not years. A managed certificate renews well before the end date, and the edge picks it up. Nobody has to remember.',
      ],
      beats: [
        { rows: { cert: ['bookshop.example', 'EXPIRED'] }, badge: { srv: 'expired' }, focus: ['cert'] },
        {
          send: [
            { path: ['br', 'srv'], label: 'ClientHello' },
            { path: ['srv', 'br'], label: 'expired cert', tone: 'fail' },
          ],
          badge: { br: 'blocked' },
        },
        {
          send: [
            { path: ['ph', 'srv'], label: 'ClientHello' },
            { path: ['srv', 'ph'], label: 'expired cert', tone: 'fail' },
          ],
          badge: { br: 'locked out', ph: 'locked out' },
          note: 'A healthy server that nobody can reach',
        },
        {
          relabel: { srv: { sub: 'managed certificate' } },
          rows: { cert: ['bookshop.example', 'renewed: automatic'] },
          badge: { srv: 'renewed', br: null, ph: null },
          send: [
            { path: ['br', 'srv'], label: 'ClientHello' },
            { path: ['srv', 'br'], label: 'valid certificate', tone: 'reply' },
          ],
        },
      ],
    },
    {
      kind: 'signals',
      title: 'When to reach for what',
      rows: [
        { see: 'Tokens or passwords on any network', think: 'HTTPS, always' },
        { see: 'A load balancer or gateway in front', think: 'End TLS there, read X-Forwarded-Proto' },
        { see: 'A site people open in a browser', think: 'HSTS with a long max-age' },
        { see: 'Plain HTTP still accepted', think: 'Redirect it at the edge, or refuse it' },
      ],
      say: [
        'In design reviews and interviews: anything that carries a token, a password or personal data across a network you do not control goes over HTTPS.',
        'A load balancer or gateway in front of the app is where TLS ends. The app reads X-Forwarded-Proto to know the original scheme.',
        'A site that people open in a browser gets HSTS, with a long max-age once HTTPS works everywhere.',
        'If plain HTTP is still accepted, redirect it at the edge for browsers, or refuse it for API clients.',
      ],
    },
    {
      kind: 'points',
      title: 'Common mistakes',
      tone: 'warn',
      points: [
        'Trusting X-Forwarded-Proto from anyone',
        'A long max-age before HTTPS works everywhere',
        'Turning off certificate checks in client code',
      ],
      say: [
        'Trusting X-Forwarded-Proto when clients can reach the app directly. Believe it only when your own edge sets it.',
        'Setting a long max-age, or include subdomains, before every subdomain serves HTTPS. Browsers will refuse those hosts for the whole period.',
        'Turning off certificate checks in client code to get past an error, such as verify set to False in Python. That throws away identity, and lets an attacker sit in the middle again.',
      ],
    },
    {
      kind: 'pause',
      title: 'Pause and think',
      question: 'A client skips the edge and sends X-Forwarded-Proto: https straight to your app, over plain HTTP. What does it gain from this API?',
      answer: 'Only an HSTS header on its own response. Nothing else here reads that header, so faking it gains nothing.',
      say: ['A client skips the edge and sends X-Forwarded-Proto: https straight to your app, over plain HTTP. What does it gain from this API?'],
      answerSay: [
        'Only an HSTS header on its own response. Nothing else in this API reads that header. If you ever base a security decision on it, make sure only your edge can reach the app.',
      ],
    },
    {
      kind: 'recap',
      title: 'Recap',
      points: [
        'TLS gives privacy, integrity and identity',
        'One round trip, then encrypted HTTP',
        'TLS ends at the edge; X-Forwarded-Proto tells the app',
        'HSTS only over HTTPS: one year, subdomains too',
        'Let the platform issue and renew certificates',
      ],
      next: 'cors',
      say: [
        'Let us recap. TLS gives you privacy, integrity and identity, so nobody on the path can read, change or fake your traffic.',
        'The TLS 1.3 handshake takes one round trip: key halves, a certificate and a signature. Then HTTP flows, encrypted.',
        'In the cloud, TLS ends at the edge, and X-Forwarded-Proto tells your app that the client used HTTPS.',
        'Then the app sends HSTS: one year, subdomains included, and never over plain HTTP.',
        'Let the platform issue and renew certificates. Now open the practice tab and try it on a real server, then watch the next lesson: CORS.',
      ],
    },
  ],
};
