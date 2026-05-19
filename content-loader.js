// ============================================================
// Content Loader
// Lädt content.json und macht sie global verfügbar
// ============================================================

window.ContentLoader = {
  async load() {
    try {
      const response = await fetch('content.json');
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Konnte content.json nicht laden:', err);
      return { items: [], categories: {} };
    }
  },
};
