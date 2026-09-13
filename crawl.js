// ==================== EINSTELLUNGEN ====================
const CRAWL_SETTINGS = {
  triggerScene: "Abspann",                      // Exakter Name der Ziel-Szene
  journalName: "Charakterliste (11.9.2026)",     // Name des Journals
  scrollSpeedPxPerSec: 40,                       // Scrolltempo (niedriger = langsamer)
  loop: false,                                   // true = wiederholt sich endlos; false = stoppt nach einem Durchlauf
  backgroundColor: "rgba(0, 0, 0, 0.75)"         // Hintergrund-Abdunklung
};
// =======================================================

Hooks.on("canvasReady", async (canvas) => {
  if (CRAWL_SETTINGS.triggerScene && canvas.scene?.name !== CRAWL_SETTINGS.triggerScene) {
    cleanupCrawl();
    return;
  }

  if (CRAWL_SETTINGS.triggerScene && canvas.scene?.name === CRAWL_SETTINGS.triggerScene) {
    await startJournalCrawl();
  }
});

function cleanupCrawl() {
  document.getElementById("simple-crawl-container")?.remove();
  document.getElementById("simple-crawl-style")?.remove();
}

async function startJournalCrawl() {
  cleanupCrawl();

  const journal = game.journal.getName(CRAWL_SETTINGS.journalName);
  if (!journal) {
    console.warn(`[Simple Journal Crawl] Journal "${CRAWL_SETTINGS.journalName}" wurde nicht gefunden.`);
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

  const container = document.createElement("div");
  container.id = "simple-crawl-container";
  container.title = "Klicken oder Escape druecken zum Beenden";
  container.innerHTML = `<div id="simple-crawl-content">${pagesHtml.join("")}</div>`;
  document.body.appendChild(container);

  const contentEl = document.getElementById("simple-crawl-content");
  const totalHeight = contentEl.offsetHeight;
  const screenHeight = window.innerHeight;
  const duration = Math.max(20, Math.round((totalHeight + screenHeight) / CRAWL_SETTINGS.scrollSpeedPxPerSec));
  const loopMode = CRAWL_SETTINGS.loop ? "infinite" : "forwards";

  const style = document.createElement("style");
  style.id = "simple-crawl-style";
  style.innerHTML = `
    #simple-crawl-container {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: ${CRAWL_SETTINGS.backgroundColor}; z-index: 9500; overflow: hidden;
      display: flex; justify-content: center; cursor: pointer;
    }
    #simple-crawl-content {
      position: absolute; top: 0; width: 65%; max-width: 850px;
      color: #f0e6d2; font-family: var(--font-primary, sans-serif);
      font-size: 1.4rem; line-height: 2.1; text-align: center;
      text-shadow: 0 0 10px #000, 0 0 20px rgba(0,0,0,0.9);
      animation: runCrawl ${duration}s linear ${loopMode};
    }
    #simple-crawl-content a.content-link {
      background: none !important; border: none !important; color: #c9a55c !important; pointer-events: none;
    }
    #simple-crawl-content table { margin: 2rem auto; border-collapse: collapse; }
    #simple-crawl-content td, #simple-crawl-content th { padding: 0.5rem 1.5rem; }
    @keyframes runCrawl {
      0% { transform: translateY(${screenHeight}px); }
      100% { transform: translateY(-${totalHeight + 100}px); }
    }
  `;
  document.head.appendChild(style);

  const close = () => cleanupCrawl();
  container.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  }, { once: true });
}

window.startJournalCrawl = startJournalCrawl;
window.cleanupJournalCrawl = cleanupCrawl;
