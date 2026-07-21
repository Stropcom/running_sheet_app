/**
 * Quick test: call the Directions API via the Manus proxy and log
 * the raw html_instructions from each step, so we can see what
 * the extractRoadName function is working with.
 */

import dotenv from "dotenv";
import { readFileSync } from "fs";

// Load env from .env or process.env
try {
  const env = readFileSync("/home/ubuntu/running_sheet_app/.env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const BASE_URL = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, "");
const API_KEY  = process.env.BUILT_IN_FORGE_API_KEY;

if (!BASE_URL || !API_KEY) {
  console.error("Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY");
  process.exit(1);
}

async function makeRequest(endpoint, params) {
  const url = new URL(`${BASE_URL}/v1/maps/proxy${endpoint}`);
  url.searchParams.append("key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Test with two Perth addresses
const origin = "27 Olding Way, Melville WA";
const destination = "58 Duncraig Road, Applecross WA";

console.log(`\nGeocoding origin: "${origin}"`);
const geoOrigin = await makeRequest("/maps/api/geocode/json", {
  address: origin + ", Western Australia, Australia",
  region: "au",
});
console.log("Geocode status:", geoOrigin.status);
if (geoOrigin.results?.[0]) {
  console.log("Origin geocoded to:", geoOrigin.results[0].geometry.location);
  console.log("Origin formatted:", geoOrigin.results[0].formatted_address);
}

console.log(`\nGeocoding destination: "${destination}"`);
const geoDest = await makeRequest("/maps/api/geocode/json", {
  address: destination + ", Western Australia, Australia",
  region: "au",
});
console.log("Geocode status:", geoDest.status);
if (geoDest.results?.[0]) {
  console.log("Destination geocoded to:", geoDest.results[0].geometry.location);
  console.log("Destination formatted:", geoDest.results[0].formatted_address);
}

if (geoOrigin.status !== "OK" || geoDest.status !== "OK") {
  console.error("\nGeocoding failed — cannot test directions");
  process.exit(1);
}

const oLoc = geoOrigin.results[0].geometry.location;
const dLoc = geoDest.results[0].geometry.location;

console.log("\nCalling Directions API...");
const directions = await makeRequest("/maps/api/directions/json", {
  origin: `${oLoc.lat},${oLoc.lng}`,
  destination: `${dLoc.lat},${dLoc.lng}`,
  mode: "driving",
  region: "au",
});

console.log("Directions status:", directions.status);
if (directions.status !== "OK") {
  console.error("Directions failed:", JSON.stringify(directions));
  process.exit(1);
}

const steps = directions.routes[0].legs[0].steps;
console.log(`\nRoute has ${steps.length} steps:\n`);
for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  console.log(`Step ${i + 1}:`);
  console.log(`  html_instructions: ${s.html_instructions}`);
  // Also show what our extractor would produce
  const boldRe = /<b>([^<]+)<\/b>/g;
  const boldMatches = [];
  let bm;
  while ((bm = boldRe.exec(s.html_instructions)) !== null) boldMatches.push(bm[1]);
  console.log(`  bold segments: ${JSON.stringify(boldMatches)}`);
  const plain = s.html_instructions.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log(`  plain text: ${plain}`);
  console.log();
}
