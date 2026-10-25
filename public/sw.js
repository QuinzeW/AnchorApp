const CACHE_NAME = "sensory-anchoring-v3"
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
]

const isAssetRequest = (url) => {
  if (!url || url.origin !== self.location.origin) return false

  return (
    url.pathname.startsWith("/_next/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json")
  )
}

const offlineResponse = () =>
  new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
  })

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return
  }

  if (url.pathname.startsWith("/api/")) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            cache.put(request, response.clone())
          }
          return response
        } catch {
          const cached = await caches.match(request)
          if (cached) return cached
          return (await caches.match("/")) || offlineResponse()
        }
      })(),
    )
    return
  }

  if (isAssetRequest(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)

        if (cached) {
          void fetch(request)
            .then((response) => {
              if (response.ok) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
              }
              return undefined
            })
            .catch(() => undefined)

          return cached
        }

        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME)
            cache.put(request, response.clone())
          }
          return response
        } catch {
          return offlineResponse()
        }
      })(),
    )
  }
})
