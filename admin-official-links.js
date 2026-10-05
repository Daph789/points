const columns = 'id, title, description, source_url, created_at, updated_at';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageSize = 50;

export function registerOfficialLinkRoutes(app, { supabaseAdmin, authenticateAdminAccess }) {
  function route(endpoint, handler) {
    app.post(`/api/admin/official-links/${endpoint}`, async (request, response) => {
      response.set('Cache-Control', 'no-store');
      try {
        // The default deliberately excludes secondary admins.
        const auth = await authenticateAdminAccess(request);
        if (auth.error) return response.status(auth.status || 401).json({ error: auth.error });
        await handler(request.body || {}, response);
      } catch (error) {
        console.error(`Official links ${endpoint} error:`, error.code || error.message);
        response.status(500).json({ error: ['42P01', 'PGRST205'].includes(error.code)
          ? 'Le répertoire n’est pas encore activé sur le serveur.'
          : 'Impossible de terminer cette opération. Réessaie dans un instant.' });
      }
    });
  }

  route('list', async (body, response) => {
    const offset = Number(body.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return response.status(400).json({ error: 'Page invalide.' });
    const search = String(body.search || '').trim();
    if (search.length > 200) return response.status(400).json({ error: 'Recherche trop longue (200 caractères maximum).' });
    let query = supabaseAdmin.from('admin_official_links').select(columns, { count: 'exact' });
    // Escape LIKE wildcards: a pasted URL or % must be searched literally.
    for (const word of search.split(/\s+/).filter(Boolean)) {
      query = query.ilike('search_text', `%${word.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const { data, error, count } = await query.order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    response.json({ links: data || [], total: count || 0, hasMore: offset + (data || []).length < (count || 0) });
  });

  route('save', async (body, response) => {
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const sourceUrl = String(body.source_url || '').trim();
    if (!title || title.length > 200 || description.length > 5000) {
      return response.status(400).json({ error: 'Ajoute un titre (200 caractères maximum) et une description de 5 000 caractères maximum.' });
    }
    let url;
    try { url = new URL(sourceUrl); } catch (_) {}
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || sourceUrl.length > 4000) {
      return response.status(400).json({ error: 'Colle une adresse complète commençant par https:// ou http://, sans identifiants.' });
    }
    if (body.id && !uuidPattern.test(body.id)) return response.status(400).json({ error: 'Lien invalide.' });
    const fields = { title, description, source_url: sourceUrl, updated_at: new Date().toISOString() };
    const table = supabaseAdmin.from('admin_official_links');
    const query = body.id ? table.update(fields).eq('id', body.id) : table.insert(fields);
    const { data, error } = await query.select(columns).maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Ce lien n’existe plus.' });
    response.status(body.id ? 200 : 201).json({ link: data });
  });

  route('delete', async (body, response) => {
    if (!uuidPattern.test(String(body.id || ''))) return response.status(400).json({ error: 'Lien invalide.' });
    const { data, error } = await supabaseAdmin.from('admin_official_links').delete().eq('id', body.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Ce lien n’existe plus.' });
    response.json({ ok: true });
  });
}
