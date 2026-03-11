import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const dataClient = generateClient();

async function getSquareLocation(vendorId) {
  try {
    const { data: vendor } = await dataClient.models.Vendor.get({ vendorId });

    if (!vendor) {
      console.error('Vendor not found');
      return;
    }

    if (!vendor.squareAccessToken) {
      console.error('Vendor not connected to Square');
      console.log('Vendor needs to connect their Square account in Dashboard → Settings');
      return;
    }

    const client = new Client({
      accessToken: vendor.squareAccessToken,
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
    });

    const { result } = await client.locationsApi.listLocations();

    console.log('\n=== Square Locations for', vendor.name, '===\n');
    
    if (!result.locations || result.locations.length === 0) {
      console.log('No locations found. Vendor needs to create a location in Square dashboard.');
      return;
    }

    result.locations.forEach((location, index) => {
      console.log(`Location ${index + 1}:`);
      console.log(`  ID: ${location.id}`);
      console.log(`  Name: ${location.name}`);
      console.log(`  Address: ${location.address?.addressLine1 || 'N/A'}`);
      console.log(`  Status: ${location.status}`);
      console.log('');
    });

    console.log('Primary Location ID (stored in database):', vendor.squareLocationId);
    
  } catch (error) {
    console.error('Error fetching Square locations:', error.message);
  }
}

const vendorId = process.argv[2];

if (!vendorId) {
  console.log('Usage: node scripts/get-square-location.js <vendorId>');
  console.log('Example: node scripts/get-square-location.js vendor-winsome');
  process.exit(1);
}

getSquareLocation(vendorId);
