(function () {

  /* ── CONFIG ─────────────────────────────────────────────────────
     Nothing here is hardcoded per client. Every value is read from
     data-* attributes on the <script> tag itself, e.g.:

     <script src="https://cdn.example.com/agent-widget.js"
       data-site-id="acme-co"
       data-site-key="pk_live_xxxxx"
       data-url="https://your-n8n.app.n8n.cloud/webhook/website-query"
       data-name="Acme Assistant"
       data-color="#6366f1"
       data-welcome="Hi! How can I help?"
       data-position="right"
       data-icon="<svg viewBox='0 0 24 24'>...</svg>"  (optional; or an image URL. Default: built-in chat-bubble icon)
       data-label="Chat with us"                          (optional; text next to the launcher icon. Default: icon only)
     >
     </script>

     - SITE_KEY identifies which client site is calling (checked in
       n8n's Auth Check node against KNOWN_SITE_KEYS or a lookup).
     - For a per-visitor tier on top of that: if the host site's own
       login system knows this visitor, it sets
       window.AgentWidgetUserToken = "<whatever token their own auth
       issues>" any time before a message is sent. We just forward it
       as a header — we don't generate, parse, or verify it here.
       n8n's Auth Check node maps that token to a name (or ignores
       unrecognized tokens as guest). No token set = guest, no header
       sent at all.                                                  */
  var scriptTag = document.currentScript ||
    (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var CFG        = scriptTag ? scriptTag.dataset : {};
  var SITE_ID    = CFG.siteId    || "";
  var SITE_KEY   = CFG.siteKey   || "";
  var WEBHOOK    = CFG.url       || CFG.webhook || ""; /* data-url is the primary name; data-webhook kept working for anything already using it */
  var NAME       = CFG.name      || "Site Assistant";
  var COLOR      = CFG.color     || "#6366f1";
  var WELCOME    = CFG.welcome   || "Hi \uD83D\uDC4B How can I help you today?";
  var POSITION   = CFG.position  || "right"; /* "right" or "left" */
  var FAB_LABEL  = CFG.label     || ""; /* optional text next to the launcher icon; empty = icon only, like a normal chat bubble */
  var CUSTOM_ICON = CFG.icon     || ""; /* optional: full <svg>...</svg> markup, or an image URL (png/jpg/svg). Falls back to the default chat-bubble icon if not given. */

  if (!WEBHOOK || !SITE_KEY) {
    console.error("[agent-widget] Missing required data-url (webhook endpoint) / data-site-key attributes. Widget not initialized.");
    return;
  }

  /* ── SESSION ID ─────────────────────────────────────────────────*/
  var SID;
  try {
    SID = sessionStorage.getItem("_aw");
    if (!SID) {
      SID = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      sessionStorage.setItem("_aw", SID);
    }
  } catch (e) {
    SID = Math.random().toString(36).slice(2);
  }

  /* ── COLOR HELPERS ──────────────────────────────────────────────*/
  function rgba(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.slice(0,2), 16);
    var g = parseInt(hex.slice(2,4), 16);
    var b = parseInt(hex.slice(4,6), 16);
    return "rgba("+r+","+g+","+b+","+a+")";
  }

  var C  = COLOR;
  var CD = rgba(C, 0.13);
  var CM = rgba(C, 0.27);
  var CS = rgba(C, 0.50);

  /* ── STYLES ─────────────────────────────────────────────────────*/
  var css = [
    "#_aw{position:fixed;"+POSITION+":22px;bottom:22px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none;}",

    /* fab */
    "#_awFab{width:54px;height:54px;border-radius:50%;background:"+C+";border:none;cursor:pointer;pointer-events:all;",
    "display:flex;align-items:center;justify-content:center;",
    "box-shadow:0 4px 18px "+CS+";transition:transform .18s,box-shadow .18s;}",
    "#_awFab:hover{transform:scale(1.08);box-shadow:0 6px 26px "+rgba(C,.65)+"}",
    "#_awFab svg{width:23px;height:23px;display:block;pointer-events:none;}",
    "#_awFab img{width:23px;height:23px;display:block;pointer-events:none;border-radius:50%;object-fit:cover;}",
    /* when a label is present, the fab becomes a pill instead of a circle */
    "#_awFab.awHasLabel{width:auto;height:48px;border-radius:24px;padding:0 20px 0 16px;gap:9px;}",
    "#_awFab.awHasLabel span{color:#fff;font-size:14px;font-weight:600;white-space:nowrap;pointer-events:none;}",

    /* panel */
    "#_awPanel{width:350px;max-height:520px;background:#fff;border-radius:16px;",
    "display:flex;flex-direction:column;overflow:hidden;pointer-events:all;",
    "box-shadow:0 16px 48px rgba(0,0,0,.15),0 2px 8px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.09);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;color:#111;",
    "opacity:0;transform:translateY(14px) scale(.97);pointer-events:none;",
    "transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.4,.64,1);}",
    "#_awPanel.open{opacity:1;transform:none;pointer-events:all;}",

    /* header */
    "#_awHead{background:"+C+";padding:13px 15px;display:flex;align-items:center;gap:10px;flex-shrink:0;}",
    "#_awAvatar{width:34px;height:34px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}",
    "#_awAvatar svg{width:16px;height:16px;}",
    "#_awMeta{flex:1;min-width:0;}",
    "#_awName{font-weight:700;font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    "#_awStatus{font-size:11px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px;margin-top:2px;}",
    "#_awDot{width:6px;height:6px;border-radius:50%;background:#fff;animation:awBlink 2s infinite;}",
    "@keyframes awBlink{0%,100%{opacity:1}50%{opacity:.25}}",
    "#_awClose{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.8);padding:4px;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}",
    "#_awClose:hover{background:rgba(255,255,255,.18);color:#fff;}",
    "#_awClose svg{width:15px;height:15px;pointer-events:none;}",

    /* banner */
    "#_awBanner{font-size:11.5px;text-align:center;padding:5px 10px;display:none;flex-shrink:0;}",
    "#_awBanner.offline{display:block;background:#fff3cd;color:#856404;}",
    "#_awBanner.error{display:block;background:#fff2f2;color:#c0392b;}",

    /* messages */
    "#_awMsgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;overscroll-behavior:contain;}",
    "#_awMsgs::-webkit-scrollbar{width:3px;}",
    "#_awMsgs::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px;}",

    /* message row */
    ".awRow{display:flex;flex-direction:column;gap:5px;max-width:88%;animation:awIn .22s ease;}",
    ".awRow.user{align-self:flex-end;align-items:flex-end;}",
    ".awRow.bot{align-self:flex-start;align-items:flex-start;}",
    "@keyframes awIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}",

    /* bubbles */
    ".awBubble{padding:9px 13px;border-radius:13px;line-height:1.55;font-size:13.5px;word-break:break-word;}",
    ".awRow.user .awBubble{background:"+C+";color:#fff;border-bottom-right-radius:3px;font-weight:500;}",
    ".awRow.bot  .awBubble{background:#f4f4f5;color:#111;border-bottom-left-radius:3px;}",
    ".awBubble.err{background:#fff2f2!important;color:#c0392b!important;border:1px solid #fcc!important;}",

    /* source */
    ".awSource{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#888;text-decoration:none;padding:3px 8px;background:#f4f4f5;border-radius:20px;transition:color .15s,background .15s;}",
    ".awSource:hover{color:"+C+";background:"+CD+"}",
    ".awSource svg{width:9px;height:9px;}",

    /* redirect */
    ".awRedirect{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:"+C+";text-decoration:none;padding:5px 12px;background:"+CD+";border:1px solid "+CM+";border-radius:8px;transition:background .15s;}",
    ".awRedirect:hover{background:"+CM+"}",
    ".awRedirect svg{width:10px;height:10px;}",

    /* contact */
    ".awContact{display:flex;align-items:center;gap:9px;padding:8px 11px;background:#f9f9f9;border:1px solid #eee;border-radius:10px;text-decoration:none;color:#111;font-size:12.5px;font-weight:500;transition:border-color .15s,background .15s;}",
    ".awContact:hover{border-color:"+C+";background:"+CD+"}",
    ".awContactIcon{width:27px;height:27px;background:"+CD+";border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}",
    ".awContactIcon svg{width:13px;height:13px;}",

    /* chips */
    ".awChips{display:flex;flex-wrap:wrap;gap:5px;}",
    ".awChip{font-size:11.5px;padding:4px 10px;background:#fff;border:1px solid #e0e0e0;border-radius:20px;color:#555;cursor:pointer;font-family:inherit;transition:color .15s,border-color .15s,background .15s;}",
    ".awChip:hover{color:"+C+";border-color:"+C+";background:"+CD+"}",

    /* typing */
    ".awTyping{display:flex;align-items:center;gap:4px;padding:10px 13px;}",
    ".awTyping span{width:6px;height:6px;background:#bbb;border-radius:50%;animation:awBounce 1.1s infinite ease-in-out;}",
    ".awTyping span:nth-child(2){animation-delay:.16s;}",
    ".awTyping span:nth-child(3){animation-delay:.32s;}",
    "@keyframes awBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}",

    /* input */
    "#_awInputRow{padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;align-items:flex-end;gap:8px;flex-shrink:0;background:#fff;}",
    "#_awInput{flex:1;background:#f4f4f5;border:1.5px solid transparent;border-radius:10px;padding:8px 11px;color:#111;font-family:inherit;font-size:13px;resize:none;min-height:38px;max-height:90px;outline:none;line-height:1.5;transition:border-color .18s;}",
    "#_awInput::placeholder{color:#bbb;}",
    "#_awInput:focus{border-color:"+C+";background:#fff;}",
    "#_awInput:disabled{opacity:.5;}",
    "#_awSend{width:36px;height:36px;flex-shrink:0;background:"+C+";border:none;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .15s,transform .12s;}",
    "#_awSend:hover{opacity:.87;transform:scale(1.05);}",
    "#_awSend:disabled{opacity:.35;cursor:not-allowed;transform:none;}",
    "#_awSend svg{width:15px;height:15px;pointer-events:none;}",

    /* footer */
    "#_awFooter{text-align:center;padding:5px;font-size:10px;color:#ccc;letter-spacing:.04em;border-top:1px solid #f4f4f4;flex-shrink:0;}",

    /* mobile */
    "@media(max-width:420px){#_aw{right:10px!important;left:10px!important;}#_awPanel{width:calc(100vw - 20px);}}",
    ".awBubble p{margin:0 0 8px;}.awBubble p:last-child{margin:0;}",
    ".awBubble strong{font-weight:700;}.awBubble em{font-style:italic;}",
    ".awBubble code{background:#e8e8e8;padding:1px 5px;border-radius:4px;font-size:12.5px;font-family:monospace;}",
    ".awBubble pre{background:#1e1e1e;color:#f0f0f0;padding:10px 12px;border-radius:8px;overflow-x:auto;margin:6px 0;}",
    ".awBubble pre code{background:none;padding:0;font-size:12px;color:inherit;}",
    ".awBubble ul,.awBubble ol{padding-left:18px;margin:4px 0 8px;}.awBubble li{margin-bottom:3px;}",
    ".awBubble h1,.awBubble h2,.awBubble h3{font-weight:700;margin:8px 0 4px;line-height:1.3;}",
    ".awBubble h1{font-size:16px;}.awBubble h2{font-size:15px;}.awBubble h3{font-size:14px;}",
    ".awBubble a{color:"+C+";text-decoration:underline;}",
    ".awBubble blockquote{border-left:3px solid "+C+";margin:6px 0;padding:4px 10px;color:#555;background:#f9f9f9;border-radius:0 6px 6px 0;}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ── BUILD DOM ──────────────────────────────────────────────────*/
  var root = document.createElement("div");
  root.id = "_aw";

  /* panel */
  var panel = document.createElement("div");
  panel.id = "_awPanel";

  /* header */
  var head = document.createElement("div");
  head.id = "_awHead";
  head.innerHTML = (
    '<div id="_awAvatar"><svg viewBox="0 0 24 24" fill="rgba(255,255,255,.9)"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z"/></svg></div>' +
    '<div id="_awMeta"><div id="_awName"></div><div id="_awStatus"><span id="_awDot"></span>Online</div></div>' +
    '<button id="_awClose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
  );

  /* banner */
  var banner = document.createElement("div");
  banner.id = "_awBanner";

  /* messages */
  var msgs = document.createElement("div");
  msgs.id = "_awMsgs";
  msgs.setAttribute("role", "log");
  msgs.setAttribute("aria-live", "polite");

  /* input row */
  var inputRow = document.createElement("div");
  inputRow.id = "_awInputRow";

  var textarea = document.createElement("textarea");
  textarea.id = "_awInput";
  textarea.setAttribute("rows", "1");
  textarea.setAttribute("placeholder", "Ask anything\u2026");
  textarea.setAttribute("aria-label", "Message");

  var sendBtn = document.createElement("button");
  sendBtn.id = "_awSend";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);

  /* footer */
  var footer = document.createElement("div");
  footer.id = "_awFooter";
  footer.textContent = "Powered by AI Agent";

  panel.appendChild(head);
  panel.appendChild(banner);
  panel.appendChild(msgs);
  panel.appendChild(inputRow);
  panel.appendChild(footer);

  /* fab */
  var fab = document.createElement("button");
  fab.id = "_awFab";
  fab.setAttribute("aria-label", "Open chat");

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /* Resolve the launcher icon: explicit <svg> markup wins, then an
     image URL (png/jpg/webp/svg file), else fall back to the default
     built-in chat-bubble icon. No guessing beyond a simple markup check. */
  function resolveOpenIcon() {
    if (!CUSTOM_ICON) return ICON_CHAT;
    var trimmed = CUSTOM_ICON.trim();
    if (trimmed.indexOf("<svg") === 0) return trimmed;
    return '<img src="' + safe(trimmed) + '" alt="" />';
  }
  var ICON_OPEN = resolveOpenIcon();

  if (FAB_LABEL) {
    fab.classList.add("awHasLabel");
    fab.innerHTML = ICON_OPEN + '<span>' + safe(FAB_LABEL) + '</span>';
  } else {
    fab.innerHTML = ICON_OPEN;
  }

  root.appendChild(panel);
  root.appendChild(fab);
  document.body.appendChild(root);

  /* set name */
  document.getElementById("_awName").textContent = NAME;

  /* ── STATE ──────────────────────────────────────────────────────*/
  var isOpen  = false;
  var loading = false;
  var retries = 0;

  /* ── OPEN / CLOSE ───────────────────────────────────────────────*/
  function openChat() {
    isOpen = true;
    panel.classList.add("open");
    fab.classList.remove("awHasLabel");
    fab.innerHTML = ICON_CLOSE;
    if (!msgs.children.length) addBot({ answer: WELCOME });
    setTimeout(function () { textarea.focus(); }, 200);
    hideBanner();
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove("open");
    if (FAB_LABEL) {
      fab.classList.add("awHasLabel");
      fab.innerHTML = ICON_OPEN + '<span>' + safe(FAB_LABEL) + '</span>';
    } else {
      fab.innerHTML = ICON_OPEN;
    }
  }

  fab.addEventListener("click", function () { isOpen ? closeChat() : openChat(); });
  document.getElementById("_awClose").addEventListener("click", closeChat);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) closeChat(); });

  /* ── SEND ───────────────────────────────────────────────────────*/
  function send() {
    var text = textarea.value.trim();
    if (!text || loading) return;
    if (!navigator.onLine) { showBanner("offline", "You are offline."); return; }

    textarea.value = "";
    growTextarea();
    setLoading(true);
    hideBanner();
    retries = 0;

    addUser(text);
    var typing = addTyping();
    request(text, typing);
  }

  function request(text, typing) {
    var ctrl  = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;

    /* If the CLIENT WEBSITE knows this visitor is logged in, it sets
       window.AgentWidgetUserToken = "<some token their own login
       system issued>" before this script loads (or any time before
       sending a message). We just forward that token as a header —
       we don't generate it, verify it, or know what's inside it.
       n8n's Auth Check node is what maps token -> name (or rejects
       tokens it doesn't recognize back to guest treatment).
       If the host page never sets it, we send no such header at all
       — that's exactly how a guest is distinguished. */
    var userToken = window.AgentWidgetUserToken || null;

    var headers = { "Content-Type": "application/json", "x-site-id": SITE_ID, "x-site-key": SITE_KEY };
    if (userToken) headers["x-user-token"] = userToken;

    var opts = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ message: text, sessionId: SID, timestamp: Date.now() })
    };
    if (ctrl) opts.signal = ctrl.signal;

    fetch(WEBHOOK, opts)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        remove(typing);
        addBot(data);
        retries = 0;
        setLoading(false);
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (retries < 2) {
          retries++;
          showBanner("error", "Retrying (" + retries + "/2)...");
          setTimeout(function () { request(text, typing); }, 1000 * retries);
          return;
        }
        remove(typing);
        var msg = "Something went wrong. Please try again.";
        if (err && err.name === "AbortError") msg = "Request timed out. Please try again.";
        else if (!navigator.onLine) msg = "You went offline.";
        addBot({ answer: msg, _err: true });
        hideBanner();
        setLoading(false);
      });
  }

  sendBtn.addEventListener("click", send);
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  textarea.addEventListener("input", growTextarea);
  window.addEventListener("offline", function () { showBanner("offline", "You are offline."); });
  window.addEventListener("online",  hideBanner);

  /* ── RENDER ─────────────────────────────────────────────────────
     Agent must return JSON with these fields:
     {
       "answer":         "string",
       "source":         "https://..." | null,
       "redirect":       { "label": "string", "url": "https://..." } | null,
       "related_topics": ["string", ...] | [],
       "contact":        { "label": "string", "value": "tel:/ mailto:/ https:" } | null
     }
  ── */
  function addUser(text) {
    var row = make("div", "awRow user");
    var bub = make("div", "awBubble");
    bub.textContent = text;
    row.appendChild(bub);
    push(row);
  }

  function addBot(data) {
    var row = make("div", "awRow bot");

    /* answer */
    var bub = make("div", "awBubble" + (data._err ? " err" : ""));
    bub.innerHTML = md(data.answer || "I don\u2019t have information about that.");
    row.appendChild(bub);

    /* source */
    if (validUrl(data.source)) {
      var src = make("a", "awSource");
      src.href = data.source; src.target = "_blank"; src.rel = "noopener noreferrer";
      src.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Source';
      row.appendChild(src);
    }

    /* redirect */
    if (data.redirect && validUrl(data.redirect.url)) {
      var rdr = make("a", "awRedirect");
      rdr.href = data.redirect.url; rdr.target = "_blank"; rdr.rel = "noopener noreferrer";
      rdr.innerHTML = safe(data.redirect.label || "Visit Page") + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
      row.appendChild(rdr);
    }

    /* contact */
    if (data.contact && data.contact.value) {
      var cnt = make("a", "awContact");
      cnt.href = data.contact.value; cnt.target = "_blank"; cnt.rel = "noopener noreferrer";
      cnt.innerHTML = '<span class="awContactIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.62 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.12 4.18 2 2 0 0 1 5.09 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 17z"/></svg></span>' + safe(data.contact.label || "Contact Us");
      row.appendChild(cnt);
    }

    /* related topics */
    if (Array.isArray(data.related_topics) && data.related_topics.length) {
      var chips = make("div", "awChips");
      data.related_topics.slice(0, 5).forEach(function (t) {
        if (typeof t !== "string") return;
        var chip = make("button", "awChip");
        chip.textContent = t.trim();
        chip.addEventListener("click", function () { textarea.value = t.trim(); send(); });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
    }

    push(row);
  }

  function addTyping() {
    var row = make("div", "awRow bot");
    var bub = make("div", "awBubble");
    bub.innerHTML = '<div class="awTyping"><span></span><span></span><span></span></div>';
    row.appendChild(bub);
    push(row);
    return row;
  }

  /* ── UTILS ──────────────────────────────────────────────────────*/
  /* ── MARKDOWN RENDERER ──────────────────────────────────────────*/
  function md(s) {
    var t = String(s || "").trim();

    /* code blocks first (preserve content) */
    var blocks = [];
    t = t.replace(/```[\s\S]*?```/g, function(m) {
      var lang = m.match(/^```(\w*)/);
      var code = m.replace(/^```\w*\n?/, "").replace(/```$/, "");
      blocks.push('<pre><code>' + safe(code.trim()) + '</code></pre>');
      return "\x00" + (blocks.length - 1) + "\x00";
    });

    /* escape remaining html */
    t = t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    /* headings */
    t = t.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    t = t.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
    t = t.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

    /* bold, italic, inline code */
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g,     "<em>$1</em>");
    t = t.replace(/`(.+?)`/g,       "<code>$1</code>");

    /* blockquote */
    t = t.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    /* hr */
    t = t.replace(/^---$/gm, "<hr>");

    /* unordered lists */
    t = t.replace(/((?:^[-*] .+\n?)+)/gm, function(block) {
      var items = block.trim().split("\n").map(function(l){ return "<li>" + l.replace(/^[-*] /,"") + "</li>"; }).join("");
      return "<ul>" + items + "</ul>";
    });

    /* ordered lists */
    t = t.replace(/((?:^\d+\. .+\n?)+)/gm, function(block) {
      var items = block.trim().split("\n").map(function(l){ return "<li>" + l.replace(/^\d+\. /,"") + "</li>"; }).join("");
      return "<ol>" + items + "</ol>";
    });

    /* links */
    t = t.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    /* line breaks → paragraphs */
    t = t.replace(/\n{2,}/g, "</p><p>");
    t = t.replace(/\n/g, "<br>");
    t = "<p>" + t + "</p>";

    /* clean up p tags around block elements */
    t = t.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|blockquote))/g, "$1");
    t = t.replace(/((?:h[123]|ul|ol|pre|hr|blockquote)>)<\/p>/g, "$1");

    /* restore code blocks */
    t = t.replace(/\x00(\d+)\x00/g, function(_, i){ return blocks[+i]; });

    return t;
  }

  function make(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function push(node) { msgs.appendChild(node); msgs.scrollTop = msgs.scrollHeight; }
  function remove(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
  function setLoading(s) { loading = s; sendBtn.disabled = s; textarea.disabled = s; }
  function growTextarea() { textarea.style.height = "auto"; textarea.style.height = Math.min(textarea.scrollHeight, 90) + "px"; }
  function showBanner(cls, msg) { banner.className = cls; banner.style.display = "block"; banner.textContent = msg; }
  function hideBanner() { banner.className = ""; banner.style.display = "none"; banner.textContent = ""; }
  function validUrl(s) { if (!s || typeof s !== "string") return false; try { new URL(s); return true; } catch (e) { return false; } }
  function safe(s) { var d = document.createElement("div"); d.textContent = String(s || ""); return d.innerHTML; }

})();