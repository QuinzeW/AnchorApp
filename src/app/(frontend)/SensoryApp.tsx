"use client"
// Installed PWAs already launch fullscreen; browser tabs may reject it.
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import { pickConcepts } from "./concepts"
import {
  loadLocalData,
  removeMemory,
  saveAppState,
  saveMemory,
  type StoredMemory,
  updateMemoryCity,
} from "./localDatabase"

type Screen = "splash" | "home" | "camera" | "validate" | "summary" | "congratulations" | "gallery" | "consultation"
type Transition = "forward" | "back" | "fade"

type Concept = {
  id: number
  label: string
  validated: boolean
}

type Memory = {
  id: string
  listId: string
  image: string
  concepts: string[]
  createdAt: number
  city: string
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const makeConcepts = (): Concept[] =>
  pickConcepts(5).map((label, id) => ({
    id,
    label,
    validated: false,
  }))

const unknownCity = "Lieu non renseigné"
const refreshPullThreshold = 64
const maximumRefreshPull = 96
const storedCoordinatesPattern =
  /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

type ReverseGeocodingResult = {
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    hamlet?: string
  }
}

const reverseGeocodeCity = async (latitude: number, longitude: number) => {
  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: latitude.toFixed(3),
    lon: longitude.toFixed(3),
    zoom: "10",
    addressdetails: "1",
    "accept-language": "fr",
  }).toString()

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return unknownCity

  const result = (await response.json()) as ReverseGeocodingResult
  return (
    result.address?.city ||
    result.address?.town ||
    result.address?.village ||
    result.address?.municipality ||
    result.address?.hamlet ||
    unknownCity
  )
}

const locateCity = () =>
  new Promise<string>((resolve) => {
    if (!navigator.geolocation) {
      resolve(unknownCity)
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void reverseGeocodeCity(coords.latitude, coords.longitude)
          .then(resolve)
          .catch(() => resolve(unknownCity))
      },
      () => resolve(unknownCity),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    )
  })

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash")
  const [transition, setTransition] = useState<Transition>("fade")
  const [concepts, setConcepts] = useState(makeConcepts)
  const [currentListId, setCurrentListId] = useState(() =>
    Date.now().toString(),
  )
  const [selected, setSelected] = useState<number[]>([])
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null)
  const [draftMemoryId, setDraftMemoryId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [currentCity, setCurrentCity] = useState(unknownCity)
  const [dataReady, setDataReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  )
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cityPromiseRef = useRef<Promise<string> | null>(null)
  const memoryUrlsRef = useRef(new Set<string>())
  const refreshGestureRef = useRef({
    pointerId: null as number | null,
    startY: 0,
    distance: 0,
  })
  const [refreshPull, setRefreshPull] = useState(0)

  const complete = concepts.every((concept) => concept.validated)
  const currentLabels = useMemo(
    () =>
      concepts
        .filter((concept) => selected.includes(concept.id))
        .map((concept) => concept.label),
    [concepts, selected],
  )
  const selectedMemory = memories.find(
    (memory) => memory.id === selectedMemoryId,
  )

  useEffect(() => {
    let active = true
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setInstallMessage("Application installée.")
      setInstallPrompt(null)
    }
    const handleControllerChange = () => {
      setInstallMessage("Mise à jour de l’application prête.")
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (registration.waiting) {
            setInstallMessage("Mise à jour de l’application disponible.")
          }
        })
        .catch(() => undefined)

      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)
    }
    if (navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => undefined)
    }

    const loadData = async () => {
      try {
        const localData = await loadLocalData()
        if (!active) return
        if (localData.state) {
          setCurrentListId(localData.state.currentListId)
          setConcepts(
            localData.state.concepts.map((concept, id) => ({
              id,
              ...concept,
            })),
          )
        }
        setMemories(
          localData.memories
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(({ image, ...memory }) => {
              const imageUrl = URL.createObjectURL(image)
              memoryUrlsRef.current.add(imageUrl)
              return { ...memory, image: imageUrl }
            }),
        )
      } catch {
        if (active) {
          setSaveError(
            "Le stockage local n’est pas disponible dans ce navigateur.",
          )
        }
      } finally {
        if (active) setDataReady(true)
      }
    }

    void loadData()
    return () => {
      active = false
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        )
      }
      memoryUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      memoryUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!dataReady) return
    const timeout = window.setTimeout(() => {
      void saveAppState({
        currentListId,
        concepts: concepts.map(({ label, validated }) => ({
          label,
          validated,
        })),
      }).catch(() =>
        setSaveError("Les défis n’ont pas pu être enregistrés sur l’appareil."),
      )
    }, 450)

    return () => window.clearTimeout(timeout)
  }, [concepts, currentListId, dataReady])

  useEffect(() => {
    if (screen !== "camera") return

    let active = true
    setCameraReady(false)
    setCameraError(null)

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("La caméra n’est pas disponible sur cet appareil.")
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        })

        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (error) {
        if (!active) return
        const permissionDenied =
          error instanceof DOMException &&
          (error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError")
        setCameraError(
          permissionDenied
            ? "Autorisez l’accès à la caméra pour prendre votre ancrage."
            : "Impossible d’ouvrir la caméra. Vérifiez qu’elle n’est pas utilisée ailleurs.",
        )
      }
    }

    void startCamera()

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [screen, cameraAttempt])

  const goTo = (nextScreen: Screen, nextTransition: Transition) => {
    setTransition(nextTransition)
    setScreen(nextScreen)
  }

  const navigate = (nextScreen: Screen) => {
    setMenuOpen(false)
    if (nextScreen !== screen) goTo(nextScreen, "fade")
  }

  const refreshCity = () => {
    const cityPromise = locateCity()
    cityPromiseRef.current = cityPromise
    void cityPromise.then(setCurrentCity)
  }

  const enterApp = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch {}
    goTo("home", "forward")
  }

  const installApp = async () => {
    setInstallMessage(null)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstallMessage("Le raccourci est déjà installé.")
      return
    }
    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      setInstallMessage(
        choice.outcome === "accepted"
          ? "Raccourci ajouté."
          : "Installation annulée.",
      )
      return
    }
    setInstallMessage(
      /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? "Dans Safari, touche Partager puis « Sur l’écran d’accueil »."
        : "Ouvre le menu du navigateur puis choisis « Installer l’application ».",
    )
  }

  const openCamera = () => {
    setSelected([])
    setCurrentImage(null)
    setDraftMemoryId(null)
    setCurrentCity(unknownCity)
    refreshCity()
    goTo("camera", "forward")
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !cameraReady) return

    const side = Math.min(video.videoWidth, video.videoHeight)
    const sourceX = (video.videoWidth - side) / 2
    const sourceY = (video.videoHeight - side) / 2
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(video, sourceX, sourceY, side, side, 0, 0, side, side)
    setCurrentImage(canvas.toDataURL("image/jpeg", 0.92))
    refreshCity()
    goTo("validate", "forward")
  }

  const uploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") return
      setCurrentImage(reader.result)
      refreshCity()
      goTo("validate", "forward")
    }
    reader.readAsDataURL(file)
    event.target.value = ""
  }

  const toggleConcept = (id: number) => {
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    )
  }

  const confirmPhoto = async () => {
    if (!currentImage || selected.length === 0 || isSaving) return

    setIsSaving(true)
    setSaveError(null)
    try {
      const city = (await cityPromiseRef.current) || currentCity
      const existingMemory = draftMemoryId
        ? memories.find((memory) => memory.id === draftMemoryId)
        : undefined
      const imageBlob = await fetch(currentImage).then((result) => result.blob())
      const storedMemory: StoredMemory = {
        id: draftMemoryId || crypto.randomUUID(),
        listId: existingMemory?.listId || currentListId,
        image: imageBlob,
        concepts: currentLabels,
        createdAt: existingMemory?.createdAt || Date.now(),
        city,
      }
      await saveMemory(storedMemory)

      const imageUrl = URL.createObjectURL(imageBlob)
      memoryUrlsRef.current.add(imageUrl)
      const memory: Memory = {
        ...storedMemory,
        image: imageUrl,
      }

      setConcepts((items) =>
        items.map((concept) =>
          selected.includes(concept.id)
            ? { ...concept, validated: true }
            : concept,
        ),
      )
      setMemories((items) => {
        const exists = items.some((item) => item.id === memory.id)
        const previous = items.find((item) => item.id === memory.id)
        if (previous?.image.startsWith("blob:")) {
          URL.revokeObjectURL(previous.image)
          memoryUrlsRef.current.delete(previous.image)
        }
        return exists
          ? items.map((item) => (item.id === memory.id ? memory : item))
          : [memory, ...items]
      })
      setDraftMemoryId(memory.id)
      goTo("summary", "forward")
    } catch {
      setSaveError(
        "La photo n’a pas pu être enregistrée sur cet appareil. Vérifie l’espace disponible et réessaie.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  const continueAfterSummary = () => {
    goTo(complete ? "congratulations" : "home", "forward")
    setSelected([])
    setCurrentImage(null)
    setDraftMemoryId(null)
  }

  const refreshUnchecked = () => {
    setConcepts((items) => {
      const replacements = pickConcepts(
        items.filter((concept) => !concept.validated).length,
        items.map((concept) => concept.label),
      )
      let replacementIndex = 0
      return items.map((concept) =>
        concept.validated
          ? concept
          : { ...concept, label: replacements[replacementIndex++] },
      )
    })
    setRefreshVersion((version) => version + 1)
  }

  const startRefreshPull = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    refreshGestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      distance: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveRefreshPull = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (refreshGestureRef.current.pointerId !== event.pointerId) return
    const distance = Math.min(
      maximumRefreshPull,
      Math.max(0, event.clientY - refreshGestureRef.current.startY),
    )
    refreshGestureRef.current.distance = distance
    setRefreshPull(distance)
  }

  const finishRefreshPull = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (refreshGestureRef.current.pointerId !== event.pointerId) return
    const shouldRefresh =
      refreshGestureRef.current.distance >= refreshPullThreshold
    refreshGestureRef.current.pointerId = null
    refreshGestureRef.current.distance = 0
    setRefreshPull(0)
    if (shouldRefresh) refreshUnchecked()
  }

  const cancelRefreshPull = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (refreshGestureRef.current.pointerId !== event.pointerId) return
    refreshGestureRef.current.pointerId = null
    refreshGestureRef.current.distance = 0
    setRefreshPull(0)
  }

  const startNewList = () => {
    setConcepts(makeConcepts())
    setCurrentListId(Date.now().toString())
    setSelected([])
    setCurrentImage(null)
    setDraftMemoryId(null)
    goTo("home", "forward")
  }

  const openMemory = (id: string) => {
    setSelectedMemoryId(id)
    goTo("consultation", "forward")

    const memory = memories.find((item) => item.id === id)
    const coordinates = memory?.city.match(storedCoordinatesPattern)
    if (!coordinates) return

    setMemories((items) =>
      items.map((item) =>
        item.id === id ? { ...item, city: unknownCity } : item,
      ),
    )
    void reverseGeocodeCity(
      Number(coordinates[1]),
      Number(coordinates[2]),
    )
      .catch(() => unknownCity)
      .then((city) => {
        setMemories((items) =>
          items.map((item) => (item.id === id ? { ...item, city } : item)),
        )
        void updateMemoryCity(id, city).catch(() => undefined)
      })
  }

  const deleteMemory = async (id: string) => {
    try {
      await removeMemory(id)
      const deletedMemory = memories.find((memory) => memory.id === id)
      if (deletedMemory?.image.startsWith("blob:")) {
        URL.revokeObjectURL(deletedMemory.image)
        memoryUrlsRef.current.delete(deletedMemory.image)
      }
      setMemories((items) => items.filter((memory) => memory.id !== id))
      setSelectedMemoryId(null)
      goTo("gallery", "back")
    } catch {
      setSaveError("La photo n’a pas pu être supprimée de cet appareil.")
    }
  }

  if (screen === "splash") {
    return (
      <main
        className={`splash-screen screen-transition transition-${transition}`}
      >
        <div className="paper-background" aria-hidden="true" />
        <img className="splash-anchor" src="/assets/50493.svg" alt="" />
        <p className="splash-copy">
          Petits défis photographiques pour s’occuper l’esprit.
        </p>
        <button className="splash-start" onClick={enterApp}>
          <span>C’est parti</span>
          <img src="/assets/f118f.svg" alt="" />
        </button>
      </main>
    )
  }

  if (screen === "camera") {
    return (
      <main
        className={`camera-screen screen-transition transition-${transition}`}
      >
        <IconButton
          src="/assets/a5943.svg"
          label="Retour aux défis"
          onClick={() => goTo("home", "back")}
          className="camera-back"
        />
        <div className="camera-viewport">
          <video
            ref={videoRef}
            className="camera-preview"
            autoPlay
            muted
            playsInline
            onLoadedMetadata={() => setCameraReady(true)}
          />
          <div className="photo-filter" aria-hidden="true" />
          {cameraError && (
            <div className="camera-error" role="alert">
              <p>{cameraError}</p>
              <button
                onClick={() => setCameraAttempt((attempt) => attempt + 1)}
              >
                Réessayer
              </button>
              <button onClick={() => imageInputRef.current?.click()}>
                Charger une image
              </button>
            </div>
          )}
          {!cameraError && !cameraReady && (
            <p className="camera-loading" role="status">
              Ouverture de la caméra…
            </p>
          )}
        </div>
        <button
          className="shutter"
          disabled={!cameraReady || Boolean(cameraError)}
          aria-label="Prendre une photo"
          onClick={capturePhoto}
        >
          <img src="/assets/d56d1.svg" alt="" />
        </button>
        <div className="camera-concepts" aria-label="Concepts à trouver">
          {concepts
            .filter((concept) => !concept.validated)
            .map((concept) => (
              <p key={concept.id}>{concept.label}</p>
            ))}
        </div>
        <canvas ref={canvasRef} className="capture-canvas" />
        <input
          ref={imageInputRef}
          className="image-input"
          type="file"
          accept="image/*"
          onChange={uploadImage}
        />
      </main>
    )
  }

  if (screen === "validate" && currentImage) {
    return (
      <PaperScreen className="validation-screen" transition={transition}>
        <TopNavigation
          onBack={() => goTo("camera", "back")}
          onMenu={() => setMenuOpen(true)}
        />
        <section className="polaroid validation-card">
          <Photo image={currentImage} />
          <div className="selection-list">
            {concepts.map((concept) => {
              const isSelected = selected.includes(concept.id)
              return (
                <button
                  className={`selection-row ${isSelected ? "is-selected" : ""}`}
                  key={concept.id}
                  onClick={() => toggleConcept(concept.id)}
                >
                  <img
                    src={isSelected ? "/assets/604fc.svg" : "/assets/e8c30.svg"}
                    alt=""
                  />
                  <span className={concept.validated ? "validated" : ""}>
                    {concept.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        <IconButton
          src={selected.length ? "/assets/21035.svg" : "/assets/e46df.svg"}
          label={isSaving ? "Enregistrement en cours" : "Confirmer la photo"}
          onClick={confirmPhoto}
          disabled={selected.length === 0 || isSaving}
          className={`confirm-button ${
            selected.length && !isSaving ? "" : "is-disabled"
          }`}
        />
        {saveError && (
          <p className="save-error" role="alert">
            {saveError}
          </p>
        )}
        {menuOpen && (
          <Menu
            onClose={() => setMenuOpen(false)}
            onNavigate={navigate}
            onInstall={installApp}
            installMessage={installMessage}
          />
        )}
      </PaperScreen>
    )
  }

  if (screen === "summary" && currentImage) {
    return (
      <PaperScreen className="summary-screen" transition={transition}>
        <TopNavigation
          onBack={() => goTo("validate", "back")}
          onMenu={() => setMenuOpen(true)}
        />
        <section className="polaroid summary-card">
          <Photo image={currentImage} />
          <div className="summary-labels">
            {currentLabels.map((label) => (
              <p key={label}>{label}</p>
            ))}
          </div>
        </section>
        <IconButton
          src="/assets/15c3e.svg"
          label={complete ? "Terminer la liste" : "Continuer les défis"}
          onClick={continueAfterSummary}
          className="large-action"
        />
        {menuOpen && (
          <Menu
            onClose={() => setMenuOpen(false)}
            onNavigate={navigate}
            onInstall={installApp}
            installMessage={installMessage}
          />
        )}
      </PaperScreen>
    )
  }

  if (screen === "congratulations") {
    return (
      <PaperScreen className="congratulations-screen" transition={transition}>
        <PageHeader title="Bravo !" />
        <section className="completion-grid" aria-label="Défis terminés">
          {memories
            .filter((memory) => memory.listId === currentListId)
            .flatMap((memory) =>
              memory.concepts.map((concept) => (
                <article
                  className="polaroid completion-card"
                  key={`${memory.id}-${concept}`}
                >
                  <Photo image={memory.image} />
                  <h2>{concept}</h2>
                </article>
              )),
            )}
          <div className="completion-actions">
            <div className="completion-mark" aria-label="Sérénité">
              😌
            </div>
            <IconButton
              src="/assets/15c3e.svg"
              label="Commencer une nouvelle liste"
              onClick={startNewList}
              className="completion-next"
            />
          </div>
        </section>
      </PaperScreen>
    )
  }

  if (screen === "gallery") {
    return (
      <PaperScreen className="gallery-screen" transition={transition}>
        <PageHeader
          title="Gallerie"
          onBack={() => goTo("home", "back")}
          onMenu={() => setMenuOpen(true)}
        />
        {memories.length ? (
          <section className="gallery-grid" aria-label="Historique des photos">
            {memories.map((memory) => (
              <button
                className="gallery-thumbnail"
                key={memory.id}
                onClick={() => openMemory(memory.id)}
                aria-label={`Consulter la photo : ${memory.concepts.join(", ")}`}
              >
                <Photo image={memory.image} />
              </button>
            ))}
          </section>
        ) : (
          <p className="empty-gallery">
            Tes prochaines photos apparaîtront ici.
          </p>
        )}
        {menuOpen && (
          <Menu
            onClose={() => setMenuOpen(false)}
            onNavigate={navigate}
            onInstall={installApp}
            installMessage={installMessage}
          />
        )}
      </PaperScreen>
    )
  }

  if (screen === "consultation" && selectedMemory) {
    const date = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
    }).format(selectedMemory.createdAt)
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(selectedMemory.createdAt)

    return (
      <PaperScreen className="consultation-screen" transition={transition}>
        <TopNavigation
          onBack={() => goTo("gallery", "back")}
          onMenu={() => setMenuOpen(true)}
        />
        <div className="memory-meta">
          <p>Pris à {selectedMemory.city}</p>
          <p>
            Le {date} à {time}
          </p>
        </div>
        <section className="polaroid consultation-card">
          <Photo image={selectedMemory.image} />
          <div className="summary-labels">
            {selectedMemory.concepts.map((label) => (
              <p key={label}>{label}</p>
            ))}
          </div>
        </section>
        <button
          className="delete-memory"
          onClick={() => deleteMemory(selectedMemory.id)}
        >
          Supprimer
        </button>
        {menuOpen && (
          <Menu
            onClose={() => setMenuOpen(false)}
            onNavigate={navigate}
            onInstall={installApp}
            installMessage={installMessage}
          />
        )}
      </PaperScreen>
    )
  }

  return (
    <PaperScreen className="home-screen" transition={transition}>
      <PageHeader title="Défis" onMenu={() => setMenuOpen(true)} />
      <p className="home-intro">
        Pas le temps d’expliquer !
        <br />
        Cherche autour de toi et trouve...
      </p>
      <section className="home-content">
        <div
          className={`challenge-list ${refreshVersion > 0 ? "reloading" : ""}`}
          key={refreshVersion}
          aria-label="Défis sensoriels"
        >
          {concepts.map((concept) => (
            <p
              className={`challenge ${concept.validated ? "validated" : ""}`}
              key={concept.id}
            >
              {concept.label}
            </p>
          ))}
        </div>
        <IconButton
          src="/assets/669ee.svg"
          label="Ouvrir l’appareil photo"
          onClick={openCamera}
          className="camera-fab"
        />
        <button
          className={`refresh-button ${
            refreshPull >= refreshPullThreshold ? "is-ready" : ""
          } ${refreshPull > 0 ? "is-pulling" : ""}`}
          onPointerDown={startRefreshPull}
          onPointerMove={moveRefreshPull}
          onPointerUp={finishRefreshPull}
          onPointerCancel={cancelRefreshPull}
          style={{
            transform: `translateY(${refreshPull}px)`,
          }}
        >
          <span>Tirer pour recharger</span>
          <img src="/assets/03578.svg" alt="" />
        </button>
      </section>
      {menuOpen && (
        <Menu
          onClose={() => setMenuOpen(false)}
          onNavigate={navigate}
          onInstall={installApp}
          installMessage={installMessage}
        />
      )}
    </PaperScreen>
  )
}

function PaperScreen({
  className,
  transition,
  children,
}: {
  className: string
  transition: Transition
  children: React.ReactNode
}) {
  return (
    <main
      className={`paper-screen screen-transition transition-${transition} ${className}`}
    >
      <div className="paper-background" aria-hidden="true" />
      {children}
    </main>
  )
}

function IconButton({
  src,
  label,
  onClick,
  disabled = false,
  className = "",
}: {
  src: string
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <img src={src} alt="" />
    </button>
  )
}

function PageHeader({
  title,
  onBack,
  onMenu,
}: {
  title?: string
  onBack?: () => void
  onMenu?: () => void
}) {
  return (
    <>
      <header className="page-header">
        {onBack && (
          <IconButton
            src="/assets/2405d.svg"
            label="Retour"
            onClick={onBack}
            className="header-back"
          />
        )}
        {onMenu && (
          <IconButton
            src="/assets/e9205.svg"
            label="Ouvrir le menu"
            onClick={onMenu}
            className="header-menu"
          />
        )}
      </header>
      {title && <h1 className="page-title">{title}</h1>}
    </>
  )
}

function TopNavigation({
  onBack,
  onMenu,
}: {
  onBack: () => void
  onMenu: () => void
}) {
  return <PageHeader onBack={onBack} onMenu={onMenu} />
}

function Photo({ image }: { image: string }) {
  return (
    <div className="photo">
      <img src={image} alt="Ancrage sensoriel photographié" />
      <div className="photo-filter" aria-hidden="true" />
    </div>
  )
}

function Menu({
  onClose,
  onNavigate,
  onInstall,
  installMessage,
}: {
  onClose: () => void
  onNavigate: (screen: Screen) => void
  onInstall: () => void
  installMessage: string | null
}) {
  return (
    <div className="menu-screen menu-transition" role="dialog" aria-modal>
      <IconButton
        src="/assets/fa09e.svg"
        label="Fermer le menu"
        onClick={onClose}
        className="menu-close"
      />
      <div className="menu-intro">
        <p>Besoin d’une diversion ?</p>
        <p>
          Tu es au bon endroit. Voici une liste de défis photographiques pour
          t’occuper l’esprit le temps qu’il faudra.
        </p>
      </div>
      <nav className="menu-links" aria-label="Navigation principale">
        <button onClick={() => onNavigate("home")}>Défis</button>
        <button onClick={() => onNavigate("gallery")}>Gallerie</button>
        <button className="install-shortcut" onClick={onInstall}>
          Ajouter ⚓ sur l’écran d’accueil
        </button>
        {installMessage && (
          <p className="install-message" role="status">
            {installMessage}
          </p>
        )}
      </nav>
      <div className="menu-mark" aria-label="Sérénité">
        😌
      </div>
    </div>
  )
}
