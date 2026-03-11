import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

async function checkSquareSetup() {
  console.log('\n=== Square Multi-Party Payment Setup Check ===\n');

  try {
    // Check environment variables
    console.log('1. Environment Variables:');
    const requiredVars = [
      'SQUARE_APPLICATION_ID',
      'SQUARE_APPLICATION_SECRET',
      'SQUARE_ACCESS_TOKEN',
      'NEXT_PUBLIC_SQUARE_ENVIRONMENT',
      'NEXT_PUBLIC_APP_URL'
    ];

    let allVarsPresent = true;
    requiredVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        console.log(`   ✓ ${varName}: ${value.substring(0, 20)}...`);
      } else {
        console.log(`   ✗ ${varName}: MISSING`);
        allVarsPresent = false;
      }
    });

    if (!allVarsPresent) {
      console.log('\n⚠️  Missing environment variables. Check .env.local\n');
      return;
    }

    // Check vendors
    console.log('\n2. Vendor Square Connections:');
    const { data: vendors } = await client.models.Vendor.list();

    if (!vendors || vendors.length === 0) {
      console.log('   ⚠️  No vendors found in database\n');
      return;
    }

    let connectedCount = 0;
    vendors.forEach(vendor => {
      const connected = !!vendor.squareAccessToken;
      if (connected) {
        connectedCount++;
        console.log(`   ✓ ${vendor.name} - Connected`);
        console.log(`     Location ID: ${vendor.squareLocationId}`);
        console.log(`     Connected: ${new Date(vendor.squareConnectedAt).toLocaleDateString()}`);
      } else {
        console.log(`   ✗ ${vendor.name} - Not Connected`);
      }
    });

    console.log(`\n   Total: ${connectedCount}/${vendors.length} vendors connected`);

    // Check bundles
    console.log('\n3. Bundle Configuration:');
    const { data: bundles } = await client.models.Bundle.list();

    if (!bundles || bundles.length === 0) {
      console.log('   ℹ️  No bundles configured yet\n');
    } else {
      for (const bundle of bundles) {
        console.log(`\n   Bundle: ${bundle.name}`);
        console.log(`   Price: $${bundle.price}`);
        console.log(`   Services: ${bundle.serviceIds?.length || 0}`);
        
        if (bundle.vendorIds && bundle.vendorIds.length > 0) {
          console.log(`   Vendors: ${bundle.vendorIds.length}`);
          
          // Check if all vendors in bundle are connected
          const allConnected = bundle.vendorIds.every(vendorId => {
            const vendor = vendors.find(v => v.vendorId === vendorId);
            return vendor && vendor.squareAccessToken;
          });
          
          if (allConnected) {
            console.log(`   ✓ All vendors connected - Ready for split payments`);
          } else {
            console.log(`   ⚠️  Some vendors not connected - Split payments will fail`);
          }
        } else {
          console.log(`   ⚠️  No vendorIds array - Update bundle schema`);
        }
      }
    }

    // Summary
    console.log('\n=== Summary ===\n');
    
    if (allVarsPresent && connectedCount > 0) {
      console.log('✓ Environment configured');
      console.log(`✓ ${connectedCount} vendor(s) connected to Square`);
      console.log('✓ Ready for multi-party payments\n');
      console.log('Next steps:');
      console.log('1. Ensure all vendors connect their Square accounts');
      console.log('2. Create bundles with services from multiple vendors');
      console.log('3. Test bundle booking with split payments\n');
    } else {
      console.log('⚠️  Setup incomplete\n');
      if (!allVarsPresent) {
        console.log('→ Add missing environment variables to .env.local');
      }
      if (connectedCount === 0) {
        console.log('→ Vendors need to connect Square accounts in Dashboard → Settings');
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error checking setup:', error.message);
  }
}

checkSquareSetup();
