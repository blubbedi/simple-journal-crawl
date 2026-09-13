const MODULE_ID = "simple-journal-crawl";

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
});

Hooks.on("canvasReady", async (canvas) => {
  const triggerSceneId = game.settings.get(MODULE_ID, "triggerScene");
  if (!triggerSceneId) return;

  if (canvas.scene?.id === triggerSceneId) {
    // Versuche, den Audio-Kontext von Foundry zu entsperren & Szenen-Sound zu starten
    unlockAndPlaySceneAudio(canvas.scene);
    await startJournalCrawl();
  } else {
    cleanupCrawl();
  }
});

async function unlockAndPlaySceneAudio(scene) {
  try {
    // 1. Foundrys globalen Audio-Kontext freigeben
    if (game.audio?.unlock) {
      await game.audio.unlock();
    }

    // 2. Falls in der Szene eine Playlist hinterlegt ist, diese gezielt abspielen
    if (scene?.playlist) {
      const playlist = scene.playlist;
      if (!playlist.playing) {
        await playlist.playAll();
      }
    }
  } catch (err) {
    console.warn("[Simple Journal Crawl] Audio konnte nicht automatisch gestartet werden:", err);
  }
}

function cleanupCrawl() {
  document.getElementById("simple-crawl-container")?.remove();
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
  const container = document.createElement("div");
  container.id = "simple-crawl-container";
  container.innerHTML = `<div id="simple-crawl-content">${pagesHtml.join("")}</div>`;
  document.body.appendChild(container);

  const contentEl = document.getElementById("simple-crawl-content");
  const totalHeight = contentEl.offsetHeight;
  const screenHeight = window.innerHeight;
  const duration = Math.max(15, Math.round((totalHeight + screenHeight) / speed));

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
    @keyframes runCrawl {
      0% { transform: translateY(${screenHeight}px); }
      100% { transform: translateY(-${totalHeight + 100}px); }
    }
  `;
  document.head.appendChild(style);

  contentEl.addEventListener("animationend", () => {
    cleanupCrawl();
  }, { once: true });
}

window.startJournalCrawl = startJournalCrawl;
window.cleanupJournalCrawl = cleanupCrawl;