// Direct test of getRsMappingWaypoints via-street parsing
// Run with: npx tsx test-trace-direct.ts

import { getRsMappingWaypoints } from './server/db';

async function main() {
  const sheetId = 1230001;
  const waypoints = await getRsMappingWaypoints(sheetId);
  
  console.log(`\nWaypoints for sheet ${sheetId}:\n`);
  waypoints.forEach((wp, i) => {
    console.log(`WP ${i + 1} row=${wp.rowNumber} address="${wp.address}"`);
    console.log(`  segmentType=${wp.segmentType} suburbContext="${wp.suburbContext}"`);
    if (wp.viaStreets.length > 0) {
      console.log(`  viaStreets=${JSON.stringify(wp.viaStreets)}`);
    }
    console.log();
  });
}

main().catch(console.error).finally(() => process.exit(0));
