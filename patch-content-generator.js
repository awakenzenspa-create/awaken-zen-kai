/**
 * Run in Kai Codespace:
 *   node patch-content-generator.js
 *
 * Adds library asset matching to the weekly content generator:
 * - Fetches approved unused assets from Supabase before generating
 * - Matches assets to post slots by pillar + service tag
 * - Passes matched asset context to Claude so caption is written for that specific asset
 * - Pairs asset_id in approval_queue so engine shows asset + caption together
 * - Falls back to text-only post if no matching asset found
 */

const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

// ── 1. Add getLibraryAssets function before getMonthlySpecial ─────────────────
const oldGetMonthly = `async function getMonthlySpecial() {`;

const newGetAssets = `// ── Fetch approved library assets grouped by pillar ─────────────────────────
async function getLibraryAssets() {
  try {
    const { data, error } = await supabase
      .from('content_assets')
      .select('id, name, asset_type, pillar, service_tag, mood, notes, used_count, last_used_at')
      .eq('approved', true)
      .order('used_count', { ascending: true })  // least-used first
      .order('last_used_at', { ascending: true, nullsFirst: true }); // oldest use first

    if (error || !data) return {};

    // Group by pillar for easy lookup
    const byPillar = {};
    for (const asset of data) {
      if (!byPillar[asset.pillar]) byPillar[asset.pillar] = [];
      byPillar[asset.pillar].push(asset);
    }
    return byPillar;
  } catch (err) {
    console.error('[generate-content] getLibraryAssets error:', err.message);
    return {};
  }
}

// ── Match best asset for a post slot ─────────────────────────────────────────
function matchAsset(slot, libraryAssets) {
  const candidates = libraryAssets[slot.pillar] || [];
  if (!candidates.length) return null;

  // For service_showcase slots, prefer matching service type
  if (slot.pillar === 'service_showcase') {
    const theme = slot.theme.toLowerCase();
    const isMassage = theme.includes('massage') || theme.includes('deep tissue') || theme.includes('stone') || theme.includes('ashiatsu');
    const isFacial  = theme.includes('facial') || theme.includes('skin') || theme.includes('esthetic');

    const serviceMatch = candidates.find(a =>
      (isMassage && (a.service_tag === 'massage' || a.service_tag === 'both')) ||
      (isFacial  && (a.service_tag === 'facial'  || a.service_tag === 'both'))
    );
    if (serviceMatch) return serviceMatch;
  }

  // For reel slots prefer video, photo slots prefer photo
  if (slot.post_type === 'reel') {
    const video = candidates.find(a => a.asset_type === 'video');
    if (video) return video;
  }
  if (slot.post_type === 'photo') {
    const photo = candidates.find(a => a.asset_type === 'photo');
    if (photo) return photo;
  }

  // Default: return least-used asset for this pillar
  return candidates[0] || null;
}

async function getMonthlySpecial() {`;

code = code.replace(oldGetMonthly, newGetAssets);

// ── 2. Add libraryAssets to context gathering ─────────────────────────────────
const oldGather = `    const [monthlySpecial, trendingContext, weekDates] = await Promise.all([
      getMonthlySpecial(),
      researchTrend(),
      Promise.resolve(getNextWeekDates()),
    ]);
    console.log(\`[generate-content] Context: special=\${!!monthlySpecial}, trend=\${!!trendingContext}\`);`;

const newGather = `    const [monthlySpecial, trendingContext, weekDates, libraryAssets] = await Promise.all([
      getMonthlySpecial(),
      researchTrend(),
      Promise.resolve(getNextWeekDates()),
      getLibraryAssets(),
    ]);
    const totalAssets = Object.values(libraryAssets).flat().length;
    console.log(\`[generate-content] Context: special=\${!!monthlySpecial}, trend=\${!!trendingContext}, assets=\${totalAssets}\`);`;

code = code.replace(oldGather, newGather);

// ── 3. Add asset matching inside the generation loop ─────────────────────────
const oldLoop = `        const scheduledDate = weekDates[slot.day];
        if (!scheduledDate) continue;
        // Generate caption
        const { caption, hashtags } = await generatePost(
          slot,
          monthlySpecial,
          trendingContext
        );`;

const newLoop = `        const scheduledDate = weekDates[slot.day];
        if (!scheduledDate) continue;

        // Match a library asset to this slot
        const matchedAsset = matchAsset(slot, libraryAssets);
        let assetContext = null;
        if (matchedAsset) {
          assetContext = \`MATCHED ASSET FROM LIBRARY:\\nName: \${matchedAsset.name}\\nType: \${matchedAsset.asset_type}\\nService: \${matchedAsset.service_tag || 'general'}\\nMood: \${matchedAsset.mood || 'calming'}\\nNotes: \${matchedAsset.notes || 'No additional notes'}\\n\\nWrite the caption specifically for this asset — describe what the viewer sees/feels watching/viewing it.\`;
        }

        // Generate caption (with asset context if available)
        const { caption, hashtags } = await generatePost(
          slot,
          monthlySpecial,
          trendingContext || assetContext
        );`;

code = code.replace(oldLoop, newLoop);

// ── 4. Store asset_id in approval_queue insert ────────────────────────────────
const oldInsert = `        const { error: qErr } = await supabase
          .from('approval_queue')
          .insert({
            post_schedule_id:  postScheduleId,
            caption_text:      caption,
            hashtags:          hashtags,
            platform:          slot.platform,
            scheduled_for:     scheduledDate,
            status:            'pending',
            generation_prompt: \`\${slot.pillar} | \${slot.post_type} | \${slot.theme}\`,
          });`;

const newInsert = `        // Mark matched asset as used
        if (matchedAsset) {
          await supabase
            .from('content_assets')
            .update({ used_count: (matchedAsset.used_count || 0) + 1, last_used_at: new Date().toISOString() })
            .eq('id', matchedAsset.id);
        }

        const { error: qErr } = await supabase
          .from('approval_queue')
          .insert({
            post_schedule_id:  postScheduleId,
            asset_id:          matchedAsset?.id || null,
            caption_text:      caption,
            hashtags:          hashtags,
            platform:          slot.platform,
            scheduled_for:     scheduledDate,
            status:            'pending',
            generation_prompt: \`\${slot.pillar} | \${slot.post_type} | \${slot.theme}\${matchedAsset ? ' | asset:' + matchedAsset.name : ''}\`,
          });`;

code = code.replace(oldInsert, newInsert);

// ── 5. Update log line to show asset matching ─────────────────────────────────
const oldLog = "console.log(`[generate-content] ✓ ${slot.day} ${slot.platform} (${slot.pillar})`);";
const newLog = "console.log(`[generate-content] ✓ ${slot.day} ${slot.platform} (${slot.pillar})${matchedAsset ? ' + asset: ' + matchedAsset.name : ' [text-only]'}`);";

code = code.replace(oldLog, newLog);

fs.writeFileSync('index.js', code);
console.log('✓ index.js patched with library asset matching');
console.log('');
console.log('Changes made:');
console.log('  1. Added getLibraryAssets() — fetches approved assets from Supabase');
console.log('  2. Added matchAsset() — pairs best asset to each post slot');
console.log('  3. Generator passes asset context to Claude for tailored captions');
console.log('  4. asset_id saved in approval_queue so engine shows asset + caption');
console.log('  5. used_count incremented to rotate assets across weeks');
console.log('');
console.log('Next: git add -A && git commit -m "Content generator: match library assets to posts" && git push');