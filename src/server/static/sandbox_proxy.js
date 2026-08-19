/**
 * MCP Apps sandbox proxy — protocol-compatible with @modelcontextprotocol/ext-apps
 * (ui/notifications/sandbox-proxy-ready + sandbox-resource-ready).
 *
 * Adapted from ext-apps examples/basic-host/src/sandbox.ts:
 * - Accepts any http(s) embedding referrer (not only localhost)
 * - Allows same-origin embedding (isolation is limited in that case)
 */
(function () {
  "use strict";

  function buildAllowAttribute(permissions) {
    if (!permissions || typeof permissions !== "object") return "";
    var parts = [];
    if (permissions.camera) parts.push("camera");
    if (permissions.microphone) parts.push("microphone");
    if (permissions.geolocation) parts.push("geolocation");
    if (permissions.clipboardWrite) parts.push("clipboard-write");
    return parts.join("; ");
  }

  /** Host-approved iframe sandbox tokens only (deny privilege-escalating flags). */
  var SANDBOX_TOKEN_ALLOWLIST = {
    "allow-scripts": true,
    "allow-forms": true,
    "allow-popups": true,
    "allow-modals": true,
    "allow-downloads": true,
    "allow-pointer-lock": true,
  };

  function sanitizeSandboxAttribute(raw) {
    var tokens = {};
    tokens["allow-same-origin"] = true;
    if (typeof raw === "string") {
      raw.split(/\s+/).forEach(function (token) {
        if (token && SANDBOX_TOKEN_ALLOWLIST[token]) {
          tokens[token] = true;
        }
      });
    }
    return Object.keys(tokens).join(" ");
  }

  if (window.self === window.top) {
    throw new Error("sandbox_proxy.html is only meant to run inside an iframe.");
  }

  var params = new URLSearchParams(window.location.search);
  var hostOriginParam = params.get("hostOrigin");
  var expectedHostOrigin;

  if (document.referrer) {
    try {
      expectedHostOrigin = new URL(document.referrer).origin;
    } catch {
      expectedHostOrigin = null;
    }
  }

  if (!expectedHostOrigin && hostOriginParam) {
    try {
      expectedHostOrigin = new URL(hostOriginParam).origin;
    } catch {
      expectedHostOrigin = null;
    }
  }

  if (!expectedHostOrigin) {
    throw new Error(
      "Cannot determine host origin (missing referrer and hostOrigin query param).",
    );
  }

  try {
    var hostProto = new URL(expectedHostOrigin).protocol;
    if (hostProto !== "http:" && hostProto !== "https:") {
      throw new Error("bad protocol");
    }
  } catch {
    throw new Error("Embedding host origin must be http(s): " + expectedHostOrigin);
  }

  var ownOrigin = new URL(window.location.href).origin;
  var sameOriginAsHost = ownOrigin === expectedHostOrigin;

  if (sameOriginAsHost) {
    console.warn(
      "[MCP Apps Sandbox] Host and sandbox share an origin; iframe isolation is limited.",
    );
  } else {
    // Cross-origin: accessing window.top MUST throw SecurityError.
    try {
      window.top.alert("If you see this, the sandbox is not setup securely.");
      throw new Error("The sandbox is not setup securely (cross-origin isolation failed).");
    } catch (e) {
      if (e instanceof Error && e.message.indexOf("not setup securely") !== -1) {
        throw e;
      }
      // Expected SecurityError confirms proper sandboxing.
    }
  }

  var RESOURCE_READY = "ui/notifications/sandbox-resource-ready";
  var PROXY_READY = "ui/notifications/sandbox-proxy-ready";

  var queryPermissions = null;
  var permissionsParam = params.get("permissions");
  if (permissionsParam) {
    try {
      var parsedPermissions = JSON.parse(permissionsParam);
      if (parsedPermissions && typeof parsedPermissions === "object") {
        queryPermissions = parsedPermissions;
      }
    } catch (e) {
      console.warn("[MCP Apps Sandbox] Ignoring invalid permissions query param");
    }
  }

  var inner = document.createElement("iframe");
  inner.style.cssText = "width:100%;height:100%;border:none;";
  inner.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  // AppFrame currently omits permissions in sandbox-resource-ready; apply from
  // ?permissions= so host-granted Permission Policy reaches the View.
  var allowFromQuery = buildAllowAttribute(queryPermissions);
  if (allowFromQuery) {
    inner.setAttribute("allow", allowFromQuery);
  }
  document.body.appendChild(inner);

  window.addEventListener("message", function (event) {
    if (event.source === window.parent) {
      if (event.origin !== expectedHostOrigin) {
        console.error(
          "[MCP Apps Sandbox] Rejecting message from unexpected origin:",
          event.origin,
          "expected:",
          expectedHostOrigin,
        );
        return;
      }

      if (event.data && event.data.method === RESOURCE_READY) {
        var p = event.data.params || {};
        if (typeof p.sandbox === "string") {
          inner.setAttribute("sandbox", sanitizeSandboxAttribute(p.sandbox));
        }
        var allow = buildAllowAttribute(p.permissions);
        if (allow) {
          inner.setAttribute("allow", allow);
        }
        if (typeof p.html === "string") {
          var doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document);
          if (doc) {
            doc.open();
            doc.write(p.html);
            doc.close();
          } else {
            console.warn("[MCP Apps Sandbox] document.write unavailable; using srcdoc");
            inner.srcdoc = p.html;
          }
        }
        return;
      }

      if (inner.contentWindow) {
        inner.contentWindow.postMessage(event.data, "*");
      }
      return;
    }

    if (event.source === inner.contentWindow) {
      if (event.origin !== ownOrigin) {
        console.error(
          "[MCP Apps Sandbox] Rejecting message from inner iframe origin:",
          event.origin,
          "expected:",
          ownOrigin,
        );
        return;
      }
      window.parent.postMessage(event.data, expectedHostOrigin);
    }
  });

  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      method: PROXY_READY,
      params: {},
    },
    expectedHostOrigin,
  );
})();
