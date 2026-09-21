// Phase 10. Loads a shop catalogue from a CSV (and a folder of photos).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node backend/seed/catalogue.mjs --ref=<project ref> path/to/catalogue.csv [--images=dir] [--dry-run] [--update-stock]
//
// The CSV's columns are `catalogue.template.csv`. Export the partner's sheet
// to CSV with those headers. `--images` defaults to an `images/` folder beside
// the CSV; the `image` column names a file in it.
//
// Same `--ref` guard as seed.mjs: the operator names the project, and the
// script refuses if the URL disagrees. ALWAYS `--dry-run` first — it checks
// every row and every photo and writes nothing.
//
// Idempotent on `sku` (stored as `products.legacy_id`). Re-running updates
// name, prices, category, GST, photo and flags — but NOT stock, unless
// `--update-stock` is passed. Stock moves with every sale, so a second import
// of last week's sheet must not refill a shelf that has been selling.
//
// Products missing from the CSV are left alone. To take one off sale, keep its
// row and set `active` to no.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const ref = flag('ref')
const dryRun = args.includes('--dry-run')
const updateStock = args.includes('--update-stock')
const csvPath = args.find((a) => !a.startsWith('--'))
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function die(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!ref || !csvPath) die('Usage: node backend/seed/catalogue.mjs --ref=<project ref> catalogue.csv [--images=dir] [--dry-run] [--update-stock]')
if (!dryRun && (!url || !key)) die('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or pass --dry-run).')
if (url && !url.includes(ref)) die(`--ref says ${ref}, SUPABASE_URL says ${url}. One of them is wrong.`)

const imagesDir = flag('images') ?? path.join(path.dirname(csvPath), 'images')

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += '"', i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field), rows.push(row), (row = []), (field = '')
    } else field += c
  }
  if (field !== '' || row.length) row.push(field), rows.push(row)
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const REQUIRED = ['sku', 'name', 'category', 'price_rupees', 'stock', 'weight_grams']
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/** Rupees as typed in a sheet ("1,499", "640.50") to integer paise, or null. */
function paise(v) {
  const s = String(v ?? '').replace(/[₹,\s]/g, '')
  if (s === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN
  return Math.round(Number(s) * 100)
}

function yes(v, fallback) {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '') return fallback
  return ['yes', 'y', 'true', '1'].includes(s)
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''))
const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? []
const missing = REQUIRED.filter((h) => !header.includes(h))
if (missing.length) die(`CSV is missing columns: ${missing.join(', ')}. See backend/seed/catalogue.template.csv.`)

const problems = []
const skus = new Set()
const products = rows.map((cells, i) => {
  const line = i + 2
  const r = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]))
  const bad = (m) => problems.push(`line ${line} (${r.sku || 'no sku'}): ${m}`)

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(r.sku)) bad('sku must be letters, digits, . _ - (max 64)')
  if (skus.has(r.sku)) bad('duplicate sku')
  skus.add(r.sku)
  if (!r.name) bad('name is empty')
  if (!r.category) bad('category is empty')

  const price = paise(r.price_rupees)
  const mrp = paise(r.mrp_rupees)
  if (!(price > 0)) bad(`price_rupees "${r.price_rupees}" is not a positive amount`)
  if (Number.isNaN(mrp)) bad(`mrp_rupees "${r.mrp_rupees}" is not an amount`)
  if (mrp !== null && mrp < price) bad('mrp_rupees is below price_rupees')

  const stock = Number(r.stock)
  if (!Number.isInteger(stock) || stock < 0) bad(`stock "${r.stock}" must be a whole number, 0 or more`)
  const grams = Number(r.weight_grams)
  if (!Number.isInteger(grams) || grams <= 0) bad(`weight_grams "${r.weight_grams}" must be a whole number above 0`)

  // GST as a percent in the sheet, basis points in the database (rule 1).
  const gst = r.gst_percent === '' || r.gst_percent === undefined ? 0 : Number(r.gst_percent)
  if (!Number.isFinite(gst) || gst < 0 || gst > 28) bad(`gst_percent "${r.gst_percent}" must be 0 to 28`)

  let imageFile = null
  if (r.image) {
    imageFile = path.join(imagesDir, r.image)
    if (!MIME[path.extname(r.image).toLowerCase()]) bad(`image "${r.image}" must be .jpg, .png or .webp`)
    else if (!fs.existsSync(imageFile)) bad(`image "${r.image}" not found in ${imagesDir}`)
    else if (fs.statSync(imageFile).size > 5 * 1024 * 1024) bad(`image "${r.image}" is over 5 MB`)
  }

  return {
    sku: r.sku,
    name: r.name,
    subtitle: r.subtitle || null,
    category: r.category,
    subcategory: r.subcategory || null,
    price_paise: price,
    mrp_paise: mrp,
    stock,
    weight_grams: grams,
    tax_rate_bps: Math.round(gst * 100),
    featured: yes(r.featured, false),
    active: yes(r.active, true),
    imageFile,
  }
})

if (problems.length) die(`${problems.length} problem(s), nothing written:\n  ${problems.join('\n  ')}`)

console.log(`${products.length} products, ${new Set(products.map((p) => p.category)).size} categories, ` +
  `${products.filter((p) => p.imageFile).length} photos — all valid.`)
if (dryRun) {
  console.log('Dry run: nothing written.')
  process.exit(0)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// Categories and subcategories, in the order the sheet first mentions them.
const catId = new Map()
const subId = new Map()
for (const [i, name] of [...new Set(products.map((p) => p.category))].entries()) {
  const { data, error } = await db
    .from('shop_categories')
    .upsert({ name, sort: i + 1 }, { onConflict: 'name' })
    .select('id')
    .single()
  if (error) die(`category ${name}: ${error.message}`)
  catId.set(name, data.id)
}
for (const p of products.filter((x) => x.subcategory)) {
  const k = `${p.category}/${p.subcategory}`
  if (subId.has(k)) continue
  const { data, error } = await db
    .from('shop_subcategories')
    .upsert({ category_id: catId.get(p.category), name: p.subcategory, sort: subId.size + 1 },
            { onConflict: 'category_id,name' })
    .select('id')
    .single()
  if (error) die(`subcategory ${k}: ${error.message}`)
  subId.set(k, data.id)
}

let created = 0
let updated = 0
for (const p of products) {
  let image_url
  if (p.imageFile) {
    const ext = path.extname(p.imageFile).toLowerCase()
    const objectPath = `${p.sku}${ext}`
    const { error } = await db.storage
      .from('product-images')
      .upload(objectPath, fs.readFileSync(p.imageFile), { contentType: MIME[ext], upsert: true })
    if (error) die(`photo for ${p.sku}: ${error.message}`)
    // The version query busts the browser cache when a photo is replaced
    // under the same name.
    image_url = `${db.storage.from('product-images').getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`
  }

  const row = {
    legacy_id: p.sku,
    name: p.name,
    subtitle: p.subtitle,
    category_id: catId.get(p.category),
    subcategory_id: p.subcategory ? subId.get(`${p.category}/${p.subcategory}`) : null,
    price_paise: p.price_paise,
    mrp_paise: p.mrp_paise,
    weight_grams: p.weight_grams,
    tax_rate_bps: p.tax_rate_bps,
    featured: p.featured,
    active: p.active,
    ...(image_url ? { image_url } : {}),
  }

  const { data: existing } = await db.from('products').select('id').eq('legacy_id', p.sku).maybeSingle()
  const { error } = existing
    ? await db.from('products').update(updateStock ? { ...row, stock: p.stock } : row).eq('id', existing.id)
    : await db.from('products').insert({ ...row, stock: p.stock })
  if (error) die(`product ${p.sku}: ${error.message}`)
  existing ? updated++ : created++
}

console.log(`Done on ${ref}: ${created} created, ${updated} updated${updateStock ? ' (stock overwritten)' : ' (stock kept)'}.`)
