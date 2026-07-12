// Test script: verify getRsMappingWaypoints returns correct viaStreets and suburbContext
// Run with: node test-trace.mjs

// Uses tRPC HTTP endpoint - fetch is built-in in Node 22

const BASE = 'http://localhost:3000';

// First login to get a session
async function main() {
  // Login with local credentials
  const loginRes = await fetch(`${BASE}/api/trpc/auth.login?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ "0": { json: { username: "strop", password: "Strop@2024" } } }),
  });
  const loginBody = await loginRes.text();
  const cookie = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginRes.status, loginBody.substring(0, 200));
  
  // Get operations
  const opsRes = await fetch(`${BASE}/api/trpc/operation.list?batch=1&input={"0":{"json":null}}`, {
    headers: { Cookie: cookie || '' },
  });
  const opsData = await opsRes.json();
  const ops = opsData[0]?.result?.data?.json || [];
  console.log('Operations:', ops.map(o => `${o.id}: ${o.name}`));
  
  // Find MATCH operation
  const matchOp = ops.find(o => o.name?.toUpperCase().includes('MATCH'));
  if (!matchOp) { console.log('No MATCH operation found'); return; }
  console.log('Using operation:', matchOp.id, matchOp.name);
  
  // Get sheets for this operation
  const sheetsRes = await fetch(`${BASE}/api/trpc/sheet.listByOperation?batch=1&input={"0":{"json":{"operationId":${matchOp.id}}}}`, {
    headers: { Cookie: cookie || '' },
  });
  const sheetsData = await sheetsRes.json();
  const sheets = sheetsData[0]?.result?.data?.json || [];
  console.log('Sheets:', sheets.map(s => `${s.id}: ${s.title}`));
  
  if (sheets.length === 0) { console.log('No sheets found'); return; }
  const sheet = sheets[0];
  
  // Get waypoints
  const wpRes = await fetch(`${BASE}/api/trpc/rsMapping.getWaypoints?batch=1&input={"0":{"json":{"sheetId":${sheet.id}}}}`, {
    headers: { Cookie: cookie || '' },
  });
  const wpData = await wpRes.json();
  const waypoints = wpData[0]?.result?.data?.json || [];
  
  console.log('\n=== WAYPOINTS WITH VIA STREETS ===');
  waypoints.forEach((wp, i) => {
    console.log(`\nWP ${i+1}: address="${wp.address}" suburbContext="${wp.suburbContext}"`);
    console.log(`  segmentType: ${wp.segmentType}`);
    if (wp.viaStreets?.length > 0) {
      console.log(`  viaStreets: ${JSON.stringify(wp.viaStreets)}`);
      // Show what geocoding queries would be built
      const suburb = wp.suburbContext?.replace(/\s*WA\s*\d*/i, '').trim() || '';
      const suburbHint = suburb ? `, ${suburb}` : '';
      wp.viaStreets.forEach(st => {
        console.log(`    GEOCODE QUERY: "${st}${suburbHint}, Australia"`);
      });
    }
  });
}

main().catch(console.error);
