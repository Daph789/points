export function validateChatMedia(value) {
  if (value == null) return null;
  const match = typeof value === 'string' && value.match(/^data:(image\/(?:jpeg|png|webp|gif)|video\/mp4);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw Object.assign(new Error('invalid_chat_media'), { status: 400 });
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 3 * 1024 * 1024) throw Object.assign(new Error('chat_media_too_large'), { status: 413 });
  const type = match[1].split('/')[1];
  const valid = bytes.length > 12 && (
    (type === 'mp4' && bytes.subarray(4,8).toString() === 'ftyp') ||
    (type === 'jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (type === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (type === 'gif' && ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString())) ||
    (type === 'webp' && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'));
  if (!valid) throw Object.assign(new Error('invalid_chat_media'), { status: 400 });
  return { media_data_url: value, media_type: match[1] };
}

export function registerChatMediaRoutes(app, deps) {
  for (const side of [false, true]) {
    const route = side ? '/api/social-plans/:id/side-group/:status/messages/:messageId/media' : '/api/social-plans/:id/chat/:messageId/media';
    app.get(route, async (request, response) => {
      const { supabaseAdmin, getAuthenticatedUser, ensureProfileForUser, getSocialPlanChatAccess, getSideGroupAccess, getAcceptedSideMerge } = deps;
      if (!supabaseAdmin) return response.status(503).json({ error: 'media_unavailable' });
      try {
        const auth = await getAuthenticatedUser(request);
        if (auth.error) return response.status(auth.status).json({ error: auth.error });
        const profile = await ensureProfileForUser(auth.user);
        const access = side ? await getSideGroupAccess(request.params.id, profile, request.params.status) : await getSocialPlanChatAccess(request.params.id, profile);
        if (!access.allowed) return response.status(403).json({ error: access.reason });
        let query = supabaseAdmin.from(side ? 'social_plan_side_group_messages' : 'social_plan_messages')
          .select('media_data_url, media_type').eq('id', request.params.messageId).eq('plan_id', access.plan.id).is('deleted_at', null);
        if (side) {
          const merge = await getAcceptedSideMerge(access.plan.id);
          query = query.in('group_status', merge ? [merge.from_status, merge.to_status, 'merged'] : [access.status]);
        }
        const {data,error} = await query.maybeSingle();
        if (error) return response.status(500).json({ error: 'media_unavailable' });
        if (!data?.media_data_url) return response.status(404).json({ error: 'media_not_found' });
        response.set('Cache-Control', 'private, no-store');
        response.json({ data_url: data.media_data_url });
      } catch (_) { response.status(500).json({ error: 'media_unavailable' }); }
    });
  }
}
