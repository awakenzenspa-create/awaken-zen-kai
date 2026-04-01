// jobs/socialImageGen.js
// Puppeteer-based HTML → PNG renderer for Social Flash templates
// Railway serves rendered images as static files at /social-flash/images/:filename
// Meta curls these URLs directly at post time — must be publicly accessible

const puppeteer  = require('puppeteer-core');
const chromium   = require('@sparticuz/chromium');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');

// Images are written here and served as static files by Express
const IMAGE_DIR = path.join(__dirname, '..', 'public', 'social-images');

// Ensure output directory exists on startup
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// ============================================================
// FORMAT DIMENSIONS
// ============================================================
const FORMAT_DIMENSIONS = {
  'story_9x16': { width: 1080, height: 1920 },
  'feed_1x1':   { width: 1080, height: 1080 },
  'feed_4x5':   { width: 1080, height: 1350 }
};

// ============================================================
// MAIN RENDER FUNCTION
// Accepts interpolated HTML + format, returns public image URL
// ============================================================
async function renderHtmlToPng(html, format) {
  const dims = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS['feed_1x1'];

  // Unique filename — hash of html content + timestamp
  const hash     = crypto.createHash('sha1').update(html + Date.now()).digest('hex').slice(0, 12);
  const filename = `flash_${format}_${hash}.png`;
  const filepath = path.join(IMAGE_DIR, filename);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args:            chromium.args,
      defaultViewport: { width: dims.width, height: dims.height },
      executablePath:  await chromium.executablePath(),
      headless:        chromium.headless,
    });

    const page = await browser.newPage();

    // Inject Google Fonts so templates render correctly
    const htmlWithFonts = injectFonts(html);

    await page.setContent(htmlWithFonts, { waitUntil: 'networkidle0' });

    // Set viewport explicitly to match format
    await page.setViewport({ width: dims.width, height: dims.height });

    // Small settle delay for font rendering
    await new Promise(r => setTimeout(r, 400));

    await page.screenshot({
      path:     filepath,
      type:     'png',
      clip:     { x: 0, y: 0, width: dims.width, height: dims.height }
    });

    console.log(`[SocialImageGen] Rendered ${filename} (${format} ${dims.width}x${dims.height})`);

    // Schedule cleanup after 2 hours — Meta only needs to curl once at post time
    scheduleCleanup(filepath, 2 * 60 * 60 * 1000);

    // Return the public URL Railway will serve
    const publicUrl = `${process.env.BASE_URL}/social-flash/images/${filename}`;
    return { imageUrl: publicUrl, filename, filepath };

  } catch (err) {
    console.error('[SocialImageGen] Render error:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================
// FONT INJECTION
// Loads Cormorant Garamond + Jost from Google Fonts
// Prepended to whatever HTML the template provides
// ============================================================
function injectFonts(html) {
  const fontLink = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
  `;

  // Insert after <head> if it exists, otherwise prepend
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${fontLink}`);
  }
  return fontLink + html;
}

// ============================================================
// CLEANUP — delete rendered PNGs after TTL
// Keeps Railway disk usage clean
// ============================================================
function scheduleCleanup(filepath, delayMs) {
  setTimeout(() => {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`[SocialImageGen] Cleaned up: ${path.basename(filepath)}`);
      }
    } catch (err) {
      console.error('[SocialImageGen] Cleanup error:', err.message);
    }
  }, delayMs);
}

// ============================================================
// STARTUP CLEANUP
// On server restart, purge any leftover images older than 2 hrs
// Prevents accumulation across deploys
// ============================================================
function purgeStaleImages() {
  try {
    if (!fs.existsSync(IMAGE_DIR)) return;
    const files    = fs.readdirSync(IMAGE_DIR);
    const cutoff   = Date.now() - 2 * 60 * 60 * 1000;
    let   purged   = 0;

    for (const file of files) {
      const fp   = path.join(IMAGE_DIR, file);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fp);
        purged++;
      }
    }

    if (purged > 0) {
      console.log(`[SocialImageGen] Startup purge: removed ${purged} stale image(s)`);
    }
  } catch (err) {
    console.error('[SocialImageGen] Startup purge error:', err.message);
  }
}

// Run purge immediately on module load
purgeStaleImages();

module.exports = { renderHtmlToPng, IMAGE_DIR };
