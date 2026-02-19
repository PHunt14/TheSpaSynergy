// Run this with: node scripts/get-square-location.js YOUR_SANDBOX_ACCESS_TOKEN

const accessToken = process.argv[2];

if (!accessToken) {
  console.error('Usage: node scripts/get-square-location.js YOUR_SANDBOX_ACCESS_TOKEN');
  process.exit(1);
}

fetch('https://connect.squareupsandbox.com/v2/locations', {
  headers: {
    'Square-Version': '2024-01-18',
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
})
  .then(res => res.json())
  .then(data => {
    if (data.locations && data.locations.length > 0) {
      console.log('\n✅ Found locations:\n');
      data.locations.forEach(loc => {
        console.log(`Name: ${loc.name}`);
        console.log(`Location ID: ${loc.id}`);
        console.log(`Status: ${loc.status}`);
        console.log('---');
      });
    } else {
      console.log('No locations found or error:', data);
    }
  })
  .catch(err => {
    console.error('Error fetching locations:', err);
  });
