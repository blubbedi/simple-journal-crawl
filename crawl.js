const MODULE_ID = "simple-journal-crawl";
let crawlAudioMuted = false;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "triggerScene", {
    name: "Trigger-Szene",
    hint: "Szene, bei deren Aktivierung der Crawl startet (leer lassen für keinen automatischen Start).",
    scope: "world",
    config: true,
    type: String,
    choices: () => {
      const list = { "": "-- Deaktiviert --" };
      for (const scene of game.scenes) {
        list[scene.id] = scene.name;
      }
      return list;
    },
    default: ""
  });

  game.settings.register(MODULE_ID, "targetJournal", {
    name: "Journal-Eintrag",
    hint: "Das Journal, dessen Seiten für den Crawl genutzt werden.",
    scope: "world",
    config: true,
    type: String,
    choices: () => {
      const list = { "": "-- Kein Journal gewaehlt --" };
      for (const j of game.journal) {
        list[j.id] = j.name;
      }
      return list;
    },
    default: ""
  });

  game.settings.register(MODULE_ID, "scrollSpeed", {
    name: "Scroll-Geschwindigkeit",
    hint: "Pixel pro Sekunde (Standard: 40). Hoeher = schneller.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 10, max: 150, step: 5 },
    default: 40
  });

  game.settings.register(MODULE_ID, "fadeStyle", {
    name: "Ein- und Ausblenden (Fading)",
    hint: "Waehle die optische Blende fuer den Lauftext.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "mask": "Kino-Maske (Oben & Unten weich verlaufend)",
      "fadeFull": "Globales Ein- & Ausblenden (Gesamtebene)",
      "both": "Kombiniert (Kino-Maske + Ein-/Ausblenden)",
      "none": "Kein Fading (Hart abgeschnitten)"
    },
    default: "mask"
  });
});

Hooks.on("canvasReady", async (canvas) => {
  const triggerSceneId = game.settings.get(MODULE_ID, "triggerScene");
  if (!triggerSceneId) return;

  if (canvas.scene?.id === triggerSceneId) {
    crawlAudioMuted = false;
    await playSceneAudio(canvas.scene);
    await startJournalCrawl();
  } else {
    cleanupCrawl();
  }
});

function resolveScenePlaylist(scene) {
  if (!scene) return null;
  // 1. Direktes Dokument
  if (scene.playlist?.playAll) return scene.playlist;
  // 2. ID-Referenz ueber game.playlists
  if (typeof scene.playlist === "string") return game.playlists.get(scene.playlist);
  // 3. Neuere Foundry-Attribute
  if (scene.playlistSound) {
    const pl = game.playlists.find(p => p.sounds.has(scene.playlistSound));
    if (pl) return pl;
  }
  return null;
}

async function playSceneAudio(scene) {
  if (crawlAudioMuted) return;

  try {
    if (game.audio?.unlock) {
      await game.audio.unlock();
    }

    const playlist = resolveScenePlaylist(scene);
    if (playlist) {
      if (!playlist.playing) {
        await playlist.playAll();
      }
    } else {
      // Fallback: Falls die Szene Ambient-Sounds auf dem Canvas besitzt
      if (canvas.sounds?.objects?.children?.length) {
        for (const sound of canvas.sounds.objects.children) {
          sound.play();
        }
      }
    }
  } catch (err) {
    console.warn("[Simple Journal Crawl] Audio-Start blockiert oder fehlgeschlagen:", err);
  }
}

async function stopSceneAudio(scene) {
  try {
    const playlist = resolveScenePlaylist(scene);
    if (playlist && playlist.playing) {
      await playlist.stopAll();
    }
    if (canvas.sounds?.objects?.children?.length) {
      for (const sound of canvas.sounds.objects.children) {
        sound.stop();
      }
    }
  } catch (err) {
    console.warn("[Simple Journal Crawl] Audio-Stopp fehlgeschlagen:", err);
  }
}

function cleanupCrawl() {
  document.getElementById("simple-crawl-container")?.remove();
  document.getElementById("simple-crawl-audio-btn")?.remove();
  document.getElementById("simple-crawl-style")?.remove();
}

async function startJournalCrawl(overrideJournalId = null) {
  cleanupCrawl();

  const journalId = overrideJournalId || game.settings.get(MODULE_ID, "targetJournal");
  const journal = game.journal.get(journalId);

  if (!journal) {
    ui.notifications.warn("[Simple Journal Crawl] Bitte waehle ein gueltiges Journal in den Modul-Einstellungen.");
    return;
  }

  let pagesHtml = [];
  for (const page of journal.pages) {
    let raw = (page.type === "text" && page.text?.content) ? page.text.content : (page.system?.content ?? "");
    if (raw) {
      const enriched = await TextEditor.enrichHTML(raw, { secrets: true, documents: true, async: true });
      pagesHtml.push(`
        <div class="crawl-page-block" style="margin-bottom: 5rem;">
          <h2 style="color: #c9a55c; border-bottom: 1px solid rgba(201,165,92,0.4); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">${page.name}</h2>
          ${enriched}
        </div>
      `);
    }
  }

  if (pagesHtml.length === 0) return;

  const speed = game.settings.get(MODULE_ID, "scrollSpeed") || 40;
  const fade = game.settings.get(MODULE_ID, "fadeStyle") || "mask";

  const container = document.createElement("div");
  container.id = "simple-crawl-container";
  container.innerHTML = `<div id="simple-crawl-content">${pagesHtml.join("")}</div>`;
  document.body.appendChild(container);

  // Audio An/Aus Toggle-Button
  const audioBtn = document.createElement("button");
  audioBtn.id = "simple-crawl-audio-btn";
  audioBtn.innerHTML = "🔊 Ton an";
  audioBtn.title = "Szenen-Audio ein-/ausschalten";
  document.body.appendChild(audioBtn);

  audioBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    crawlAudioMuted = !crawlAudioMuted;

    if (crawlAudioMuted) {
      await stopSceneAudio(canvas.scene);
      audioBtn.innerHTML = "🔇 Ton aus";
      audioBtn.classList.add("muted");
    } else {
      audioBtn.innerHTML = "🔊 Ton an";
      audioBtn.classList.remove("muted");
      await playSceneAudio(canvas.scene);
    }
  });

  const contentEl = document.getElementById("simple-crawl-content");
  const totalHeight = contentEl.offsetHeight;
  const screenHeight = window.innerHeight;
  const duration = Math.max(15, Math.round((totalHeight + screenHeight) / speed));

  const maskRule = (fade === "mask" || fade === "both")
    ? `
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%);
    `
    : "";

  const containerAnimation = (fade === "fadeFull" || fade === "both")
    ? `animation: containerFade ${duration}s ease-in-out forwards;`
    : "";

  const style = document.createElement("style");
  style.id = "simple-crawl-style";
  style.innerHTML = `
    #simple-crawl-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.4);
      z-index: 60;
      overflow: hidden;
      display: flex;
      justify-content: center;
      pointer-events: none;
      ${maskRule}
      ${containerAnimation}
    }
    #simple-crawl-content {
      position: absolute;
      top: 0;
      width: 65%;
      max-width: 850px;
      color: #f0e6d2;
      font-family: var(--font-primary, sans-serif);
      font-size: 1.4rem;
      line-height: 2.1;
      text-align: center;
      text-shadow: 0 0 10px #000, 0 0 20px rgba(0,0,0,0.9);
      animation: runCrawl ${duration}s linear forwards;
      pointer-events: none;
    }
    #simple-crawl-content a.content-link {
      background: none !important;
      border: none !important;
      color: #c9a55c !important;
    }
    #simple-crawl-content table {
      margin: 2rem auto;
      border-collapse: collapse;
    }
    #simple-crawl-content td, #simple-crawl-content th {
      padding: 0.5rem 1.5rem;
    }
    #simple-crawl-audio-btn {
      position: fixed;
      right: 325px; /* Rueckt den Button sauber vor die Foundry-Sidebar */
      bottom: 25px;
      z-index: 9999;
      background: rgba(18, 18, 22, 0.9);
      color: #ffdf9e;
      border: 1px solid #c9a55c;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 1rem;
      font-weight: bold;
      font-family: var(--font-primary, sans-serif);
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
      transition: all 0.2s ease;
    }
    #simple-crawl-audio-btn:hover {
      background: rgba(30, 30, 40, 1);
      border-color: #ffd700;
      color: #ffffff;
      transform: scale(1.05);
    }
    #simple-crawl-audio-btn.muted {
      color: #999999;
      border-color: rgba(140, 140, 140, 0.4);
      background: rgba(15, 15, 18, 0.85);
      transform: none;
    }
    @keyframes runCrawl {
      0% { transform: translateY(${screenHeight}px); }
      100% { transform: translateY(-${totalHeight + 100}px); }
    }
    @keyframes containerFade {
      0% { opacity: 0; }
      5% { opacity: 1; }
      92% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  contentEl.addEventListener("animationend", () => {
    cleanupCrawl();
  }, { once: true });
}

window.startJournalCrawl = startJournalCrawl;
window.cleanupJournalCrawl = cleanupCrawl;