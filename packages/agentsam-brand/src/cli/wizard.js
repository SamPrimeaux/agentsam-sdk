/**
 * Interactive brand promote wizard — generic, prompt-injected.
 * No product identity branches. Cloudflare discovery is optional CLI enhancement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { inspectBrandAsset, isExcludedIntermediate } from '../core/inspect.js';
import { formatBytesKb } from '../core/derivatives.js';
import { getDerivativePreset, listDerivativePresets } from '../presets/index.js';
import { expandHome, scanDropFolder, waitForDrop, resolveSourceInput } from '../core/ingest.js';
import { buildBrandPack } from '../core/pack.js';
import { previewBrandPack } from '../core/preview.js';
import { MemoryStorageAdapter } from '../adapters/memory.js';
import { FilesystemStorageAdapter } from '../adapters/filesystem.js';
import { CloudflareR2StorageAdapter } from '../adapters/cloudflare-r2.js';
import { CloudflareImagesDeliveryAdapter } from '../adapters/cloudflare-images.js';

async function downloadUrl(url, destPath, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function r2Configured(env = process.env) {
  return Boolean(String(env.CLOUDFLARE_ACCOUNT_ID || '').trim()
    && (String(env.CLOUDFLARE_API_TOKEN || '').trim()
      || String(env.R2_ACCESS_KEY_ID || '').trim()));
}

export async function runBrandPromoteWizard(options = {}) {
  const p = options.prompts;
  if (!p?.select || !p?.text || !p?.confirm) throw new Error('wizard_prompts_required');
  const cwd = path.resolve(options.cwd || process.cwd());
  const workDir = path.join(cwd, '.agentsam', 'brand', 'work', `promote-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });

  const cancelled = (value) => {
    if (p.isCancel?.(value)) {
      p.cancel?.('Brand promote cancelled.');
      return true;
    }
    return false;
  };

  p.intro?.('Brand asset promotion');

  // 1. Source
  const sourceKind = await p.select({
    message: 'How will you provide the master asset?',
    options: [
      { value: 'path', label: 'Local file path', hint: 'drag-drop works' },
      { value: 'url', label: 'URL / link' },
      { value: 'drop', label: 'Drop-in folder', hint: '.agentsam/brand/inbox' },
      { value: 'stdin', label: 'Stdin bytes', hint: 'pipe image → agentsam brand promote --source -' },
    ],
  });
  if (cancelled(sourceKind)) return { cancelled: true, stage: 'source' };

  let sourcePath = null;
  let markPath = null;

  if (sourceKind === 'path') {
    const answer = await p.text({
      message: 'File path',
      placeholder: './assets/logo-master.png',
      validate: (v) => {
        const abs = expandHome(v);
        if (!abs || !fs.existsSync(abs)) return 'File not found';
        if (isExcludedIntermediate(abs)) return 'Tracing / .pbm intermediates are not product assets';
        return undefined;
      },
    });
    if (cancelled(answer)) return { cancelled: true, stage: 'source' };
    const abs = expandHome(answer);
    const inspected = inspectBrandAsset(abs);
    if (inspected.content_type === 'image/svg+xml') markPath = abs;
    else sourcePath = abs;
  } else if (sourceKind === 'url') {
    const answer = await p.text({
      message: 'Asset URL',
      placeholder: 'https://…',
      validate: (v) => {
        try {
          const u = new URL(String(v || ''));
          if (!/^https?:$/.test(u.protocol)) return 'http(s) URL required';
          return undefined;
        } catch {
          return 'Invalid URL';
        }
      },
    });
    if (cancelled(answer)) return { cancelled: true, stage: 'source' };
    const url = String(answer).trim();
    const ext = path.extname(new URL(url).pathname) || '.png';
    const dest = path.join(workDir, `download${ext}`);
    p.note?.(`Fetching ${url}`, 'Download');
    await downloadUrl(url, dest, options.fetchImpl);
    const inspected = inspectBrandAsset(dest);
    if (inspected.content_type === 'image/svg+xml') markPath = dest;
    else sourcePath = dest;
  } else if (sourceKind === 'stdin') {
    p.note?.(
      'Stdin mode works best scripted:\n  cat master.png | agentsam brand promote --brand acme --asset logo --source - --preset logo',
      'Stdin',
    );
    if (!process.stdin.isTTY) {
      const ingested = await resolveSourceInput({ source: '-', workDir, cwd });
      sourcePath = ingested.path;
    } else {
      p.cancel?.('No piped stdin — re-run with a pipe or pick another source.');
      return { cancelled: true, stage: 'source' };
    }
  } else {
    const defaultDrop = path.join(cwd, '.agentsam', 'brand', 'inbox');
    fs.mkdirSync(defaultDrop, { recursive: true });
    const answer = await p.text({
      message: 'Drop folder',
      initialValue: defaultDrop,
      placeholder: '.agentsam/brand/inbox',
      validate: (v) => {
        const abs = expandHome(v);
        if (!abs) return 'Folder required';
        try {
          fs.mkdirSync(abs, { recursive: true });
          return undefined;
        } catch {
          return 'Cannot create folder';
        }
      },
    });
    if (cancelled(answer)) return { cancelled: true, stage: 'source' };
    const dir = expandHome(answer);
    const wait = await p.confirm({
      message: 'Wait for a file to appear (watch)?',
      initialValue: false,
    });
    if (cancelled(wait)) return { cancelled: true, stage: 'source' };

    let scan;
    try {
      scan = wait ? await waitForDrop({ dir, timeoutMs: 120_000 }) : scanDropFolder(dir);
    } catch (err) {
      p.cancel?.(err?.message || 'Drop folder empty');
      return { cancelled: true, stage: 'source' };
    }
    sourcePath = scan.sourcePath || null;
    markPath = scan.markPath || null;
    if (!sourcePath && !markPath) {
      p.cancel?.('No usable PNG/SVG found.');
      return { cancelled: true, stage: 'source' };
    }
    p.note?.(
      [
        sourcePath ? `source heuristic: ${path.basename(sourcePath)} (largest PNG)` : null,
        markPath ? `mark heuristic: ${path.basename(markPath)}` : null,
        'Override later by editing the manifest if needed.',
      ].filter(Boolean).join('\n'),
      'Scan heuristics (overridable)',
    );
  }

  // 2. Identity — never seed agentsam / product paths
  const brand = await p.text({
    message: 'Brand id (slug — never an account id)',
    placeholder: 'acme',
    validate: (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(s)) return 'Invalid id';
      if (s === 'agentsam' || s === 'agent-sam') return 'Use your customer brand slug — not a product name';
      return undefined;
    },
  });
  if (cancelled(brand)) return { cancelled: true, stage: 'identity' };

  const assetType = await p.select({
    message: 'Asset role',
    options: [
      { value: 'app-icon', label: 'App icon' },
      { value: 'logo', label: 'Logo' },
      { value: 'favicon', label: 'Favicon' },
      { value: 'og-image', label: 'OG / social image' },
      { value: 'mark', label: 'Mark' },
      { value: 'photography', label: 'Photography' },
      { value: 'illustration', label: 'Illustration' },
      { value: 'custom', label: 'Custom id…' },
    ],
  });
  if (cancelled(assetType)) return { cancelled: true, stage: 'identity' };

  let asset = assetType;
  if (assetType === 'custom') {
    const custom = await p.text({
      message: 'Asset id',
      validate: (v) => (/^[a-z0-9][a-z0-9._-]*$/i.test(String(v || '').trim()) ? undefined : 'Invalid id'),
    });
    if (cancelled(custom)) return { cancelled: true, stage: 'identity' };
    asset = String(custom).trim().toLowerCase();
  }

  const version = await p.text({
    message: 'Version',
    initialValue: 'v1',
    validate: (v) => (/^[a-z0-9][a-z0-9._-]*$/i.test(String(v || '').trim()) ? undefined : 'Invalid'),
  });
  if (cancelled(version)) return { cancelled: true, stage: 'identity' };

  const identity = {
    brand: String(brand).trim().toLowerCase(),
    asset: String(asset).trim().toLowerCase(),
    version: String(version).trim().toLowerCase(),
  };

  // SEO (once per asset) — mirrored into pack manifest + CF Images metadata
  const altText = await p.text({
    message: 'Alt text (SEO / a11y)',
    placeholder: `${identity.brand} ${identity.asset}`,
  });
  if (cancelled(altText)) return { cancelled: true, stage: 'seo' };
  const seoTitle = await p.text({
    message: 'Title (optional)',
    placeholder: '',
  });
  if (cancelled(seoTitle)) return { cancelled: true, stage: 'seo' };
  const seoDescription = await p.text({
    message: 'Description (optional)',
    placeholder: '',
  });
  if (cancelled(seoDescription)) return { cancelled: true, stage: 'seo' };

  const seo = {
    alt_text: String(altText || '').trim() || null,
    title: String(seoTitle || '').trim() || null,
    description: String(seoDescription || '').trim() || null,
  };

  // 3. Derivatives — declarative presets only
  const presets = listDerivativePresets();
  const defaultPreset = ['app-icon', 'logo', 'favicon', 'og-image'].includes(identity.asset)
    ? identity.asset
    : 'none';
  const variantChoice = await p.select({
    message: 'Derivative strategy',
    options: [
      { value: 'none', label: 'Original only' },
      ...presets.map((pr) => ({
        value: pr.id,
        label: pr.label,
        hint: pr.description,
      })),
      { value: 'custom', label: 'Custom (enter --derive style later via manifest)' },
    ],
    initialValue: defaultPreset === 'none' ? 'none' : defaultPreset,
  });
  if (cancelled(variantChoice)) return { cancelled: true, stage: 'derivatives' };

  let derivatives = [];
  let presetId = null;
  if (variantChoice !== 'none' && variantChoice !== 'custom') {
    presetId = variantChoice;
    derivatives = getDerivativePreset(variantChoice)?.derivatives || [];
  }

  // 4. Destinations — storage vs delivery are separate layers
  const storageOptions = [
    { value: 'local', label: 'Local filesystem', hint: '.agentsam/brand-store' },
    { value: 'memory', label: 'In-memory (plan / test)' },
    { value: 'plan_only', label: 'Plan + receipt only', hint: 'no storage write' },
  ];
  if (r2Configured()) {
    storageOptions.unshift({
      value: 'r2',
      label: 'Cloudflare R2',
      hint: 'wrangler r2 object put (slug-keyed)',
    });
  }

  const destChoice = await p.select({
    message: 'Storage destination',
    options: storageOptions,
  });
  if (cancelled(destChoice)) return { cancelled: true, stage: 'destinations' };

  let storageAdapter = null;
  let planOnly = destChoice === 'plan_only';
  let storageDest = null;
  if (destChoice === 'local') {
    storageAdapter = new FilesystemStorageAdapter({
      rootDir: path.join(cwd, '.agentsam', 'brand-store'),
    });
    storageDest = { provider: 'filesystem', root: '.agentsam/brand-store' };
  } else if (destChoice === 'memory') {
    storageAdapter = new MemoryStorageAdapter();
    storageDest = { provider: 'memory' };
  } else if (destChoice === 'r2') {
    const bucket = await p.text({
      message: 'R2 bucket name',
      placeholder: 'agentsam-assets',
      validate: (v) => (String(v || '').trim() ? undefined : 'Bucket required'),
    });
    if (cancelled(bucket)) return { cancelled: true, stage: 'destinations' };
    storageAdapter = new CloudflareR2StorageAdapter({
      bucket: String(bucket).trim(),
      cwd,
    });
    storageDest = { provider: 'cloudflare-r2', bucket: String(bucket).trim() };
  } else {
    storageDest = { provider: 'plan_only' };
  }

  // Cloudflare Images is DELIVERY — only offer when configured; verify against API
  const deliveryProbe = new CloudflareImagesDeliveryAdapter();
  const caps = await deliveryProbe.capabilities();
  let useDelivery = false;
  let deliveryAdapter = null;
  let deliveryDest = null;

  if (caps.configured && caps.account_resolved) {
    const verify = await deliveryProbe.verifyConnection();
    p.note?.(
      [
        'Cloudflare Images',
        `  Account id     ${verify.config?.account_id || '—'}`,
        `  Account hash   ${verify.config?.account_hash || '— (set CLOUDFLARE_IMAGES_ACCOUNT_HASH)'}`,
        `  Delivery base  ${verify.config?.delivery_base || '—'}`,
        `  Authentication ● API token (${verify.config?.token_env || 'unknown'})`,
        `  Permission     ${verify.config?.permission || caps.required_permission}`,
        `  Policy         ${caps.policy || 'canonical_png'}`,
        verify.authorized
          ? '  Credential    verified against Cloudflare ✓'
          : `  Credential    ${verify.error || 'not verified'}`,
      ].join('\n'),
      'Delivery capability',
    );
    if (verify.authorized) {
      const answer = await p.confirm({
        message: 'Also publish to Cloudflare Images (real Images API)?',
        initialValue: false,
      });
      if (cancelled(answer)) return { cancelled: true, stage: 'destinations' };
      useDelivery = Boolean(answer);
      if (useDelivery) {
        deliveryAdapter = deliveryProbe;
        deliveryDest = {
          provider: 'cloudflare-images',
          account_id: verify.config.account_id,
          account_hash: verify.config.account_hash || null,
          metadata: { ...seo },
        };
      }
    } else {
      p.note?.(
        'Images API not authorized — continuing with storage only. Token needs Account → Images → Write.',
        'Delivery',
      );
    }
  } else {
    p.note?.(
      [
        'Cloudflare Images',
        '  ○ not connected',
        '',
        'Set:',
        '  CLOUDFLARE_ACCOUNT_ID',
        '  CLOUDFLARE_IMAGES_ACCOUNT_HASH',
        '  CLOUDFLARE_IMAGES_API_TOKEN  (Account → Images → Write)',
        '',
        'Optional fallback: CLOUDFLARE_API_TOKEN (broader session).',
        'Storage can still proceed without Images.',
      ].join('\n'),
      'Delivery capability',
    );
    const continueStorage = await p.confirm({
      message: 'Continue with storage only (no Cloudflare Images)?',
      initialValue: true,
    });
    if (cancelled(continueStorage) || !continueStorage) {
      p.cancel?.('Aborted — connect Cloudflare Images or choose storage-only.');
      return { cancelled: true, stage: 'destinations' };
    }
  }

  // 5. Layout review
  const prefix = `brands/${identity.brand}/${identity.asset}/${identity.version}`;
  p.note?.(
    [
      `Prefix: ${prefix}/`,
      `Derivatives: ${derivatives.length}`,
      `Storage: ${storageDest.provider}`,
      `Delivery: ${deliveryDest ? deliveryDest.provider : '— not requested'}`,
      `SEO alt: ${seo.alt_text || '—'}`,
    ].join('\n'),
    'Layout',
  );

  const accept = await p.confirm({ message: 'Accept layout?', initialValue: true });
  if (cancelled(accept) || !accept) {
    p.cancel?.('Aborted.');
    return { cancelled: true, stage: 'layout' };
  }

  // 6. Inventory
  const inventory = [];
  if (sourcePath) {
    const row = inspectBrandAsset(sourcePath, { role: 'source' });
    inventory.push({
      role: row.role,
      path: row.path,
      dims: row.width ? `${row.width}×${row.height}` : '—',
      size_label: formatBytesKb(row.bytes),
    });
  }
  if (markPath) {
    const row = inspectBrandAsset(markPath, { role: 'vector.mark' });
    inventory.push({
      role: row.role,
      path: row.path,
      dims: '—',
      size_label: formatBytesKb(row.bytes),
    });
  }
  p.note?.(
    inventory.map((r) => `✓ ${r.role.padEnd(14)} ${String(r.dims).padEnd(9)} ${String(r.size_label).padStart(8)}  ${r.path}`).join('\n') || '(empty)',
    'Inventory',
  );

  // 6b. Pack + preview (local zip + gallery — before cloud publish)
  let packResult = null;
  const wantPack = await p.confirm({
    message: 'Write zip brand pack?',
    initialValue: true,
  });
  if (cancelled(wantPack)) return { cancelled: true, stage: 'pack' };

  if (wantPack) {
    const zipPath = path.join(
      cwd,
      '.agentsam',
      'brand',
      'packs',
      `${identity.brand}-${identity.asset}-${identity.version}.zip`,
    );
    packResult = await buildBrandPack({
      brand: identity.brand,
      asset: identity.asset,
      version: identity.version,
      sourcePath,
      markPath,
      preset: presetId || 'app-icon',
      derivatives,
      zipPath,
      altText: seo.alt_text,
      title: seo.title,
      description: seo.description,
      cwd,
    });
    p.note?.(
      [`Pack: ${packResult.root}`, packResult.zip ? `Zip: ${packResult.zip}` : null].filter(Boolean).join('\n'),
      'Brand pack',
    );

    const wantPreview = await p.confirm({
      message: 'Open localhost preview gallery?',
      initialValue: true,
    });
    if (cancelled(wantPreview)) return { cancelled: true, stage: 'preview' };
    if (wantPreview) {
      await previewBrandPack({
        from: packResult.root,
        cwd,
        open: true,
        waitForEnter: true,
        write: (s) => process.stdout.write(s),
      });
    }
  }

  // 7. Approve cloud promote
  const publish = await p.confirm({
    message: planOnly ? 'Write local receipt only?' : 'Proceed with promote / publish?',
    initialValue: false,
  });
  if (cancelled(publish) || !publish) {
    p.cancel?.('Nothing published to storage/delivery.');
    return {
      cancelled: true,
      stage: 'approve',
      identity,
      inventory,
      pack: packResult,
    };
  }

  p.outro?.('Running promote…');

  const inputs = [];
  if (sourcePath) inputs.push({ id: 'source', role: 'source', path: sourcePath });
  if (markPath) inputs.push({ id: 'mark', role: 'vector.mark', path: markPath });

  return {
    cancelled: false,
    identity,
    inventory,
    planOnly,
    publish: !planOnly,
    pack: packResult,
    seo,
    storageAdapter,
    deliveryAdapter: useDelivery ? deliveryAdapter : null,
    spec: {
      brand: identity.brand,
      asset: identity.asset,
      version: identity.version,
      inputs,
      derivatives,
      seo,
      destinations: {
        storage: storageDest,
        delivery: deliveryDest,
        registry: null,
      },
    },
  };
}
