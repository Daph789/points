import ffmpeg from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);
const active = new Set();
const fail = (code, status = 400) => Object.assign(new Error(code), { status });
export async function convertChatGif(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 13 || !['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString())) throw fail('invalid_chat_media');
  if (bytes.length > 20 * 1024 * 1024) throw fail('chat_gif_too_large', 413);
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
  if (!width || !height || width * height > 4096 * 4096) throw fail('invalid_chat_media');
  const dir = await mkdtemp(join(tmpdir(), 'donoss-gif-'));
  try {
    const input = join(dir, 'input.gif'), output = join(dir, 'output.mp4');
    await writeFile(input, bytes);
    const { stdout } = await run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-threads','1','-filter_threads','1','-ignore_loop','1','-i',input,
      '-t','61','-an','-vf',"fps=20,scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
      '-c:v','libx264','-threads','1','-preset','veryfast','-crf','28','-maxrate','300k','-bufsize','600k','-movflags','+faststart','-progress','pipe:1',output], { timeout: 45000, maxBuffer: 1024 * 1024 });
    const times = [...stdout.matchAll(/out_time_us=(\d+)/g)].map(match => Number(match[1]));
    if (Math.max(0,...times) > 60 * 1000000) throw fail('chat_gif_too_long');
    const result = await readFile(output);
    if (result.length > 3 * 1024 * 1024) throw fail('chat_media_too_large', 413);
    return { url: `data:video/mp4;base64,${result.toString('base64')}`, type: 'video/mp4' };
  } catch (error) {
    if (error.status) throw error;
    throw fail('chat_gif_conversion_failed', 422);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export function registerChatGifRoutes(app, deps, rawParser) {
  for (const side of [false,true]) {
    const path = side ? '/api/social-plans/:id/side-group/:status/gif' : '/api/social-plans/:id/chat/gif';
    app.post(path, async (req,res,next) => {
      try {
        const auth = await deps.getAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({error:auth.error});
        const profile = await deps.ensureProfileForUser(auth.user);
        const access = side ? await deps.getSideGroupAccess(req.params.id,profile,req.params.status) : await deps.getSocialPlanChatAccess(req.params.id,profile);
        if (!access.allowed) return res.status(403).json({error:access.reason});
        if (active.has(profile.id) || active.size >= 2) return res.status(429).json({error:'chat_gif_busy'});
        req.gifUser = profile.id; active.add(profile.id);
        res.once('close', () => { if (!req.gifConverting) active.delete(profile.id); });
        next();
      } catch (_) { res.status(500).json({error:'chat_gif_conversion_failed'}); }
    }, (req,res,next) => rawParser(req,res,error => {
      if (error) { active.delete(req.gifUser); return res.status(413).json({error:'chat_gif_too_large'}); }
      next();
    }), async (req,res) => {
      req.gifConverting = true;
      try { res.set('Cache-Control','no-store'); res.json(await convertChatGif(req.body)); }
      catch (error) { res.status(error.status || 500).json({error:error.message}); }
      finally { active.delete(req.gifUser); }
    });
  }
}
